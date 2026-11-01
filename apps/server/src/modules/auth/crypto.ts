import { createHash, randomBytes } from "node:crypto";

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/; // 32 bytes, base64url, no padding

export function newSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function isCanonicalSecret(value: unknown): value is string {
  return typeof value === "string" && TOKEN_RE.test(value);
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
