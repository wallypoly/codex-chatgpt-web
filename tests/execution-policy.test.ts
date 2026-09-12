import { expect, test } from "bun:test";
import { defaultConfig } from "../src/config";
import {
  DEFAULT_EXECUTION_POLICY,
  NATIVE_BACKEND_FORBIDDEN_CODE,
  NativeEgressBlockedError,
  WEB_ROUTE_REQUIRED_CODE,
  nativeEgressAllowed,
  parseExecutionPolicy,
} from "../src/execution-policy";
import { forwardNativeCodexRequest, type NativeCodexEndpoint } from "../src/native-passthrough";

function nativeResponseRequest(): Request {
  return new Request("http://127.0.0.1:17841/v1/responses", {
    method: "POST",
    headers: {
      authorization: "Bearer test-codex-session",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: "gpt-5.6-sol", input: [] }),
  });
}

test("execution policy defaults fail closed and mixed requires explicit selection", () => {
  expect(DEFAULT_EXECUTION_POLICY).toBe("web-only");
  expect(parseExecutionPolicy(undefined)).toBe("web-only");
  expect(defaultConfig("browser-only").executionPolicy).toBe("web-only");
  expect(parseExecutionPolicy("mixed")).toBe("mixed");
  expect(() => parseExecutionPolicy("native")).toThrow('expected "web-only" or "mixed"');
  expect(NATIVE_BACKEND_FORBIDDEN_CODE).toBe("native_backend_forbidden");
  expect(WEB_ROUTE_REQUIRED_CODE).toBe("web_route_required");
});

test("web-only allows native model metadata but blocks native work endpoints", () => {
  expect(nativeEgressAllowed("web-only", "models")).toBeTrue();
  for (const endpoint of [
    "responses",
    "responses/compact",
    "alpha/search",
    "images/generations",
    "images/edits",
  ] as const) {
    expect(nativeEgressAllowed("web-only", endpoint)).toBeFalse();
  }
});

test("final native fetch boundary makes zero upstream calls for every blocked endpoint", async () => {
  const blocked: NativeCodexEndpoint[] = [
    "responses",
    "responses/compact",
    "alpha/search",
    "images/generations",
    "images/edits",
  ];
  let upstreamCalls = 0;
  const fakeUpstream = async (_request: Request): Promise<Response> => {
    upstreamCalls += 1;
    return new Response("unexpected");
  };

  for (const endpoint of blocked) {
    const request = new Request(`http://127.0.0.1:17841/v1/${endpoint}`, {
      method: "POST",
      headers: {
        authorization: "Bearer test-codex-session",
        "content-type": "application/json",
      },
      body: endpoint.startsWith("images/")
        ? JSON.stringify({ prompt: "test" })
        : JSON.stringify({ model: "gpt-5.6-sol", input: [] }),
    });
    await expect(forwardNativeCodexRequest(request, endpoint, "web-only", fakeUpstream))
      .rejects.toBeInstanceOf(NativeEgressBlockedError);
  }

  expect(upstreamCalls).toBe(0);
});


test("web-only final guard runs before native credential inspection", async () => {
  let upstreamCalls = 0;
  const request = new Request("http://127.0.0.1:17841/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "gpt-5.6-sol", input: [] }),
  });
  await expect(forwardNativeCodexRequest(request, "responses", "web-only", async () => {
    upstreamCalls += 1;
    return new Response("unexpected");
  })).rejects.toMatchObject({ code: "native_backend_forbidden" });
  expect(upstreamCalls).toBe(0);
});

test("web-only still permits native model metadata lookup", async () => {
  let upstreamCalls = 0;
  const response = await forwardNativeCodexRequest(
    new Request("http://127.0.0.1:17841/v1/models", {
      headers: { authorization: "Bearer test-codex-session" },
    }),
    "models",
    "web-only",
    async () => {
      upstreamCalls += 1;
      return Response.json({ models: [] });
    },
  );
  expect(upstreamCalls).toBe(1);
  expect(response.status).toBe(200);
});

test("mixed policy preserves explicit native passthrough", async () => {
  let upstreamCalls = 0;
  const response = await forwardNativeCodexRequest(
    nativeResponseRequest(),
    "responses",
    "mixed",
    async () => {
      upstreamCalls += 1;
      return new Response("data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } });
    },
  );
  expect(upstreamCalls).toBe(1);
  expect(response.status).toBe(200);
});
