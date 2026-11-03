import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { chmod, open, readFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";

/**
 * BYOK secrets (ADR-008): `<data>/data/secrets.json`, mode 0600, outside the database, so backups never
 * contain it. With HUB_SECRET_KEY the values are AES-256-GCM encrypted; without it they are stored as is and
 * the UI says so. Best effort only: it does not protect against root on the host (documented).
 */
interface SecretRecord { v: 1; enc: boolean; iv?: string; tag?: string; data: string }

export class SecretStore {
  private readonly path: string;
  private readonly key: Buffer | null;

  constructor(dataDir: string, secretKey: string | undefined) {
    this.path = join(dataDir, "data", "secrets.json");
    this.key = secretKey ? createHash("sha256").update(secretKey, "utf8").digest() : null;
  }

  get encrypted(): boolean { return this.key !== null; }

  private async readAll(): Promise<Record<string, SecretRecord>> {
    try { return JSON.parse(await readFile(this.path, "utf8")) as Record<string, SecretRecord>; } catch { return {}; }
  }

  /** Value of a secret, or null when missing or not decryptable (e.g. HUB_SECRET_KEY changed). */
  async get(name: string): Promise<string | null> {
    const r = (await this.readAll())[name];
    if (!r) return null;
    if (!r.enc) return this.key ? null : r.data; // a plaintext value is not trusted once encryption is on
    if (!this.key || !r.iv || !r.tag) return null;
    try {
      const d = createDecipheriv("aes-256-gcm", this.key, Buffer.from(r.iv, "base64"));
      d.setAuthTag(Buffer.from(r.tag, "base64"));
      return Buffer.concat([d.update(Buffer.from(r.data, "base64")), d.final()]).toString("utf8");
    } catch {
      return null;
    }
  }

  /** Sets (string) or clears (null) a secret; written atomically with mode 0600. */
  async set(name: string, value: string | null): Promise<void> {
    const all = await this.readAll();
    if (value === null) delete all[name];
    else if (this.key) {
      const iv = randomBytes(12);
      const c = createCipheriv("aes-256-gcm", this.key, iv);
      const data = Buffer.concat([c.update(value, "utf8"), c.final()]);
      all[name] = { v: 1, enc: true, iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), data: data.toString("base64") };
    } else all[name] = { v: 1, enc: false, data: value };
    await this.writeAll(all);
  }

  /** Removes every secret whose name starts with `prefix`, except `keep`. */
  async prune(prefix: string, keep: string | null): Promise<void> {
    const all = await this.readAll();
    const drop = Object.keys(all).filter((n) => n.startsWith(prefix) && n !== keep);
    if (drop.length === 0) return;
    for (const n of drop) delete all[n];
    await this.writeAll(all);
  }

  private async writeAll(all: Record<string, SecretRecord>): Promise<void> {
    const temp = `${this.path}.${randomBytes(6).toString("hex")}.tmp`;
    const fh = await open(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    try { await fh.writeFile(JSON.stringify(all)); await fh.sync(); } finally { await fh.close(); }
    try { await rename(temp, this.path); } catch (e) { await unlink(temp).catch(() => undefined); throw e; }
    await chmod(this.path, 0o600);
  }
}

/** `sk-…abcd`-style mask: never more than the last 4 characters. */
export const maskSecret = (s: string) => (s.length <= 8 ? "…" : `…${s.slice(-4)}`);
