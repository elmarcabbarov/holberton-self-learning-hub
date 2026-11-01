import { HealthResponse } from "@hub/contracts";

/** 200 = healthy, 503 = server up but degraded; anything else is an error. */
export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch("/api/health");
  if (res.status !== 200 && res.status !== 503) throw new Error(`health ${res.status}`);
  return HealthResponse.parse(await res.json());
}
