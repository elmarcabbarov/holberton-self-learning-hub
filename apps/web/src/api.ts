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
  readonly messageKey: string;
  /** Raw `error.details` from the server (e.g. the current version on a 409); validate before use. */
  readonly details: unknown;
  constructor(status: number, code: string, messageKey = "errors.internal", details: unknown = undefined) {
    super(`${status} ${code}`);
    this.status = status;
    this.code = code;
    this.messageKey = messageKey;
    this.details = details;
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
  return parseResponse(res, schema);
}

/** Raw upload (the zip import is the only non-JSON body the server takes, D-061). */
export async function apiUpload<T>(path: string, schema: { parse(v: unknown): T }, body: Blob, contentType: string): Promise<T> {
  const res = await fetch(path, { method: "POST", credentials: "same-origin", headers: { "content-type": contentType }, body });
  return parseResponse(res, schema);
}

async function parseResponse<T>(res: Response, schema: { parse(v: unknown): T }): Promise<T> {
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const e = (data as { error?: { code?: string; messageKey?: string; details?: unknown } } | null)?.error;
    throw new ApiError(res.status, e?.code ?? "internal", e?.messageKey ?? "errors.internal", e?.details);
  }
  return schema.parse(data);
}
