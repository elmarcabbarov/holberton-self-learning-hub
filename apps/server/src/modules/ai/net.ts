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

/** Eight 16-bit groups of an IPv6 address (zone id dropped, embedded dotted IPv4 expanded), or null. */
export function parseV6(ip: string): number[] | null {
  let x = ip.toLowerCase().replace(/%.*$/, "");
  const dotted = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(x);
  if (dotted) {
    const o = dotted.slice(1).map(Number);
    if (o.some((n) => n > 255)) return null;
    x = `${x.slice(0, dotted.index)}${((o[0]! << 8) | o[1]!).toString(16)}:${((o[2]! << 8) | o[3]!).toString(16)}`;
  }
  const halves = x.split("::");
  if (halves.length > 2) return null;
  const part = (h: string) => (h === "" ? [] : h.split(":"));
  const head = part(halves[0]!);
  const tail = halves.length === 2 ? part(halves[1]!) : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const groups = [...head, ...Array<string>(fill).fill("0"), ...tail];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

function v6Blocked(ip: string): boolean {
  const g = parseV6(ip);
  if (!g) return true;
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d) addresses follow the IPv4 policy, in any spelling.
  if (g.slice(0, 5).every((n) => n === 0) && (g[5] === 0xffff || (g[5] === 0 && (g[6] !== 0 || g[7]! > 1)))) {
    return v4Blocked(`${g[6]! >> 8}.${g[6]! & 255}.${g[7]! >> 8}.${g[7]! & 255}`);
  }
  if (g.every((n) => n === 0)) return true; // unspecified
  if ((g[0]! & 0xffc0) === 0xfe80) return true; // link-local
  if ((g[0]! & 0xff00) === 0xff00) return true; // multicast
  return g[0] === 0xfd00 && g[1] === 0x0ec2; // AWS metadata (fd00:ec2::254)
}

export function addressBlocked(ip: string): boolean {
  const bare = ip.replace(/%.*$/, "");
  const kind = isIP(bare);
  return kind === 4 ? v4Blocked(bare) : kind === 6 ? v6Blocked(bare) : true;
}

export type Resolve = (host: string) => Promise<{ address: string }[]>;
const systemResolve: Resolve = (host) => lookup(host, { all: true, verbatim: true });

/** Rejects as soon as the signal aborts, so a stalled resolver cannot outlive the call's deadline. */
function untilAborted<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    p.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

/** Resolves the host and refuses it when any answer is in a blocked range. */
export async function checkHost(hostname: string, resolve: Resolve = systemResolve, signal?: AbortSignal): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, "");
  let answers: { address: string }[];
  if (isIP(host)) answers = [{ address: host }];
  else {
    const lookup = resolve(host).catch(() => { throw new EndpointError("dns_failed"); });
    answers = signal ? await untilAborted(lookup, signal) : await lookup;
  }
  if (answers.length === 0 || answers.some((a) => addressBlocked(a.address))) throw new EndpointError("blocked_address");
}

/** fetch for provider SDKs: host check, no redirects, one deadline (joined with the caller's signal) over both. */
export function guardedFetch(timeoutMs: number, base: typeof fetch = fetch, resolve?: Resolve): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const signal = AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(init?.signal ? [init.signal] : [])]);
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    await checkHost(url.hostname, resolve, signal);
    signal.throwIfAborted();
    return base(input, { ...init, redirect: "error", signal });
  }) as typeof fetch;
}
