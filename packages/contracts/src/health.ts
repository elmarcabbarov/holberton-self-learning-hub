import { z } from "zod";

export const HealthResponse = z.object({
  status: z.literal("ok"),
  version: z.string(),
  mode: z.enum(["local", "remote"]),
});
export type HealthResponse = z.infer<typeof HealthResponse>;
