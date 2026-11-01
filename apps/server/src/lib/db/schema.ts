import { sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Instance-level key/value facts (instance id, creation time, schema notes). */
export const appMeta = sqliteTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/** One-time bootstrap tokens; only the SHA-256 of the token is stored (D-044). */
export const bootstrapTokens = sqliteTable("bootstrap_tokens", {
  hash: text("hash").primaryKey(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
});

/** Browser sessions; only the SHA-256 of the cookie value is stored (D-045). */
export const sessions = sqliteTable("sessions", {
  idHash: text("id_hash").primaryKey(),
  createdAt: text("created_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  absoluteExpiresAt: text("absolute_expires_at").notNull(),
});
