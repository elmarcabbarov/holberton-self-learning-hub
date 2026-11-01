import { AuthStatus, HealthResponse } from "@hub/contracts";

/** 200 = healthy, 503 = server up but degraded; anything else is an error. */
export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch("/api/health");
  if (res.status !== 200 && res.status !== 503) throw new Error(`health ${res.status}`);
  return HealthResponse.parse(await res.json());
}

export async function fetchAuthStatus(): Promise<AuthStatus> {
  const res = await fetch("/api/auth/status", { credentials: "same-origin" });
  if (!res.ok) throw new Error(`auth status ${res.status}`);
  return AuthStatus.parse(await res.json());
}

export type BootstrapResult = "ok" | "invalid" | "rate_limited" | "error";

export async function redeemToken(token: string): Promise<BootstrapResult> {
  const res = await fetch("/api/auth/bootstrap", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (res.ok) return "ok";
  if (res.status === 401) return "invalid";
  if (res.status === 429) return "rate_limited";
  return "error";
}
