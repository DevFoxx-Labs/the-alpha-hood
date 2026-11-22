import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Staff credentials: scrypt password hashes and RFC 6238 TOTP (SHA-1, 30 s, 6 digits — what every
 * authenticator app supports). Constant-time comparisons throughout.
 */
const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, keylen: number, opts: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;
const SCRYPT = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

export function passwordProblem(pw: unknown): string | null {
  if (typeof pw !== "string") return "Enter a password.";
  if (pw.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (pw.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  if (/^(.)\1+$/.test(pw) || /^(password|qwerty|123456|admin)/i.test(pw)) return "That password is too easy to guess.";
  return null;
}

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 64, SCRYPT);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

/** A hash to compare against when the email is unknown, so timing doesn't reveal which emails exist. */
let dummy: string | null = null;
export async function dummyHash(): Promise<string> {
  dummy ??= await hashPassword(randomBytes(16).toString("hex"));
  return dummy;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, keyHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
  const key = await scrypt(pw, Buffer.from(saltHex, "hex"), 64, SCRYPT);
  const expected = Buffer.from(keyHex, "hex");
  return expected.length === key.length && timingSafeEqual(expected, key);
}

// ── TOTP ─────────────────────────────────────────────────────────────────────────────────────────

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) throw new Error("Invalid base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpAt(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = h[h.length - 1] & 0x0f;
  const bin = ((h[offset] & 0x7f) << 24) | (h[offset + 1] << 16) | (h[offset + 2] << 8) | h[offset + 3];
  return String(bin % 1_000_000).padStart(6, "0");
}

export const TOTP_STEP_MS = 30_000;

/**
 * Verifies a code within ±1 step. Returns the matched step so the caller can refuse reuse of the same step
 * (replay), or null.
 */
export function verifyTotp(secret: string, code: string, now = Date.now(), lastUsedStep = -1): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / TOTP_STEP_MS);
  for (const step of [current - 1, current, current + 1]) {
    if (step <= lastUsedStep) continue;
    const expected = Buffer.from(totpAt(secret, step));
    if (timingSafeEqual(expected, Buffer.from(code))) return step;
  }
  return null;
}

export function otpauthUri(secret: string, account: string, issuer = "The Alpha Hood Admin"): string {
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
