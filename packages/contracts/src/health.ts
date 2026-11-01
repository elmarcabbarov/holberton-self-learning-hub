import { z } from "zod";

export const HealthResponse = z.object({
  /** "degraded" is served with HTTP 503 (e.g. the database does not answer). */
  status: z.enum(["ok", "degraded"]),
  version: z.string(),
  mode: z.enum(["local", "remote"]),
  db: z.enum(["ok", "error"]),
});
export type HealthResponse = z.infer<typeof HealthResponse>;
