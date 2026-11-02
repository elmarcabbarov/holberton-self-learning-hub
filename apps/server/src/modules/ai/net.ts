import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Outbound policy for AI provider endpoints (D-038 keeps it separate from research fetching).
 * The configured endpoint may be loopback or a private LAN address (Ollama, LM Studio), but never
 * link-local / cloud metadata, unspecified or multicast. Redirects are refused so neither the key nor the
 * prompt can be forwarded. Residual risk: DNS can change between this check and the connection (as D-040).
 */
export class EndpointError extends Error {
  readonly reason: string;
  constructor(reason: string) { super(reason); this.reason = reason; }
}

/** Validates a base URL as typed by the user; returns it normalised without a trailing slash. */
export function validateBaseUrl(raw: string): string {
  let u: URL;
  try { u = new URL(raw); } catch { throw new EndpointError("invalid_url"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new EndpointError("bad_scheme");
  if (u.username || u.password) throw new EndpointError("credentials_in_url");
  if (u.hash || u.search) throw new EndpointError("query_not_allowed");
  return u.toString().replace(/\/+$/, "");
}

function v4Blocked(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number) as [number, number];
  return a === 0 || (a === 169 && b === 254) || a >= 224; // unspecified, link-local/metadata, multicast/reserved
}

function v6Blocked(ip: string): boolean {
  const x = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(x);
  if (mapped) return v4Blocked(mapped[1]!);
  return x === "::" || /^fe[89ab]/.test(x) || x.startsWith("ff") || x.startsWith("fd00:ec2:"); // unspecified, link-local, multicast, AWS metadata
}

export function addressBlocked(ip: string): boolean {
  const kind = isIP(ip);
  return kind === 4 ? v4Blocked(ip) : kind === 6 ? v6Blocked(ip) : true;
}

export type Resolve = (host: string) => Promise<{ address: string }[]>;
const systemResolve: Resolve = (host) => lookup(host, { all: true, verbatim: true });

/** Resolves the host and refuses it when any answer is in a blocked range. */
export async function checkHost(hostname: string, resolve: Resolve = systemResolve): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, "");
  const answers = isIP(host) ? [{ address: host }] : await resolve(host).catch(() => { throw new EndpointError("dns_failed"); });
  if (answers.length === 0 || answers.some((a) => addressBlocked(a.address))) throw new EndpointError("blocked_address");
}

/** fetch for provider SDKs: host check, no redirects, overall timeout joined with the caller's signal. */
export function guardedFetch(timeoutMs: number, base: typeof fetch = fetch, resolve?: Resolve): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    await checkHost(url.hostname, resolve);
    const signals = [AbortSignal.timeout(timeoutMs), ...(init?.signal ? [init.signal] : [])];
    return base(input, { ...init, redirect: "error", signal: AbortSignal.any(signals) });
  }) as typeof fetch;
}
