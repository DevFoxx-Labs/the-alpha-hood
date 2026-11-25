import { randomBytes } from "node:crypto";
import { randomToken, sha256 } from "@/lib/auth/secrets";
import { dbStores } from "@/lib/db";
import { BackendUnavailableError, devSingleton, type Env, mockDataAllowed } from "@/lib/mock-guard";
import { normaliseEmail } from "@/lib/validation";
import type { Role } from "./permissions";

/**
 * Staff accounts (ADM-08). Password + mandatory TOTP for every role — there is no sign-in path without the
 * second factor. New staff join by a one-time invite link (24 h) and set their own password; nobody ever
 * knows another person's password.
 *
 * Storage is behind `StaffStore` (memory in dev; MySQL / PostgreSQL / MongoDB on the own backend, with TOTP
 * secrets encrypted at rest). Every security counter is an atomic store operation, so two servers or two
 * parallel requests can't bypass it: failed-login lockout, TOTP step replay, single-use invites, ticket attempts.
 * Only SHA-256 hashes of invite / ticket / session tokens are stored.
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
  /**
   * Password-reset link: the staff id whose password this link replaces (null/absent = a normal join invite).
   * Same one-time, hashed, expiring token as an invite; the second factor (TOTP) is never touched by it.
   */
  resetFor?: string | null;
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

export class StaffConflictError extends Error {
  constructor() {
    super("Someone with this email is already on the team.");
    this.name = "StaffConflictError";
  }
}

export interface StaffStore {
  count(): Promise<number>;
  list(): Promise<Staff[]>;
  get(id: string): Promise<Staff | null>;
  byEmail(email: string): Promise<Staff | null>;
  /** Throws StaffConflictError when the email is taken (UNIQUE). */
  insert(staff: Staff): Promise<void>;
  /** Read-modify-write under a row lock / version check. Return false from `patch` to skip the write. */
  update(id: string, patch: (s: Staff) => boolean | void): Promise<Staff | null>;
  /** +1 failed login; at `max` the account locks until `lockUntil` and the counter resets. Returns true if it locked. */
  recordFailedLogin(id: string, max: number, lockUntil: number): Promise<boolean>;
  /**
   * Accepts a TOTP step only if it's newer than the last used one (no replay, even in parallel), resets the failed
   * counter, stamps the sign-in and — on enrolment — stores the secret and turns MFA on.
   */
  useTotpStep(id: string, step: number, at: string, enrolSecret: string | null): Promise<boolean>;

  putInvite(invite: Invite): Promise<void>;
  /** Open invites (not used, not expired). */
  listInvites(now: number): Promise<Invite[]>;
  getInvite(tokenHash: string): Promise<Invite | null>;
  /** Marks the invite used if it's still open; returns it, or null (used / expired / unknown) — single use. */
  consumeInvite(tokenHash: string, now: number): Promise<Invite | null>;

  putTicket(tokenHash: string, ticket: LoginTicket): Promise<void>;
  getTicket(tokenHash: string): Promise<LoginTicket | null>;
  /** +1 attempt; returns the new count (null if unknown). */
  bumpTicket(tokenHash: string): Promise<number | null>;
  /** Stores the pending enrolment secret if none yet; returns the stored one (the same secret for parallel calls). */
  setTicketSecret(tokenHash: string, secret: string): Promise<string | null>;
  deleteTicket(tokenHash: string): Promise<void>;

  putSession(tokenHash: string, session: AdminSession): Promise<void>;
  getSession(tokenHash: string): Promise<AdminSession | null>;
  touchSession(tokenHash: string, now: number): Promise<void>;
  deleteSession(tokenHash: string): Promise<void>;
  deleteSessionsOf(staffId: string): Promise<number>;
}

export function createStaffStore(): StaffStore & { staff: Map<string, Staff> } {
  const staff = new Map<string, Staff>();
  const invites = new Map<string, Invite>();
  const sessions = new Map<string, AdminSession>();
  const tickets = new Map<string, LoginTicket>();
  const copy = <T>(v: T | undefined): T | null => (v ? structuredClone(v) : null);
  return {
    staff,
    async count() {
      return staff.size;
    },
    async list() {
      return [...staff.values()].map((s) => structuredClone(s));
    },
    async get(id) {
      return copy(staff.get(id));
    },
    async byEmail(email) {
      for (const s of staff.values()) if (s.email === email) return structuredClone(s);
      return null;
    },
    async insert(s) {
      for (const x of staff.values()) if (x.email === s.email) throw new StaffConflictError();
      staff.set(s.id, structuredClone(s));
    },
    async update(id, patch) {
      const cur = staff.get(id);
      if (!cur) return null;
      const next = structuredClone(cur);
      if (patch(next) === false) return structuredClone(cur);
      staff.set(id, next);
      return structuredClone(next);
    },
    async recordFailedLogin(id, max, lockUntil) {
      const s = staff.get(id);
      if (!s) return false;
      s.failedLogins += 1;
      if (s.failedLogins < max) return false;
      s.failedLogins = 0;
      s.lockedUntil = lockUntil;
      return true;
    },
    async useTotpStep(id, step, at, enrolSecret) {
      const s = staff.get(id);
      if (!s || step <= s.lastTotpStep) return false;
      if (enrolSecret !== null) {
        if (s.totpEnabled) return false;
        s.totpSecret = enrolSecret;
        s.totpEnabled = true;
      }
      s.lastTotpStep = step;
      s.lastLoginAt = at;
      s.failedLogins = 0;
      return true;
    },
    async putInvite(i) {
      invites.set(i.tokenHash, { ...i });
    },
    async listInvites(now) {
      return [...invites.values()].filter((i) => !i.used && i.expiresAt > now).map((i) => ({ ...i }));
    },
    async getInvite(h) {
      return copy(invites.get(h));
    },
    async consumeInvite(h, now) {
      const i = invites.get(h);
      if (!i || i.used || i.expiresAt <= now) return null;
      i.used = true;
      return { ...i };
    },
    async putTicket(h, t) {
      tickets.set(h, { ...t });
    },
    async getTicket(h) {
      return copy(tickets.get(h));
    },
    async bumpTicket(h) {
      const t = tickets.get(h);
      if (!t) return null;
      t.attempts += 1;
      return t.attempts;
    },
    async setTicketSecret(h, secret) {
      const t = tickets.get(h);
      if (!t) return null;
      t.pendingSecret ??= secret;
      return t.pendingSecret;
    },
    async deleteTicket(h) {
      tickets.delete(h);
    },
    async putSession(h, s) {
      sessions.set(h, { ...s });
    },
    async getSession(h) {
      return copy(sessions.get(h));
    },
    async touchSession(h, now) {
      const s = sessions.get(h);
      if (s) s.lastSeen = now;
    },
    async deleteSession(h) {
      sessions.delete(h);
    },
    async deleteSessionsOf(staffId) {
      let n = 0;
      for (const [k, s] of sessions) {
        if (s.staffId !== staffId) continue;
        sessions.delete(k);
        n++;
      }
      return n;
    },
  };
}

export function resolveStaffStore(env: Env = process.env): StaffStore {
  const db = dbStores(env);
  if (db) return db.staff;
  if (!mockDataAllowed(env)) throw new BackendUnavailableError("Staff accounts");
  return devSingleton("staff_store_v2", createStaffStore);
}

export async function findByEmail(store: StaffStore, email: string): Promise<Staff | null> {
  const e = normaliseEmail(email);
  return e ? store.byEmail(e) : null;
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
export const TICKET_MAX_ATTEMPTS = 5;
export const SESSION_ABSOLUTE_MS = 12 * 3_600_000;
export const SESSION_IDLE_MS = 30 * 60_000;
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MS = 15 * 60_000;

const TOKEN_RE = /^[A-Za-z0-9_-]{20,60}$/;

export async function createInvite(store: StaffStore, input: Omit<Invite, "tokenHash" | "expiresAt" | "used">, now = Date.now()): Promise<string> {
  const token = randomToken(32);
  await store.putInvite({ ...input, tokenHash: sha256(token), expiresAt: now + INVITE_TTL_MS, used: false });
  return token;
}

export async function issueTicket(store: StaffStore, staffId: string, now = Date.now()): Promise<string> {
  const token = randomToken(24);
  await store.putTicket(sha256(token), { staffId, expiresAt: now + TICKET_TTL_MS, attempts: 0, pendingSecret: null });
  return token;
}

export async function readTicket(store: StaffStore, token: unknown, now = Date.now()): Promise<LoginTicket | null> {
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return null;
  const t = await store.getTicket(sha256(token));
  if (!t || t.expiresAt <= now || t.attempts >= TICKET_MAX_ATTEMPTS) return null;
  return t;
}

export async function consumeTicket(store: StaffStore, token: string) {
  await store.deleteTicket(sha256(token));
}

export async function createAdminSession(store: StaffStore, staffId: string, now = Date.now()): Promise<string> {
  const token = randomToken(32);
  await store.putSession(sha256(token), { staffId, createdAt: now, lastSeen: now, expiresAt: now + SESSION_ABSOLUTE_MS });
  return token;
}

/** Revokes every admin session of a staff member (role change, disable, password reset). */
export function revokeStaffSessions(store: StaffStore, staffId: string): Promise<number> {
  return store.deleteSessionsOf(staffId);
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
