import { z } from "zod";

export const HealthResponse = z.object({
  status: z.literal("ok"),
  version: z.string(),
  mode: z.enum(["local", "remote"]),
  db: z.enum(["ok", "error"]),
});
export type HealthResponse = z.infer<typeof HealthResponse>;
