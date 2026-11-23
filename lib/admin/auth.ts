import { timingSafeEqual } from "node:crypto";
import type { NextResponse } from "next/server";
import { sha256 } from "@/lib/auth/secrets";
import { locks } from "@/lib/concurrency/lock";
import { readCookie } from "@/lib/consent/cookie";
import { clientIp, jsonError } from "@/lib/http/guard";
import { rateLimiter } from "@/lib/http/rate-limit";
import { BackendUnavailableError, type Env } from "@/lib/mock-guard";
import { securityEvent } from "@/lib/security/log";
import { normaliseEmail } from "@/lib/validation";
import { resolveAudit } from "./audit";
import { dummyHash, hashPassword, newTotpSecret, otpauthUri, passwordProblem, verifyPassword, verifyTotp } from "./crypto";
import { can, type Permission, type Role, ROLES } from "./permissions";
import {
  consumeTicket,
  createAdminSession,
  findByEmail,
  issueTicket,
  LOCK_MS,
  MAX_FAILED_LOGINS,
  newStaff,
  readTicket,
  resolveStaffStore,
  SESSION_IDLE_MS,
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

/** Invite acceptance: single use (atomic), UNIQUE email, own password. */
export async function acceptInvite(store: StaffStore, token: unknown, password: unknown, now = Date.now()) {
  const tokenOk = typeof token === "string" && /^[A-Za-z0-9_-]{40,60}$/.test(token);
  const invite = tokenOk ? await store.getInvite(sha256(token as string)) : null;
  if (!invite || invite.used || invite.expiresAt <= now) throw new AdminAuthError(410, "invite_invalid", "This invite link is invalid or has expired.");
  const problem = passwordProblem(password);
  if (problem) throw new AdminAuthError(422, "weak_password", problem);
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
  return { staff, invite: used };
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
  if (s.expiresAt <= now || now - s.lastSeen > SESSION_IDLE_MS) {
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
