import { z } from "zod";

export const BACKUP_FORMAT = "holberton-hub-backup";
export const BACKUP_FORMAT_VERSION = 1;

export const BackupManifest = z.object({
  format: z.literal(BACKUP_FORMAT),
  formatVersion: z.literal(BACKUP_FORMAT_VERSION),
  appVersion: z.string(),
  createdAt: z.string(),
  instanceId: z.string(),
  migrations: z.number().int().nonnegative(),
  counts: z.object({ notes: z.number(), spaces: z.number(), topics: z.number(), cards: z.number(), reviews: z.number() }),
  db: z.object({ sha256: z.string().regex(/^[0-9a-f]{64}$/), size: z.number().int() }),
  files: z.array(z.object({ path: z.string().min(1).max(1024), sha256: z.string().regex(/^[0-9a-f]{64}$/), size: z.number().int().nonnegative() })),
});
export type BackupManifest = z.infer<typeof BackupManifest>;

/** Backup file names we create and accept for download. */
export const BACKUP_NAME = /^hub-backup-\d{8}T\d{6}Z(-\d+)?\.zip$/;
