import { expect, test } from "bun:test";
import { launcherCapabilityProbeRequired, setupProxyIsReady } from "../src/setup";
import { formatDoctorReport } from "../src/doctor";

const config = {
  mode: "browser-only" as const,
  releaseVersion: "0.2.0",
  executionPolicy: "web-only" as const,
};

test("setup accepts only a matching daemon that is ready for new Codex turns", () => {
  const ready = {
    service: "codex-chatgpt-web",
    status: "ok",
    mode: "browser-only",
    execution_policy: "web-only",
    version: "0.2.0",
    accepting_turns: true,
  };

  expect(setupProxyIsReady(ready, config)).toBe(true);
  expect(setupProxyIsReady({ ...ready, accepting_turns: false }, config)).toBe(false);
  expect(setupProxyIsReady({ ...ready, status: "degraded" }, config)).toBe(false);
  expect(setupProxyIsReady({ ...ready, version: "0.1.16" }, config)).toBe(false);
  expect(setupProxyIsReady({ ...ready, execution_policy: "mixed" }, config)).toBe(false);
});

test("launcher setup refreshes account capabilities only when missing or explicitly requested", () => {
  const verifiedLauncher = {
    browserHost: "launcher",
    solAvailable: true,
    proAvailable: false,
  };

  expect(launcherCapabilityProbeRequired(undefined)).toBe(true);
  expect(launcherCapabilityProbeRequired(verifiedLauncher as never)).toBe(false);
  expect(launcherCapabilityProbeRequired({
    browserHost: "launcher",
    proAvailable: false,
  } as never)).toBe(true);
  expect(launcherCapabilityProbeRequired(verifiedLauncher as never, true)).toBe(true);
  expect(launcherCapabilityProbeRequired({
    ...verifiedLauncher,
    browserInteractionMode: "manual",
  } as never)).toBe(false);
  expect(launcherCapabilityProbeRequired({
    ...verifiedLauncher,
    browserInteractionMode: "manual",
  } as never, false, "automatic")).toBe(true);
});

test("doctor output distinguishes liveness from full readiness and names the execution policy", () => {
  const report = formatDoctorReport({
    ok: false,
    mode: "full",
    executionPolicy: "web-only",
    proxyLive: true,
    fullReady: false,
    checks: [{ id: "tunnel-runtime", status: "error", message: "Tunnel runtime is not ready" }],
  });
  expect(report).toContain("Execution policy: web-only");
  expect(report).toContain("Proxy liveness: live");
  expect(report).toContain("Full readiness: not ready");
});
