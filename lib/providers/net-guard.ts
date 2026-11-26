import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Stops an admin-typed host (SMTP) from pointing the server at itself or its private network (SSRF).
 * The host must be a DNS name — never an IP literal — and EVERY address it resolves to must be public.
 * Callers connect to the address returned here (not to the name again) while TLS keeps verifying the certificate
 * for the name, so a DNS answer that changes after the check (DNS rebinding) can't send the connection elsewhere.
 */
export class UnsafeHostError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeHostError";
  }
}

export const HOSTNAME_RE = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

function ipv4Private(ip: string): boolean {
  const [a, b, c] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113) || a >= 224
  );
}

/** True for loopback, private, link-local, CGNAT, documentation, multicast and reserved ranges (IPv4 + IPv6). */
export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return ipv4Private(ip);
  if (kind !== 6) return true;
  const v = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (mapped) return ipv4Private(mapped[1]);
  return v === "::" || v === "::1" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith("ff") || v.startsWith("2001:db8") || v.startsWith("64:ff9b") || v.startsWith("100:");
}

export type Resolver = (host: string) => Promise<string[]>;
const systemResolver: Resolver = async (host) => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);

/** The checked public address to connect to (IPv4 preferred). Throws UnsafeHostError. */
export async function publicAddress(rawHost: string, resolve: Resolver = systemResolver): Promise<string> {
  const host = rawHost.trim().toLowerCase();
  if (isIP(host)) throw new UnsafeHostError("Use the provider's host name (like smtp.example.com), not an IP address.");
  if (!HOSTNAME_RE.test(host)) throw new UnsafeHostError("Enter a valid host name, like smtp.example.com.");
  let ips: string[];
  try {
    ips = await resolve(host);
  } catch {
    throw new UnsafeHostError(`The host ${host} could not be found. Check the spelling.`);
  }
  if (!ips.length) throw new UnsafeHostError(`The host ${host} could not be found. Check the spelling.`);
  if (ips.some(isPrivateAddress)) throw new UnsafeHostError(`The host ${host} points to a private or internal address, which isn't allowed.`);
  return ips.find((ip) => isIP(ip) === 4) ?? ips[0];
}
