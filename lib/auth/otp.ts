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

interface Challenge {
  id: string;
  phone: string;
  codeHash: string;
  expiresAt: number;
  attempts: number;
  used: boolean;
}

export interface OtpStore {
  challenges: Map<string, Challenge>;
  sends: Map<string, number[]>;
}

export function createOtpStore(): OtpStore {
  return { challenges: new Map(), sends: new Map() };
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
  if (!mockDataAllowed(env)) throw new BackendUnavailableError("OTP store");
  return devSingleton("otp_store", createOtpStore);
}

const codeHash = (challengeId: string, code: string) => hmac("OTP_PEPPER", `${challengeId}:${code}`);

export async function sendOtp(
  phone: string,
  { store = resolveOtpStore(), sms = resolveSms(), now = Date.now() }: { store?: OtpStore; sms?: SmsAdapter; now?: number } = {},
): Promise<{ challengeId: string; expiresInSeconds: number; demoCode?: string }> {
  const history = (store.sends.get(phone) ?? []).filter((t) => t > now - 86_400_000);
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
  for (const [cid, c] of store.challenges) if (c.phone === phone && !c.used) store.challenges.delete(cid);
  store.challenges.set(id, { id, phone, codeHash: codeHash(id, code), expiresAt: now + OTP_TTL_MS, attempts: 0, used: false });
  store.sends.set(phone, [...history, now]);

  const sent = await sms.sendOtp(phone, code);
  securityEvent("otp_sent", { phone: maskPhone(phone) });
  return { challengeId: id, expiresInSeconds: OTP_TTL_MS / 1000, ...(sent.demoCode ? { demoCode: sent.demoCode } : {}) };
}

/** Returns the verified phone. Every failure path gives the same message except "locked". */
export async function verifyOtp(
  challengeId: string,
  code: string,
  { store = resolveOtpStore(), now = Date.now() }: { store?: OtpStore; now?: number } = {},
): Promise<string> {
  const c = store.challenges.get(challengeId);
  if (!c || c.used) throw new OtpError("invalid", "That code is incorrect or has expired.");
  if (c.expiresAt <= now) {
    store.challenges.delete(challengeId);
    throw new OtpError("expired", "That code is incorrect or has expired.");
  }
  if (c.attempts >= OTP_MAX_ATTEMPTS) throw new OtpError("locked", "Too many wrong attempts. Request a new code.");
  c.attempts += 1;
  if (!/^\d{6}$/.test(code) || !safeEqualHex(codeHash(challengeId, code), c.codeHash)) {
    securityEvent(c.attempts >= OTP_MAX_ATTEMPTS ? "otp_locked" : "otp_verify_failed", { phone: maskPhone(c.phone) });
    if (c.attempts >= OTP_MAX_ATTEMPTS) throw new OtpError("locked", "Too many wrong attempts. Request a new code.");
    throw new OtpError("invalid", "That code is incorrect or has expired.");
  }
  c.used = true;
  store.challenges.delete(challengeId);
  return c.phone;
}
