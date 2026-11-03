import type { FastifyInstance } from "fastify";
import type { HubConfig } from "../config.ts";
import type { DatabaseHandle } from "../lib/db/index.ts";
import { registerAIRoutes } from "../modules/ai/routes.ts";
import { SecretStore } from "../modules/ai/secrets.ts";
import { AIService } from "../modules/ai/service.ts";
import { ExamService } from "../modules/exam-mode/service.ts";
import { registerExamRoutes } from "../modules/exam-mode/routes.ts";
import { registerTutorRoutes } from "../modules/tutor/routes.ts";
import type { Resolve } from "../modules/ai/net.ts";

/**
 * Composition root for the optional AI module (ADR-007): the only place outside `modules/ai` that may
 * import it. Core modules never do; lint enforces both rules.
 */
export async function wireAI(app: FastifyInstance, database: DatabaseHandle, config: HubConfig, seams: { fetch?: typeof fetch; resolve?: Resolve } = {}): Promise<AIService> {
  const exam = new ExamService(database.db);
  const ai = new AIService(database.db, new SecretStore(config.dataDir, config.secretKey), { ...seams, allowMock: config.aiMock, exam });
  await registerAIRoutes(app, ai);
  await registerExamRoutes(app, exam);
  await registerTutorRoutes(app, database, ai, exam);
  return ai;
}
