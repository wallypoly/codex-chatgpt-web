import { expect, test } from "bun:test";
import { defaultConfig } from "../src/config";
import { startServer } from "../src/server";

test("web-only server rejects every native work endpoint before fake upstream", async () => {
  const config = { ...defaultConfig("browser-only"), port: 0 };
  let upstreamCalls = 0;
  const server = startServer(config, {
    fetchUpstream: async () => {
      upstreamCalls += 1;
      return new Response("unexpected native egress");
    },
  });
  const endpoint = `http://127.0.0.1:${server.port}`;
  try {
    for (const path of ["responses", "responses/compact"] as const) {
      const response = await fetch(`${endpoint}/v1/${path}`, {
        method: "POST",
        headers: { authorization: "Bearer should-not-forward", "content-type": "application/json" },
        body: JSON.stringify({ model: "gpt-5.6-sol", input: [] }),
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: { type: "invalid_request_error", code: "web_route_required" },
      });
    }

    for (const model of [undefined, 123] as const) {
      const response = await fetch(`${endpoint}/v1/responses`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...(model === undefined ? {} : { model }), input: [] }),
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code: "web_route_required" } });
    }

    for (const path of ["alpha/search", "images/generations", "images/edits"] as const) {
      const response = await fetch(`${endpoint}/v1/${path}`, {
        method: "POST",
        headers: { authorization: "Bearer should-not-forward", "content-type": "application/json" },
        body: JSON.stringify(path === "alpha/search" ? { query: "test" } : { prompt: "test" }),
      });
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({
        error: { type: "permission_error", code: "native_backend_forbidden" },
      });
    }
    expect(upstreamCalls).toBe(0);
    const health = await (await fetch(`${endpoint}/healthz`)).json() as Record<string, unknown>;
    expect(health.execution_policy).toBe("web-only");
  } finally {
    await server.stop(true);
  }
});
