import { timingSafeEqual } from "node:crypto";
import type { NextResponse } from "next/server";
import { randomToken, sha256 } from "@/lib/auth/secrets";
import { locks } from "@/lib/concurrency/lock";
import { readCookie } from "@/lib/consent/cookie";
import { clientIp, jsonError } from "@/lib/http/guard";
import { rateLimiter } from "@/lib/http/rate-limit";
import { BackendUnavailableError, type Env } from "@/lib/mock-guard";
import { securityEvent } from "@/lib/security/log";
import { securityPolicy } from "@/lib/security/policy";
import { OTP_TTL_MS, OtpError, type OtpStore, resolveOtpStore, sendOtp, verifyOtp } from "@/lib/auth/otp";
import { type EmailAdapter, resolveEmail } from "@/lib/notify/email";
import { normaliseEmail } from "@/lib/validation";
import { resolveAudit } from "./audit";
import { dummyHash, hashPassword, newTotpSecret, otpauthUri, passwordProblem, verifyPassword, verifyTotp } from "./crypto";
import { can, type Permission, type Role, ROLES } from "./permissions";
import {
  consumeTicket,
  createAdminSession,
  findByEmail,
  type Invite,
  issueTicket,
  LOCK_MS,
  MAX_FAILED_LOGINS,
  newStaff,
  readTicket,
  resolveStaffStore,
  revokeStaffSessions,
  type Staff,
  StaffConflictError,
  type StaffStore,
} from "./staff";

/**
 * Admin authentication (ADM-08, secure-development §2): password → mandatory TOTP → session. One path only;
 * every admin API awaits `await requireStaff(request, permission)` (deny by default). The admin cookie is
 * HttpOnly + SameSite=Strict, 12 h absolute / 30 min idle, revoked on role change or disable.
 */
export const ADMIN_COOKIE = "ah_admin";

export class AdminAuthError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

const GENERIC = "Email or password is incorrect.";
const EXPIRED = "Your sign-in expired. Start again.";

/** First owner (ADM-08 bootstrap). Allowed only while no staff exist, and in production only with ADMIN_SETUP_TOKEN. */
export async function setupAllowed(store: StaffStore, token: unknown, env: Env = process.env): Promise<boolean> {
  if ((await store.count()) > 0) return false;
  if (env.NODE_ENV !== "production") return true;
  const expected = env.ADMIN_SETUP_TOKEN ?? "";
  if (expected.length < 32 || typeof token !== "string" || token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

/**
 * Creates the first owner. The "no staff yet" check and the insert run under one lock, so two setup requests
 * racing each other can't both create an owner.
 */
export async function createOwner(store: StaffStore, input: { email: unknown; name: unknown; password: unknown; token?: unknown }, env: Env = process.env) {
  const email = normaliseEmail(input.email);
  if (!email) throw new AdminAuthError(422, "invalid_input", "Enter a valid email.");
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 80) : "";
  if (name.length < 2) throw new AdminAuthError(422, "invalid_input", "Enter your name.");
  const problem = passwordProblem(input.password);
  if (problem) throw new AdminAuthError(422, "weak_password", problem);
  const passwordHash = await hashPassword(input.password as string);
  return locks.run("admin:setup", async () => {
    if (!(await setupAllowed(store, input.token, env))) throw new AdminAuthError(403, "setup_closed", "Setup is closed.");
    const owner = newStaff({ email, name, role: "owner", passwordHash });
    await store.insert(owner);
    return owner;
  });
}

/** Step 1: password. Returns a ticket for the TOTP step; same error for unknown email / wrong password. */
export async function passwordStep(store: StaffStore, email: unknown, password: unknown, now = Date.now()) {
  const staff = typeof email === "string" ? await findByEmail(store, email) : null;
  const pw = typeof password === "string" ? password.slice(0, 200) : "";
  if (!staff || !staff.passwordHash || staff.disabled) {
    await verifyPassword(pw, await dummyHash());
    throw new AdminAuthError(401, "invalid_credentials", GENERIC);
  }
  if (staff.lockedUntil > now) throw new AdminAuthError(429, "locked", "Too many attempts. Try again in 15 minutes.");
  if (!(await verifyPassword(pw, staff.passwordHash))) {
    if (await store.recordFailedLogin(staff.id, MAX_FAILED_LOGINS, now + LOCK_MS)) securityEvent("otp_locked", { staff: staff.id, kind: "admin_password" });
    throw new AdminAuthError(401, "invalid_credentials", GENERIC);
  }
  return { ticket: await issueTicket(store, staff.id, now), step: staff.totpEnabled ? ("totp" as const) : ("enrol" as const) };
}

/** First sign-in: generate a TOTP secret to scan (shown once, bound to this ticket). */
export async function enrolStep(store: StaffStore, ticket: string, now = Date.now()) {
  const t = await readTicket(store, ticket, now);
  if (!t) throw new AdminAuthError(401, "expired", EXPIRED);
  const staff = await store.get(t.staffId);
  if (!staff || staff.disabled) throw new AdminAuthError(401, "expired", EXPIRED);
  if (staff.totpEnabled) throw new AdminAuthError(409, "already_enrolled", "Two-step verification is already set up.");
  const secret = t.pendingSecret ?? (await store.setTicketSecret(sha256(ticket), newTotpSecret()));
  if (!secret) throw new AdminAuthError(401, "expired", EXPIRED);
  return { secret, uri: otpauthUri(secret, staff.email) };
}

/** Step 2: TOTP (or enrolment confirmation) → admin session token. */
export async function totpStep(store: StaffStore, ticket: string, code: unknown, now = Date.now()): Promise<{ token: string; staff: Staff }> {
  const t = await readTicket(store, ticket, now);
  if (!t) throw new AdminAuthError(401, "expired", EXPIRED);
  const staff = await store.get(t.staffId);
  if (!staff || staff.disabled) throw new AdminAuthError(401, "expired", EXPIRED);
  const secret = staff.totpEnabled ? staff.totpSecret : t.pendingSecret;
  if (!secret) throw new AdminAuthError(409, "enrol_first", "Set up two-step verification first.");
  // Count the attempt before checking, atomically: parallel guesses can't exceed the ticket's limit.
  const attempts = await store.bumpTicket(sha256(ticket));
  if (attempts === null || attempts > 5) throw new AdminAuthError(401, "expired", EXPIRED);
  const step = typeof code === "string" ? verifyTotp(secret, code.trim(), now, staff.lastTotpStep) : null;
  // The store accepts a step only once (and only if newer), so a code can't be replayed in parallel either.
  if (step === null || !(await store.useTotpStep(staff.id, step, new Date(now).toISOString(), staff.totpEnabled ? null : secret))) {
    securityEvent("otp_verify_failed", { staff: staff.id, kind: "admin_totp" });
    throw new AdminAuthError(401, "invalid_code", "That code is incorrect.");
  }
  await consumeTicket(store, ticket);
  securityEvent("login", { staff: staff.id, kind: "admin" });
  const fresh = (await store.get(staff.id)) ?? staff;
  return { token: await createAdminSession(store, staff.id, now), staff: fresh };
}

/**
 * Step-up for the most sensitive admin writes (payment keys): a fresh authenticator code inside an already
 * signed-in session, so a stolen session cookie alone can't redirect the store's money. Attempts are limited per
 * staff member; a code is accepted once (same replay rule as sign-in).
 */
export async function confirmTotp(staff: Staff, code: unknown, store: StaffStore = resolveStaffStore(), now = Date.now()): Promise<void> {
  // 10 per 10 minutes: enough for a session of provider changes, far too few to guess a 6-digit code.
  const rl = await rateLimiter.hit(`admin:stepup:${staff.id}`, 10, 10 * 60_000);
  if (!rl.ok) throw new AdminAuthError(429, "rate_limited", "Too many attempts. Try again in a few minutes.");
  const fresh = await store.get(staff.id);
  const step = fresh?.totpSecret && typeof code === "string" ? verifyTotp(fresh.totpSecret, code.trim(), now, fresh.lastTotpStep) : null;
  if (!fresh || step === null || !(await store.useTotpStep(fresh.id, step, new Date(now).toISOString(), null))) {
    securityEvent("otp_verify_failed", { staff: staff.id, kind: "admin_stepup" });
    throw new AdminAuthError(401, "invalid_code", "That code is incorrect. Use a new code from your authenticator app.");
  }
}

/** Invite acceptance: single use (atomic), UNIQUE email, own password. */
export async function acceptInvite(store: StaffStore, token: unknown, password: unknown, now = Date.now()) {
  const tokenOk = typeof token === "string" && /^[A-Za-z0-9_-]{40,60}$/.test(token);
  const invite = tokenOk ? await store.getInvite(sha256(token as string)) : null;
  if (!invite || invite.used || invite.expiresAt <= now) throw new AdminAuthError(410, "invite_invalid", "This invite link is invalid or has expired.");
  const problem = passwordProblem(password);
  if (problem) throw new AdminAuthError(422, "weak_password", problem);
  if (invite.resetFor) return resetPassword(store, invite, password as string, now);
  if (await store.byEmail(invite.email)) throw new AdminAuthError(409, "exists", "This invite was already used.");
  const passwordHash = await hashPassword(password as string);
  const used = await store.consumeInvite(invite.tokenHash, now);
  if (!used) throw new AdminAuthError(410, "invite_invalid", "This invite link is invalid or has expired.");
  const staff = newStaff({ email: used.email, name: used.name, role: used.role, passwordHash });
  try {
    await store.insert(staff);
  } catch (e) {
    if (e instanceof StaffConflictError) throw new AdminAuthError(409, "exists", "This invite was already used.");
    throw e;
  }
  return { staff, invite: used, reset: false };
}

/**
 * Password-reset link (issued by an owner, or by the server-side recovery script). Single use (atomic consume);
 * the link only works for the same account (id + email) and never for a disabled one. The new password clears
 * the lockout and signs the person out everywhere. Two-step verification stays as it is — a reset link alone
 * can never get anyone in.
 */
async function resetPassword(store: StaffStore, invite: Invite, password: string, now: number) {
  const invalid = () => new AdminAuthError(410, "invite_invalid", "This link is invalid or has expired.");
  const target = await store.get(invite.resetFor as string);
  if (!target || target.disabled || target.email !== invite.email) throw invalid();
  const passwordHash = await hashPassword(password);
  const used = await store.consumeInvite(invite.tokenHash, now);
  if (!used) throw invalid();
  const staff = await applyNewPassword(store, target.id, used.email, passwordHash);
  if (!staff) throw invalid();
  return { staff, invite: used, reset: true };
}

/**
 * The one place a staff password is replaced (owner link, email code, CLI). Only for the same active account
 * (id + email re-checked inside the row update). Clears the lockout and signs the person out everywhere.
 * Two-step verification is left as it is. Returns null when the account no longer qualifies.
 */
async function applyNewPassword(store: StaffStore, staffId: string, email: string, passwordHash: string): Promise<Staff | null> {
  const staff = await store.update(staffId, (s) => {
    if (s.disabled || s.email !== email) return false;
    s.passwordHash = passwordHash;
    s.failedLogins = 0;
    s.lockedUntil = 0;
  });
  if (!staff || staff.passwordHash !== passwordHash) return null;
  await revokeStaffSessions(store, staff.id);
  return staff;
}

/* ---------- Self-service reset by email code ("Forgot password?") ---------- */

/** OTP purpose: an admin reset code never verifies on customer sign-in, and a customer code never resets a password. */
export const ADMIN_RESET_PURPOSE = "admin-reset";

/** ≤16-char key for the shared OTP store (its key column is sized for phone numbers); derived, so no email is stored there. */
export const adminOtpKey = (email: string) => `ae${sha256(`admin-reset:${email}`).slice(0, 14)}`;

const CODE_INVALID = "That code is incorrect or has expired.";

/**
 * Step 1: email a 6-digit code (5 min, 5 tries, single use, 30 s cooldown, 5/h and 10/day per email; HMAC-stored).
 * The answer is the same whether or not the email belongs to an active staff member, and also when this email
 * is in cooldown / over its cap, so nobody can probe which addresses are staff. (The dev-only demo code is the
 * exception: it's returned only for a real account, and the demo mailer is refused in production.)
 */
export async function requestResetCode(
  emailInput: unknown,
  { store = resolveStaffStore(), otp = resolveOtpStore(), mailer = resolveEmail(), now = Date.now() }: { store?: StaffStore; otp?: OtpStore; mailer?: EmailAdapter; now?: number } = {},
): Promise<{ challengeId: string; expiresInSeconds: number; demoCode?: string }> {
  const email = normaliseEmail(emailInput);
  if (!email) throw new AdminAuthError(422, "invalid_input", "Enter a valid email.");
  if (!mailer.enabled) throw new AdminAuthError(503, "email_unavailable", "Email reset isn't set up yet. Ask an owner for a reset link.");
  const decoy = { challengeId: randomToken(18), expiresInSeconds: OTP_TTL_MS / 1000 };
  const staff = await store.byEmail(email);
  if (!staff || staff.disabled || !staff.passwordHash) return decoy;
  try {
    return await sendOtp(adminOtpKey(email), {
      store: otp,
      now,
      purpose: ADMIN_RESET_PURPOSE,
      deliver: (code) =>
        mailer.send(
          {
            to: staff.email,
            subject: "Your The Alpha Hood admin reset code",
            text: [
              `Your code to reset your The Alpha Hood admin password is ${code}.`,
              "",
              "It works once and expires in 5 minutes. Never share it — our team will never ask for it.",
              "You will still need your authenticator code to sign in.",
              "",
              "Didn't ask for this? Ignore this email. Your password has not changed.",
            ].join("\n"),
          },
          { demoCode: code },
        ),
    });
  } catch (e) {
    if (e instanceof OtpError) return decoy;
    throw e;
  }
}

/**
 * Step 2: code + new password. The password is checked first, so a weak one doesn't burn the code. Every wrong
 * code / wrong email / unknown account gives the same message. Success: new password, lockout cleared, every
 * session revoked, MFA unchanged (the next sign-in still needs the authenticator code).
 */
export async function resetWithCode(
  input: { email: unknown; challengeId: unknown; code: unknown; password: unknown },
  { store = resolveStaffStore(), otp = resolveOtpStore(), now = Date.now() }: { store?: StaffStore; otp?: OtpStore; now?: number } = {},
): Promise<Staff> {
  const email = normaliseEmail(input.email);
  const { challengeId, code } = input;
  if (!email || typeof challengeId !== "string" || !/^[A-Za-z0-9_-]{20,40}$/.test(challengeId) || typeof code !== "string" || !/^\d{6}$/.test(code.trim())) {
    throw new AdminAuthError(400, "code_invalid", CODE_INVALID);
  }
  const problem = passwordProblem(input.password);
  if (problem) throw new AdminAuthError(422, "weak_password", problem);
  let key: string;
  try {
    key = await verifyOtp(challengeId, code.trim(), { store: otp, now, purpose: ADMIN_RESET_PURPOSE });
  } catch (e) {
    if (e instanceof OtpError) throw new AdminAuthError(e.code === "locked" ? 429 : 400, e.code === "locked" ? "code_locked" : "code_invalid", e.message);
    throw e;
  }
  if (key !== adminOtpKey(email)) throw new AdminAuthError(400, "code_invalid", CODE_INVALID);
  const target = await store.byEmail(email);
  if (!target || target.disabled) throw new AdminAuthError(400, "code_invalid", CODE_INVALID);
  const staff = await applyNewPassword(store, target.id, email, await hashPassword(input.password as string));
  if (!staff) throw new AdminAuthError(400, "code_invalid", CODE_INVALID);
  return staff;
}

/** Best-effort "your password was changed" email after any reset, so a takeover can't go unnoticed. Never throws. */
export async function notifyPasswordChanged(staff: Staff, via: "email_code" | "owner_link", mailer: EmailAdapter = resolveEmail()): Promise<void> {
  if (!mailer.enabled) return;
  try {
    await mailer.send({
      to: staff.email,
      subject: "Your The Alpha Hood admin password was changed",
      text: [
        `Your The Alpha Hood admin password was just changed (${via === "email_code" ? "with a code sent to this email" : "with a reset link from an owner"}).`,
        "You've been signed out on every device.",
        "",
        "If this wasn't you, tell an owner right away so they can disable the account.",
      ].join("\n"),
    });
  } catch {
    // A notice failing must not undo or block the reset; the audit log still has it.
  }
}

export const RESET_TTL_MS = 60 * 60_000;

/** One-time password-reset link for an existing, active staff member (1 hour). Returns the raw token. */
export async function createPasswordReset(store: StaffStore, target: Staff, issuedBy: string, now = Date.now()): Promise<string> {
  if (target.disabled) throw new AdminAuthError(409, "disabled", "This account is disabled. Re-enable it first.");
  const token = randomToken(32);
  await store.putInvite({ tokenHash: sha256(token), email: target.email, name: target.name, role: target.role, invitedBy: issuedBy, expiresAt: now + RESET_TTL_MS, used: false, resetFor: target.id });
  return token;
}

export function setAdminCookie(response: NextResponse, token: string) {
  response.cookies.set(ADMIN_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 12 * 3600 });
}

export function clearAdminCookie(response: NextResponse) {
  response.cookies.set(ADMIN_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 0 });
}

export function adminTokenFrom(request: Request): string | null {
  const v = readCookie(request.headers.get("cookie"), ADMIN_COOKIE);
  return v && /^[A-Za-z0-9_-]{40,60}$/.test(v) ? v : null;
}

/** Current staff from the admin cookie (sliding idle timeout), or null. */
export async function staffFromRequest(request: Request, store: StaffStore = resolveStaffStore(), now = Date.now()): Promise<Staff | null> {
  const token = adminTokenFrom(request);
  if (!token) return null;
  const key = sha256(token);
  const s = await store.getSession(key);
  if (!s) return null;
  if (s.expiresAt <= now || now - s.lastSeen > securityPolicy().staffIdleMs) {
    await store.deleteSession(key);
    return null;
  }
  const staff = await store.get(s.staffId);
  if (!staff || staff.disabled || !staff.totpEnabled) {
    await store.deleteSession(key);
    return null;
  }
  await store.touchSession(key, now);
  return staff;
}

export type StaffGuard = { ok: true; staff: Staff; ip: string } | { ok: false; response: Response };

/** Every /api/admin route: rate limit → authenticated staff with MFA → permission (deny by default). */
export async function requireStaff(request: Request, permission: Permission): Promise<StaffGuard> {
  const ip = clientIp(request);
  const rl = await rateLimiter.hit(`admin:ip:${ip}`, 300, 60_000);
  if (!rl.ok) return { ok: false, response: jsonError(429, "rate_limited", "Too many requests.") };
  let staff: Staff | null;
  try {
    staff = await staffFromRequest(request);
  } catch (e) {
    if (e instanceof BackendUnavailableError) return { ok: false, response: jsonError(503, "unavailable", "Admin is unavailable.") };
    throw e;
  }
  if (!staff) return { ok: false, response: jsonError(401, "unauthenticated", "Please sign in.") };
  if (!can(staff.role, permission)) {
    securityEvent("otp_verify_failed", { staff: staff.id, kind: "admin_forbidden", permission });
    return { ok: false, response: jsonError(403, "forbidden", "You don't have access to this.") };
  }
  return { ok: true, staff, ip };
}

export async function audit(guard: { staff: Staff; ip: string }, action: string, target: string, details: Record<string, string | number | boolean | null> = {}) {
  await resolveAudit().append({ actorId: guard.staff.id, actorEmail: guard.staff.email, action, target, details, ip: guard.ip });
}

export function parseRole(v: unknown): Role {
  if (typeof v === "string" && (ROLES as readonly string[]).includes(v)) return v as Role;
  throw new AdminAuthError(422, "invalid_input", "Choose a role.");
}
