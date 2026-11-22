// Server-only by construction: `node:crypto` cannot be bundled for the browser.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { devSingleton, type Env } from "@/lib/mock-guard";

/**
 * Server secrets for hashing OTPs and signing demo payment events. Fail closed: in production the secret
 * must be set (≥ 32 chars) or every call throws. In dev/test a random per-process secret is used.
 */
function secret(name: "OTP_PEPPER", env: Env = process.env): string {
  const value = env[name];
  if (value && value.length >= 32) return value;
  if (env.NODE_ENV === "production") throw new Error(`${name} is not configured`);
  return devSingleton(`secret_${name}`, () => randomBytes(32).toString("hex"));
}

export function hmac(name: "OTP_PEPPER", data: string): string {
  return createHmac("sha256", secret(name)).update(data).digest("hex");
}

export function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Constant-time comparison of two hex digests. */
export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length || !/^[0-9a-f]*$/.test(a) || !/^[0-9a-f]*$/.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Uniform random integer in [0, max) from the CSPRNG. */
export function randomInt(max: number): number {
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  for (;;) {
    const n = randomBytes(4).readUInt32BE(0);
    if (n < limit) return n % max;
  }
}
