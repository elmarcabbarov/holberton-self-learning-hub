import { HealthResponse } from "@hub/contracts";

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error(`health ${res.status}`);
  return HealthResponse.parse(await res.json());
}
