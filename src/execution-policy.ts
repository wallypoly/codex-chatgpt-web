export type ExecutionPolicy = "web-only" | "mixed";

export type NativeEgressEndpoint =
  | "models"
  | "responses"
  | "responses/compact"
  | "alpha/search"
  | "images/generations"
  | "images/edits";

export const DEFAULT_EXECUTION_POLICY: ExecutionPolicy = "web-only";
export const NATIVE_BACKEND_FORBIDDEN_CODE = "native_backend_forbidden";
export const WEB_ROUTE_REQUIRED_CODE = "web_route_required";

const WEB_ONLY_ALLOWED_NATIVE_ENDPOINTS = new Set<NativeEgressEndpoint>(["models"]);

export class NativeEgressBlockedError extends Error {
  readonly code = NATIVE_BACKEND_FORBIDDEN_CODE;

  constructor(
    readonly endpoint: NativeEgressEndpoint,
    readonly policy: ExecutionPolicy,
  ) {
    super(`Execution policy ${JSON.stringify(policy)} blocks native Codex egress to ${JSON.stringify(endpoint)}`);
    this.name = "NativeEgressBlockedError";
  }
}

export function parseExecutionPolicy(
  value: unknown,
  fallback: ExecutionPolicy = DEFAULT_EXECUTION_POLICY,
): ExecutionPolicy {
  if (value === undefined || value === null || value === "") return fallback;
  if (value === "web-only" || value === "mixed") return value;
  throw new Error(`Invalid execution policy ${JSON.stringify(value)}; expected "web-only" or "mixed"`);
}

export function nativeEgressAllowed(
  policy: ExecutionPolicy,
  endpoint: NativeEgressEndpoint,
): boolean {
  return policy === "mixed" || WEB_ONLY_ALLOWED_NATIVE_ENDPOINTS.has(endpoint);
}

export function assertNativeEgressAllowed(
  policy: ExecutionPolicy,
  endpoint: NativeEgressEndpoint,
): void {
  if (!nativeEgressAllowed(policy, endpoint)) {
    throw new NativeEgressBlockedError(endpoint, policy);
  }
}
