import { dbStores } from "@/lib/db";
import { BackendUnavailableError, devSingleton, type Env, mockDataAllowed } from "@/lib/mock-guard";
import { resolveSms, type SmsAdapter } from "@/lib/notify/sms";
import { maskPhone, securityEvent } from "@/lib/security/log";
import { hmac, randomInt, randomToken, safeEqualHex } from "./secrets";

/**
 * Phone OTP (CHK-02, ACC-01). 6 random digits from the CSPRNG, stored only as an HMAC (server pepper),
 * single-use, valid 5 minutes, 5 attempts, 30 s resend cooldown, 5 sends/hour and 10/day per phone.
 * Codes are never logged. Responses never reveal whether a phone has an account.
 */
export const OTP_TTL_MS = 5 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_COOLDOWN_MS = 30_000;
const HOURLY_CAP = 5;
const DAILY_CAP = 10;

export interface Challenge {
  id: string;
  phone: string;
  codeHash: string;
  expiresAt: number;
  attempts: number;
  used: boolean;
}

/**
 * OTP storage (memory, or the own-backend database). Every change that matters for security is atomic:
 * `bumpAttempt` only increments while under the limit and unused, and `consume` marks a code used exactly once,
 * so two concurrent verifications can't both succeed or skip the attempt limit.
 */
export interface OtpStore {
  sendsSince(phone: string, sinceMs: number): Promise<number[]>;
  recordSend(phone: string, atMs: number): Promise<void>;
  /** Removes the phone's unused challenges and stores the new one (only one live code per phone). */
  replaceChallenge(c: Challenge): Promise<void>;
  getChallenge(id: string): Promise<Challenge | null>;
  deleteChallenge(id: string): Promise<void>;
  /** attempts += 1 if attempts < max and not used. Returns the new count, or null if refused. */
  bumpAttempt(id: string, max: number): Promise<number | null>;
  /** used = true if it wasn't. True exactly once. */
  consume(id: string): Promise<boolean>;
}

export interface MemoryOtpStore extends OtpStore {
  /** Test visibility only. */
  challenges: Map<string, Challenge>;
}

export function createOtpStore(): MemoryOtpStore {
  const challenges = new Map<string, Challenge>();
  const sends = new Map<string, number[]>();
  return {
    challenges,
    async sendsSince(phone, since) {
      return (sends.get(phone) ?? []).filter((t) => t > since);
    },
    async recordSend(phone, at) {
      sends.set(phone, [...(sends.get(phone) ?? []).filter((t) => t > at - 86_400_000), at]);
    },
    async replaceChallenge(c) {
      for (const [id, x] of challenges) if (x.phone === c.phone && !x.used) challenges.delete(id);
      challenges.set(c.id, { ...c });
    },
    async getChallenge(id) {
      const c = challenges.get(id);
      return c ? { ...c } : null;
    },
    async deleteChallenge(id) {
      challenges.delete(id);
    },
    async bumpAttempt(id, max) {
      const c = challenges.get(id);
      if (!c || c.used || c.attempts >= max) return null;
      c.attempts += 1;
      return c.attempts;
    },
    async consume(id) {
      const c = challenges.get(id);
      if (!c || c.used) return false;
      c.used = true;
      return true;
    },
  };
}

export class OtpError extends Error {
  constructor(
    public readonly code: "cooldown" | "limited" | "invalid" | "expired" | "locked",
    message: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "OtpError";
  }
}

export function resolveOtpStore(env: Env = process.env): OtpStore {
  const db = dbStores(env);
  if (db) return db.otp;
  if (!mockDataAllowed(env)) throw new BackendUnavailableError("OTP store");
  return devSingleton("otp_store_v2", createOtpStore);
}

/**
 * `purpose` scopes a code to one flow: a code issued for "admin-reset" never verifies on the customer sign-in
 * (and the other way round), because the purpose is part of the hashed value. Customer codes have no purpose,
 * so their stored hashes are unchanged.
 */
const codeHash = (challengeId: string, code: string, purpose?: string) => hmac("OTP_PEPPER", purpose ? `${purpose}:${challengeId}:${code}` : `${challengeId}:${code}`);

export async function sendOtp(
  phone: string,
  {
    store = resolveOtpStore(),
    sms,
    now = Date.now(),
    purpose,
    deliver,
  }: {
    store?: OtpStore;
    sms?: SmsAdapter;
    now?: number;
    /** Scope of the code (see codeHash). Omit for customer phone sign-in. */
    purpose?: string;
    /** Channel other than SMS (e.g. email). `phone` is then only the ≤16-char rate-limit / challenge key. */
    deliver?: (code: string) => Promise<{ demoCode?: string }>;
  } = {},
): Promise<{ challengeId: string; expiresInSeconds: number; demoCode?: string }> {
  const history = (await store.sendsSince(phone, now - 86_400_000)).sort((x, y) => x - y);
  const last = history.at(-1);
  if (last !== undefined && now - last < OTP_COOLDOWN_MS) {
    throw new OtpError("cooldown", "Please wait before requesting another code.", Math.ceil((OTP_COOLDOWN_MS - (now - last)) / 1000));
  }
  if (history.filter((t) => t > now - 3_600_000).length >= HOURLY_CAP || history.length >= DAILY_CAP) {
    securityEvent("otp_send_limited", { phone: maskPhone(phone) });
    throw new OtpError("limited", "Too many codes requested for this number. Try again later.");
  }

  const code = String(randomInt(1_000_000)).padStart(6, "0");
  const id = randomToken(18);
  // Only one live challenge per phone.
  await store.replaceChallenge({ id, phone, codeHash: codeHash(id, code, purpose), expiresAt: now + OTP_TTL_MS, attempts: 0, used: false });
  await store.recordSend(phone, now);

  const sent = deliver ? await deliver(code) : await (sms ?? resolveSms()).sendOtp(phone, code);
  securityEvent("otp_sent", { phone: maskPhone(phone) });
  return { challengeId: id, expiresInSeconds: OTP_TTL_MS / 1000, ...(sent.demoCode ? { demoCode: sent.demoCode } : {}) };
}

/** Returns the verified phone. Every failure path gives the same message except "locked". */
export async function verifyOtp(
  challengeId: string,
  code: string,
  { store = resolveOtpStore(), now = Date.now(), purpose }: { store?: OtpStore; now?: number; purpose?: string } = {},
): Promise<string> {
  const c = await store.getChallenge(challengeId);
  if (!c || c.used) throw new OtpError("invalid", "That code is incorrect or has expired.");
  if (c.expiresAt <= now) {
    await store.deleteChallenge(challengeId);
    throw new OtpError("expired", "That code is incorrect or has expired.");
  }
  // Atomic: counts the attempt only while under the limit (concurrent guesses can't exceed it).
  const attempts = await store.bumpAttempt(challengeId, OTP_MAX_ATTEMPTS);
  if (attempts === null) throw new OtpError("locked", "Too many wrong attempts. Request a new code.");
  if (!/^\d{6}$/.test(code) || !safeEqualHex(codeHash(challengeId, code, purpose), c.codeHash)) {
    securityEvent(attempts >= OTP_MAX_ATTEMPTS ? "otp_locked" : "otp_verify_failed", { phone: maskPhone(c.phone) });
    if (attempts >= OTP_MAX_ATTEMPTS) throw new OtpError("locked", "Too many wrong attempts. Request a new code.");
    throw new OtpError("invalid", "That code is incorrect or has expired.");
  }
  // Single use: only one concurrent verification can consume the code.
  if (!(await store.consume(challengeId))) throw new OtpError("invalid", "That code is incorrect or has expired.");
  await store.deleteChallenge(challengeId);
  return c.phone;
}
