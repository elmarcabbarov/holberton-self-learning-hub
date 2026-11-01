import { z } from "zod";

const Counts = z.object({ notes: z.number(), spaces: z.number(), topics: z.number(), cards: z.number(), reviews: z.number() });
export const BackupList = z.object({ backups: z.array(z.object({ name: z.string(), size: z.number(), createdAt: z.string() })) });
export type BackupList = z.infer<typeof BackupList>;
export const BackupCreated = z.object({ name: z.string(), counts: Counts, files: z.number() });
export type BackupCreated = z.infer<typeof BackupCreated>;
