import { createHash } from "node:crypto";
import { dummyHash, hashPassword, verifyPassword } from "@/lib/admin/crypto";
import { dbStores } from "@/lib/db";
import { BackendUnavailableError, devSingleton, type Env, mockDataAllowed } from "@/lib/mock-guard";
import { securityEvent } from "@/lib/security/log";

/**
 * Customer passwords (ACC-01 email + password sign-in).
 * - scrypt (N=16384, r=8, p=1, 64-byte key, random 16-byte salt) via lib/admin/crypto.ts; constant-time compare.
 * - Stored apart from the customer record (`customer_credentials`): no customer read ever carries a hash.
 * - Policy (NIST SP 800-63B): 8–128 characters, any characters, no composition rules; common and breached
 *   passwords refused. The breach check sends only the first 5 hex characters of the password's SHA-1 to
 *   api.pwnedpasswords.com (k-anonymity — the password and the person are never sent).
 */
export const CUSTOMER_PASSWORD_MIN = 8;
export const CUSTOMER_PASSWORD_MAX = 128;

export interface Credential {
  hash: string;
  updatedAt: string;
}

export interface CredentialStore {
  get(customerId: string): Promise<Credential | null>;
  /** Creates or replaces the password hash. */
  set(customerId: string, hash: string, now?: Date): Promise<void>;
  /** Account deletion (DPDP erasure). */
  delete(customerId: string): Promise<void>;
}

export function createMemoryCredentialStore(): CredentialStore {
  const rows = new Map<string, Credential>();
  return {
    async get(id) {
      const r = rows.get(id);
      return r ? { ...r } : null;
    },
    async set(id, hash, now = new Date()) {
      rows.set(id, { hash, updatedAt: now.toISOString() });
    },
    async delete(id) {
      rows.delete(id);
    },
  };
}

export function resolveCredentials(env: Env = process.env): CredentialStore {
  const db = dbStores(env);
  if (db) return db.credentials;
  if (mockDataAllowed(env)) return devSingleton("customer_credentials", createMemoryCredentialStore);
  const fail = async (): Promise<never> => {
    throw new BackendUnavailableError("Passwords");
  };
  return { get: fail, set: fail, delete: fail };
}

// ── Policy ──────────────────────────────────────────────────────────────────────────────────────

const COMMON = new Set(
  [
    "password", "password1", "password123", "passw0rd", "12345678", "123456789", "1234567890", "qwerty123", "qwertyuiop",
    "iloveyou", "11111111", "00000000", "abcd1234", "abc12345", "admin123", "welcome1", "letmein1", "sunshine",
    "princess", "football", "baseball", "superman", "trustno1", "india123", "india@123", "bharat123", "alphahood",
    "thealphahood", "alpha123", "hoodie123", "qwerty12", "1q2w3e4r", "zaq12wsx", "asdfghjk", "monkey123", "dragon123",
  ].map((s) => s.toLowerCase()),
);

/** First problem with a new password, or null. `context` = the email / name, which must not be the password. */
export function customerPasswordProblem(pw: unknown, context: (string | null | undefined)[] = []): string | null {
  if (typeof pw !== "string" || pw.length === 0) return "Enter a password.";
  if ([...pw].length < CUSTOMER_PASSWORD_MIN) return `Use at least ${CUSTOMER_PASSWORD_MIN} characters.`;
  if (pw.length > CUSTOMER_PASSWORD_MAX) return `Use at most ${CUSTOMER_PASSWORD_MAX} characters.`;
  const lower = pw.toLowerCase();
  if (/^(.)\1+$/.test(pw) || COMMON.has(lower) || /^(0123456789|123456789|987654321)/.test(lower)) return "That password is too easy to guess. Try a short phrase.";
  for (const c of context) {
    const v = c?.toLowerCase().trim();
    if (!v) continue;
    const local = v.split("@")[0];
    if (lower === v || (local.length >= 4 && lower.includes(local))) return "Don't use your email or name in your password.";
  }
  return null;
}

export type BreachFetcher = (url: string, init: RequestInit) => Promise<Response>;

/**
 * True when the password appears in a public breach list. Fails open (returns false) if the service is slow or
 * down — the length and common-password rules still apply. Off when PASSWORD_BREACH_CHECK=off, and outside
 * production unless PASSWORD_BREACH_CHECK=on.
 */
export async function isBreachedPassword(pw: string, env: Env = process.env, fetcher: BreachFetcher = fetch): Promise<boolean> {
  const mode = env.PASSWORD_BREACH_CHECK?.trim().toLowerCase();
  if (mode === "off" || (env.NODE_ENV !== "production" && mode !== "on")) return false;
  const sha1 = createHash("sha1").update(pw, "utf8").digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  try {
    const res = await fetcher(`https://api.pwnedpasswords.com/range/${prefix}`, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(2_500),
      headers: { "Add-Padding": "true", "user-agent": "the-alpha-hood-password-check" },
    });
    if (!res.ok) return false;
    const body = (await res.text()).slice(0, 2_000_000);
    for (const line of body.split("\n")) {
      const [hash, count] = line.trim().split(":");
      if (hash === suffix && Number(count) > 0) return true;
    }
    return false;
  } catch {
    securityEvent("password_breach_check_unavailable", {});
    return false;
  }
}

/** Full check for a new password: policy, then the breach list. Returns the problem or null. */
export async function newPasswordProblem(pw: unknown, context: (string | null | undefined)[] = [], env: Env = process.env, fetcher?: BreachFetcher): Promise<string | null> {
  const problem = customerPasswordProblem(pw, context);
  if (problem) return problem;
  if (await isBreachedPassword(pw as string, env, fetcher)) return "This password has appeared in a data breach elsewhere. Choose a different one.";
  return null;
}

export const hashCustomerPassword = hashPassword;

/**
 * Checks a password for a customer. Unknown customer / no password → compares against a dummy hash, so the
 * time taken doesn't reveal which emails have an account or a password.
 */
export async function checkCustomerPassword(customerId: string | null, pw: string, store: CredentialStore = resolveCredentials()): Promise<boolean> {
  const cred = customerId ? await store.get(customerId) : null;
  if (!cred || pw.length > CUSTOMER_PASSWORD_MAX) {
    await verifyPassword(pw.slice(0, CUSTOMER_PASSWORD_MAX), await dummyHash());
    return false;
  }
  return verifyPassword(pw, cred.hash);
}
