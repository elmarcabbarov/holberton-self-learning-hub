import type { FastifyInstance } from "fastify";
import { ExamMode } from "@hub/contracts";
import type { ExamService } from "./service.ts";

export async function registerExamRoutes(app: FastifyInstance, exam: ExamService): Promise<void> {
  app.get("/api/exam-mode", async () => ExamMode.parse(exam.state()));
  app.put("/api/exam-mode", async (req, reply) => {
    const body = ExamMode.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: { code: "validation_failed", messageKey: "errors.validation" } });
    return ExamMode.parse(exam.set(body.data.until));
  });
}
