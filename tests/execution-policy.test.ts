import { expect, test } from "bun:test";
import {
  DEFAULT_EXECUTION_POLICY,
  NativeEgressBlockedError,
  executionPolicyFromEnvironment,
  nativeEgressAllowed,
  parseExecutionPolicy,
} from "../src/execution-policy";
import { forwardNativeCodexRequest, type NativeCodexEndpoint } from "../src/native-passthrough";

test("execution policy defaults to web-only and requires an explicit mixed opt-in", () => {
  expect(DEFAULT_EXECUTION_POLICY).toBe("web-only");
  expect(executionPolicyFromEnvironment({})).toBe("web-only");
  expect(parseExecutionPolicy("mixed")).toBe("mixed");
  expect(() => parseExecutionPolicy("native")).toThrow("expected \"web-only\" or \"mixed\"");
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
    await expect(forwardNativeCodexRequest(
      request,
      endpoint,
      fakeUpstream,
      undefined,
      { executionPolicy: "web-only" },
    )).rejects.toBeInstanceOf(NativeEgressBlockedError);
  }

  expect(upstreamCalls).toBe(0);
});

test("mixed policy preserves explicit native passthrough", async () => {
  let upstreamCalls = 0;
  const response = await forwardNativeCodexRequest(
    new Request("http://127.0.0.1:17841/v1/responses", {
      method: "POST",
      headers: {
        authorization: "Bearer test-codex-session",
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: "gpt-5.6-sol", input: [] }),
    }),
    "responses",
    async () => {
      upstreamCalls += 1;
      return new Response("data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } });
    },
    undefined,
    { executionPolicy: "mixed" },
  );

  expect(upstreamCalls).toBe(1);
  expect(response.status).toBe(200);
});
