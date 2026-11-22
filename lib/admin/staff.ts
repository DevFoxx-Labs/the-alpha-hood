import { randomBytes } from "node:crypto";
import { randomToken, sha256 } from "@/lib/auth/secrets";
import { BackendUnavailableError, devSingleton, type Env, mockDataAllowed } from "@/lib/mock-guard";
import { normaliseEmail } from "@/lib/validation";
import type { Role } from "./permissions";

/**
 * Staff accounts (ADM-08). Password + mandatory TOTP for every role — there is no sign-in path without the
 * second factor. New staff join by a one-time invite link (24 h) and set their own password; nobody ever
 * knows another person's password. In-memory for dev / previews; refused in production without a database.
 * TOTP secrets must be encrypted at rest once persisted (docs/known-gaps.md).
 */
export interface Staff {
  id: string;
  email: string;
  name: string;
  role: Role;
  passwordHash: string | null;
  totpSecret: string | null;
  totpEnabled: boolean;
  lastTotpStep: number;
  disabled: boolean;
  failedLogins: number;
  lockedUntil: number;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface Invite {
  tokenHash: string;
  email: string;
  name: string;
  role: Role;
  invitedBy: string;
  expiresAt: number;
  used: boolean;
}

export interface AdminSession {
  staffId: string;
  createdAt: number;
  lastSeen: number;
  expiresAt: number;
}

/** Short-lived step between password and TOTP (never a session). */
export interface LoginTicket {
  staffId: string;
  expiresAt: number;
  attempts: number;
  pendingSecret: string | null;
}

export interface StaffStore {
  staff: Map<string, Staff>;
  invites: Map<string, Invite>;
  sessions: Map<string, AdminSession>;
  tickets: Map<string, LoginTicket>;
}

export function createStaffStore(): StaffStore {
  return { staff: new Map(), invites: new Map(), sessions: new Map(), tickets: new Map() };
}

export function resolveStaffStore(env: Env = process.env): StaffStore {
  if (!mockDataAllowed(env)) throw new BackendUnavailableError("Staff accounts");
  return devSingleton("staff_store", createStaffStore);
}

export function findByEmail(store: StaffStore, email: string): Staff | null {
  const e = normaliseEmail(email);
  if (!e) return null;
  for (const s of store.staff.values()) if (s.email === e) return s;
  return null;
}

export function newStaff(input: { email: string; name: string; role: Role; passwordHash: string | null }): Staff {
  return {
    id: `stf_${randomBytes(9).toString("hex")}`,
    email: input.email,
    name: input.name,
    role: input.role,
    passwordHash: input.passwordHash,
    totpSecret: null,
    totpEnabled: false,
    lastTotpStep: -1,
    disabled: false,
    failedLogins: 0,
    lockedUntil: 0,
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
  };
}

export const INVITE_TTL_MS = 24 * 3_600_000;
export const TICKET_TTL_MS = 5 * 60_000;
export const SESSION_ABSOLUTE_MS = 12 * 3_600_000;
export const SESSION_IDLE_MS = 30 * 60_000;
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MS = 15 * 60_000;

export function createInvite(store: StaffStore, input: Omit<Invite, "tokenHash" | "expiresAt" | "used">, now = Date.now()): string {
  const token = randomToken(32);
  store.invites.set(sha256(token), { ...input, tokenHash: sha256(token), expiresAt: now + INVITE_TTL_MS, used: false });
  return token;
}

export function issueTicket(store: StaffStore, staffId: string, now = Date.now()): string {
  const token = randomToken(24);
  store.tickets.set(sha256(token), { staffId, expiresAt: now + TICKET_TTL_MS, attempts: 0, pendingSecret: null });
  return token;
}

export function readTicket(store: StaffStore, token: unknown, now = Date.now()): LoginTicket | null {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{20,60}$/.test(token)) return null;
  const t = store.tickets.get(sha256(token));
  if (!t || t.expiresAt <= now || t.attempts >= 5) return null;
  return t;
}

export function consumeTicket(store: StaffStore, token: string) {
  store.tickets.delete(sha256(token));
}

export function createAdminSession(store: StaffStore, staffId: string, now = Date.now()): string {
  const token = randomToken(32);
  store.sessions.set(sha256(token), { staffId, createdAt: now, lastSeen: now, expiresAt: now + SESSION_ABSOLUTE_MS });
  return token;
}

/** Revokes every admin session of a staff member (role change, disable, password reset). */
export function revokeStaffSessions(store: StaffStore, staffId: string): number {
  let n = 0;
  for (const [k, s] of store.sessions) {
    if (s.staffId !== staffId) continue;
    store.sessions.delete(k);
    n++;
  }
  return n;
}

export function publicStaff(s: Staff) {
  return {
    id: s.id,
    email: s.email,
    name: s.name,
    role: s.role,
    mfa: s.totpEnabled,
    disabled: s.disabled,
    createdAt: s.createdAt,
    lastLoginAt: s.lastLoginAt,
  };
}
