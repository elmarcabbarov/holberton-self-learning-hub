import { and, eq, gt, isNull, lt, or } from "drizzle-orm";
import type { Db } from "../../lib/db/index.ts";
import { bootstrapTokens, sessions } from "../../lib/db/schema.ts";
import { newSecret, sha256 } from "./crypto.ts";

export const BOOTSTRAP_TTL_MS = 10 * 60_000;
export const SESSION_IDLE_MS = 30 * 24 * 3600_000;
export const SESSION_ABSOLUTE_MS = 90 * 24 * 3600_000;
const TOUCH_INTERVAL_MS = 60_000;

const iso = (ms: number) => new Date(ms).toISOString();

export function createBootstrapToken(db: Db, now = Date.now()): string {
  const token = newSecret();
  db.insert(bootstrapTokens)
    .values({ hash: sha256(token), createdAt: iso(now), expiresAt: iso(now + BOOTSTRAP_TTL_MS) })
    .run();
  return token;
}

/**
 * Atomically consumes a bootstrap token and creates a session in one transaction.
 * Returns the raw session id, or null for unknown, expired or used tokens (same result for all).
 */
export function redeemBootstrapToken(db: Db, token: string, now = Date.now()): string | null {
  return db.transaction((tx) => {
    const consumed = tx.update(bootstrapTokens)
      .set({ usedAt: iso(now) })
      .where(and(eq(bootstrapTokens.hash, sha256(token)), isNull(bootstrapTokens.usedAt), gt(bootstrapTokens.expiresAt, iso(now))))
      .returning({ hash: bootstrapTokens.hash })
      .all();
    if (consumed.length !== 1) return null;
    const sessionId = newSecret();
    tx.insert(sessions).values({
      idHash: sha256(sessionId),
      createdAt: iso(now),
      lastSeenAt: iso(now),
      expiresAt: iso(now + SESSION_IDLE_MS),
      absoluteExpiresAt: iso(now + SESSION_ABSOLUTE_MS),
    }).run();
    return sessionId;
  });
}

export type SessionCheck = { valid: false } | { valid: true; renewedMaxAgeSec?: number };

/**
 * Validates a session; slides the idle expiry at most once per minute.
 * When it slides, `renewedMaxAgeSec` tells the caller to refresh the cookie (capped by the absolute expiry).
 */
export function checkSession(db: Db, sessionId: string, now = Date.now()): SessionCheck {
  const idHash = sha256(sessionId);
  const row = db.select().from(sessions).where(eq(sessions.idHash, idHash)).get();
  if (!row) return { valid: false };
  if (row.expiresAt <= iso(now) || row.absoluteExpiresAt <= iso(now)) {
    db.delete(sessions).where(eq(sessions.idHash, idHash)).run();
    return { valid: false };
  }
  if (now - Date.parse(row.lastSeenAt) >= TOUCH_INTERVAL_MS) {
    const idle = Math.min(now + SESSION_IDLE_MS, Date.parse(row.absoluteExpiresAt));
    db.update(sessions).set({ lastSeenAt: iso(now), expiresAt: iso(idle) }).where(eq(sessions.idHash, idHash)).run();
    return { valid: true, renewedMaxAgeSec: Math.floor((idle - now) / 1000) };
  }
  return { valid: true };
}

/** Boolean convenience wrapper. */
export function touchSession(db: Db, sessionId: string, now = Date.now()): boolean {
  return checkSession(db, sessionId, now).valid;
}

export function deleteSession(db: Db, sessionId: string): void {
  db.delete(sessions).where(eq(sessions.idHash, sha256(sessionId))).run();
}

/** Removes expired sessions and stale bootstrap tokens. */
export function pruneAuth(db: Db, now = Date.now()): void {
  db.delete(sessions).where(or(lt(sessions.expiresAt, iso(now)), lt(sessions.absoluteExpiresAt, iso(now)))).run();
  db.delete(bootstrapTokens).where(lt(bootstrapTokens.expiresAt, iso(now - 24 * 3600_000))).run();
}
