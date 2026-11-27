import { type CustomerStore, EmailInUseError, isErased, resolveCustomers } from "@/lib/customers/store";
import { ValidationError } from "@/lib/http/guard";
import type { Env } from "@/lib/mock-guard";
import { type EmailAdapter, resolveEmail } from "@/lib/notify/email";
import { maskEmail, securityEvent } from "@/lib/security/log";
import { cleanText, normaliseEmail } from "@/lib/validation";
import { type OtpStore, resolveOtpStore, sendOtp, verifyOtp } from "./otp";
import {
  type BreachFetcher,
  checkCustomerPassword,
  CUSTOMER_PASSWORD_MAX,
  type CredentialStore,
  hashCustomerPassword,
  newPasswordProblem,
  resolveCredentials,
} from "./passwords";
import { sha256 } from "./secrets";
import { createSecretBox } from "@/lib/db/secret-box";
import { resolveSocialIdentities, type SocialIdentityStore, type SocialProvider } from "./social-identities";

/**
 * ACC-01 email sign-in: a 6-digit code emailed to the address (sign up, passwordless sign-in, forgot password) and
 * email + password sign-in. One service used by every route (web today, the app later).
 *
 * Security:
 * - Codes follow the phone-OTP rules (lib/auth/otp.ts): CSPRNG, HMAC-stored, single use, 5 min, 5 tries, 30 s resend
 *   cooldown, 5/hour and 10/day per address. The HMAC covers "email-auth" + a key derived from the address, so a code
 *   is bound to its address: tried with another address it is simply a wrong code (and isn't used up), and codes for
 *   email verification / admin reset never work here.
 * - No account enumeration: sending a code answers the same for every address; password sign-in gives one message
 *   for "no account", "no password" and "wrong password", and spends the same scrypt time on each.
 * - Only verified addresses sign anyone in (`loginEmail`). An address that is merely typed as a contact email signs
 *   nothing in until its owner enters a code sent to it.
 * - Setting or resetting a password signs out every other session of the account.
 */
export const EMAIL_AUTH_PURPOSE = "email-auth";
/** ≤ 16 characters (the OTP tables' key column); derived from the address, never the address itself. */
export const emailAuthKey = (email: string) => `ea${sha256(`email-auth:${email}`).slice(0, 14)}`;
const CHALLENGE_RE = /^[A-Za-z0-9_-]{16,40}$/;
const purposeFor = (email: string) => `${EMAIL_AUTH_PURPOSE}:${emailAuthKey(email)}`;

export class AuthError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export interface EmailAuthDeps {
  customers?: CustomerStore;
  credentials?: CredentialStore;
  otp?: OtpStore;
  mailer?: EmailAdapter;
  identities?: SocialIdentityStore;
  now?: number;
  env?: Env;
  breachFetcher?: BreachFetcher;
}

function emailOrThrow(raw: unknown): string {
  const email = normaliseEmail(raw);
  if (!email) throw new ValidationError("Enter a valid email address.");
  return email;
}

/** Sends a sign-in / sign-up / reset code. Same answer whether or not the address has an account. */
export async function sendEmailCode(rawEmail: unknown, deps: EmailAuthDeps = {}) {
  const email = emailOrThrow(rawEmail);
  const mailer = deps.mailer ?? resolveEmail();
  if (!mailer.enabled) throw new AuthError(503, "email_unavailable", "Email sign-in is unavailable right now. Use your mobile number instead.");
  return sendOtp(emailAuthKey(email), {
    store: deps.otp ?? resolveOtpStore(),
    now: deps.now,
    purpose: purposeFor(email),
    deliver: (code) =>
      mailer.send(
        {
          to: email,
          subject: `${code} is your The Alpha Hood code`,
          text: [
            `Your code for The Alpha Hood is ${code}.`,
            "",
            "Use it to sign in, create your account or reset your password. It works once and expires in 5 minutes.",
            "Never share it — our team will never ask for it, on a call or anywhere else.",
            "",
            "Didn't ask for this? Ignore this email; nobody can get in without the code.",
          ].join("\n"),
        },
        { demoCode: code },
      ),
  });
}

export type EmailIntent = "signin" | "signup" | "reset";

export interface VerifyEmailInput {
  email: unknown;
  challengeId: unknown;
  code: unknown;
  intent: unknown;
  /** signup / reset: the new password. */
  password?: unknown;
  /** signup: optional display name. */
  name?: unknown;
  /** signup: the Terms + Privacy checkbox (must be exactly true). */
  acceptTerms?: unknown;
}

export interface VerifyEmailResult {
  customerId: string;
  created: boolean;
  passwordSet: boolean;
  /** Consent method to record when `created`. */
  consent: "checkbox" | "signup_notice";
}

/**
 * Checks the code and signs the address in:
 * - signin: existing account → that account; none → a new account (one-tap notice consent, like phone sign-up).
 * - signup: like signin, and sets the password (Terms checkbox required). On an existing account this works as a
 *   password reset — the code already proved the person owns the address.
 * - reset: existing account only; sets the new password.
 * Everything that can be checked without the code (password strength, the checkbox) is checked first, so a valid
 * code is not used up by a form mistake.
 */
export async function verifyEmailCode(input: VerifyEmailInput, deps: EmailAuthDeps = {}): Promise<VerifyEmailResult> {
  const email = emailOrThrow(input.email);
  const intent = input.intent;
  if (intent !== "signin" && intent !== "signup" && intent !== "reset") throw new ValidationError("Choose what you want to do.");
  if (typeof input.challengeId !== "string" || !CHALLENGE_RE.test(input.challengeId) || typeof input.code !== "string") {
    throw new ValidationError("That code is incorrect or has expired.");
  }
  const name = intent === "signup" && input.name !== undefined && input.name !== "" ? cleanText(input.name, "Name", { min: 2, max: 80 }) : null;
  let hash: string | null = null;
  if (intent !== "signin") {
    if (intent === "signup" && input.acceptTerms !== true) throw new AuthError(422, "terms_required", "Please accept the Terms and Privacy Notice to create your account.");
    const problem = await newPasswordProblem(input.password, [email, name], deps.env, deps.breachFetcher);
    if (problem) throw new AuthError(422, "weak_password", problem);
    hash = await hashCustomerPassword(input.password as string);
  }

  const key = await verifyOtp(input.challengeId, input.code.trim(), { store: deps.otp ?? resolveOtpStore(), now: deps.now, purpose: purposeFor(email) });
  // The code belongs to exactly this address (a code sent to another address fails here).
  if (key !== emailAuthKey(email)) throw new ValidationError("That code is incorrect or has expired.");

  const customers = deps.customers ?? resolveCustomers();
  const credentials = deps.credentials ?? resolveCredentials();
  let customerId: string;
  let created = false;
  if (intent === "reset") {
    const existing = await customers.findByLoginEmail(email);
    if (!existing || isErased(existing)) throw new AuthError(404, "no_account", "There's no account with this email yet. Create one instead.");
    customerId = existing.id;
  } else {
    const r = await customers.findOrCreateByEmail(email, deps.now === undefined ? undefined : new Date(deps.now));
    customerId = r.customer.id;
    created = r.created;
    if (created && name) await customers.setName(customerId, name);
  }
  if (hash) {
    await credentials.set(customerId, hash, deps.now === undefined ? undefined : new Date(deps.now));
    securityEvent("password_set", { customer: customerId, via: intent });
  }
  securityEvent("email_code_verified", { customer: customerId, email: maskEmail(email), intent, created });
  return { customerId, created, passwordSet: !!hash, consent: intent === "signup" ? "checkbox" : "signup_notice" };
}

// ── Forgot password in two steps: code first, then the new password ───────────────────────────────

/**
 * Step 1: email → code (sendEmailCode). Step 2 (this): the code is checked and used up, then a reset ticket is
 * issued — sealed (AES-GCM, SECRET_BOX_KEY), bound to this customer + address, valid 10 minutes, and bound to the
 * password version in force (`v`), so it stops working the moment a password is set: single use without storage.
 * Step 3: completeReset(ticket, new password).
 */
export const RESET_COOKIE = "ah_reset";
export const RESET_TTL_MS = 10 * 60_000;
interface ResetTicket {
  c: string;
  e: string;
  v: string;
  exp: number;
}
const credVersion = (cred: { updatedAt: string } | null) => cred?.updatedAt ?? "none";

export async function verifyResetCode(input: { email: unknown; challengeId: unknown; code: unknown }, deps: EmailAuthDeps = {}): Promise<{ customerId: string; ticket: string }> {
  const email = emailOrThrow(input.email);
  if (typeof input.challengeId !== "string" || !CHALLENGE_RE.test(input.challengeId) || typeof input.code !== "string") throw new ValidationError("That code is incorrect or has expired.");
  const key = await verifyOtp(input.challengeId, input.code.trim(), { store: deps.otp ?? resolveOtpStore(), now: deps.now, purpose: purposeFor(email) });
  if (key !== emailAuthKey(email)) throw new ValidationError("That code is incorrect or has expired.");
  const customer = await (deps.customers ?? resolveCustomers()).findByLoginEmail(email);
  // Only the owner of the address gets this far (they entered its code), so naming "no account" reveals nothing.
  if (!customer || isErased(customer)) throw new AuthError(404, "no_account", "There's no account with this email yet. Create one instead.");
  const cred = await (deps.credentials ?? resolveCredentials()).get(customer.id);
  const t: ResetTicket = { c: customer.id, e: email, v: credVersion(cred), exp: (deps.now ?? Date.now()) + RESET_TTL_MS };
  securityEvent("email_code_verified", { customer: customer.id, email: maskEmail(email), intent: "reset_ticket" });
  return { customerId: customer.id, ticket: Buffer.from(createSecretBox(deps.env).seal(JSON.stringify(t))).toString("base64url") };
}

/** Sets the new password with a ticket from verifyResetCode. Returns the customer (the caller signs out every other session). */
export async function completeReset(rawTicket: string | null | undefined, password: unknown, deps: EmailAuthDeps = {}): Promise<string> {
  const expired = new AuthError(410, "reset_expired", "This reset has expired or was already used. Request a new code.");
  if (!rawTicket || rawTicket.length > 2_000 || !/^[A-Za-z0-9_-]+$/.test(rawTicket)) throw expired;
  let t: ResetTicket;
  try {
    t = JSON.parse(createSecretBox(deps.env).open(Buffer.from(rawTicket, "base64url").toString("utf8"))) as ResetTicket;
  } catch {
    throw expired;
  }
  if (typeof t?.c !== "string" || typeof t.e !== "string" || typeof t.v !== "string" || typeof t.exp !== "number" || t.exp < (deps.now ?? Date.now())) throw expired;
  const customer = await (deps.customers ?? resolveCustomers()).get(t.c);
  // The sign-in email must still be the one the code went to.
  if (!customer || isErased(customer) || customer.loginEmail !== t.e) throw expired;
  const credentials = deps.credentials ?? resolveCredentials();
  if (credVersion(await credentials.get(t.c)) !== t.v) throw expired; // a password was set since → ticket used
  const problem = await newPasswordProblem(password, [t.e, customer.name], deps.env, deps.breachFetcher);
  if (problem) throw new AuthError(422, "weak_password", problem); // ticket stays valid: fix the password and retry
  await credentials.set(t.c, await hashCustomerPassword(password as string), deps.now === undefined ? undefined : new Date(deps.now));
  securityEvent("password_set", { customer: t.c, via: "reset" });
  return t.c;
}

/** Email + password sign-in. Returns the customer, or null for every kind of failure (one message for all). */
export async function passwordSignIn(rawEmail: unknown, password: unknown, deps: EmailAuthDeps = {}): Promise<string | null> {
  const email = normaliseEmail(rawEmail);
  const pw = typeof password === "string" ? password.slice(0, CUSTOMER_PASSWORD_MAX + 1) : "";
  const customer = email ? await (deps.customers ?? resolveCustomers()).findByLoginEmail(email) : null;
  const usable = customer && !isErased(customer) ? customer : null;
  const ok = await checkCustomerPassword(usable?.id ?? null, pw, deps.credentials ?? resolveCredentials());
  if (!ok) {
    securityEvent("login_failed", { kind: "password", email: email ? maskEmail(email) : "invalid" });
    return null;
  }
  return usable!.id;
}

/** Signed-in password change: the current password is required. Other sessions are signed out by the caller. */
export async function changePassword(customerId: string, current: unknown, next: unknown, deps: EmailAuthDeps = {}): Promise<void> {
  const customers = deps.customers ?? resolveCustomers();
  const credentials = deps.credentials ?? resolveCredentials();
  const customer = await customers.get(customerId);
  if (!customer) throw new AuthError(401, "unauthenticated", "Please sign in again.");
  if (!(await credentials.get(customerId))) throw new AuthError(409, "no_password", "You haven't set a password yet. Use “Set a password” instead.");
  if (typeof current !== "string" || !(await checkCustomerPassword(customerId, current, credentials))) {
    securityEvent("password_change_failed", { customer: customerId });
    throw new AuthError(403, "wrong_password", "Your current password is incorrect.");
  }
  if (next === current) throw new AuthError(422, "weak_password", "Choose a password you haven't used here before.");
  const problem = await newPasswordProblem(next, [customer.loginEmail, customer.email, customer.name], deps.env, deps.breachFetcher);
  if (problem) throw new AuthError(422, "weak_password", problem);
  await credentials.set(customerId, await hashCustomerPassword(next as string), deps.now === undefined ? undefined : new Date(deps.now));
  securityEvent("password_set", { customer: customerId, via: "change" });
}

export interface SignInMethods {
  /** Masked mobile number, or null. */
  phone: string | null;
  /** Verified sign-in email, or null. */
  email: string | null;
  password: boolean;
  social: SocialProvider[];
}

export async function signInMethods(customerId: string, deps: EmailAuthDeps = {}): Promise<SignInMethods | null> {
  const customer = await (deps.customers ?? resolveCustomers()).get(customerId);
  if (!customer || isErased(customer)) return null;
  const [cred, linked] = await Promise.all([(deps.credentials ?? resolveCredentials()).get(customerId), (deps.identities ?? resolveSocialIdentities()).listFor(customerId)]);
  return {
    phone: customer.phone ? `+91 ${"•".repeat(6)}${customer.phone.slice(-4)}` : null,
    email: customer.loginEmail,
    password: !!cred && !!customer.loginEmail,
    social: linked.map((l) => l.provider),
  };
}

/** How many independent ways in are left (a password only works with the sign-in email, so it isn't counted apart). */
export const methodCount = (m: SignInMethods) => (m.phone ? 1 : 0) + (m.email ? 1 : 0) + m.social.length;

export { EmailInUseError };
