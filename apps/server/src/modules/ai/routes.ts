import type { FastifyInstance, FastifyReply } from "fastify";
import { AIStatus, SaveAISettings } from "@hub/contracts";
import type { AIService } from "./service.ts";

const err = (reply: FastifyReply, status: number, code: string, messageKey: string) => reply.code(status).send({ error: { code, messageKey } });

/** AI settings and capability test (HSLH-014, D-065). The key is accepted here and never sent back. */
export async function registerAIRoutes(app: FastifyInstance, ai: AIService): Promise<void> {
  app.get("/api/ai/status", async () => AIStatus.parse(await ai.status()));

  app.put("/api/ai/settings", async (req, reply) => {
    const body = SaveAISettings.safeParse(req.body);
    if (!body.success) return err(reply, 400, "validation_failed", "errors.validation");
    const out = await ai.save(body.data);
    if (out.kind === "conflict") return err(reply, 409, "conflict", "ai.conflict");
    if (out.kind === "invalid") return err(reply, 400, "validation_failed", `ai.invalid.${out.reason}`);
    return AIStatus.parse(out.status);
  });

  app.post("/api/ai/probe", async (_req, reply) => {
    const out = await ai.probe();
    if (out.kind === "exam_mode") return err(reply, 423, "exam_mode", "tutor.examMode");
    if (out.kind === "not_ready") return err(reply, 409, "conflict", "ai.notReadyError");
    if (out.kind === "busy") return err(reply, 429, "rate_limited", "ai.busy");
    return AIStatus.parse(out.status);
  });
}
