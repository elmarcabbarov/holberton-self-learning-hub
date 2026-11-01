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

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) {
    super(`${status} ${code}`);
    this.status = status;
    this.code = code;
  }
}

/** JSON request against the Hub API; parses the response with the given contract schema. */
export async function apiJson<T>(path: string, schema: { parse(v: unknown): T }, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? "GET",
    credentials: "same-origin",
    headers: init?.body === undefined ? {} : { "content-type": "application/json" },
    body: init?.body === undefined ? null : JSON.stringify(init.body),
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const code = (data as { error?: { code?: string } } | null)?.error?.code ?? "internal";
    throw new ApiError(res.status, code);
  }
  return schema.parse(data);
}
