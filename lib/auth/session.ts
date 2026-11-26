import { securityPolicy } from "@/lib/security/policy";
import type { NextResponse } from "next/server";
import { readCookie } from "@/lib/consent/cookie";
import { dbStores } from "@/lib/db";
import { BackendUnavailableError, devSingleton, type Env, mockDataAllowed } from "@/lib/mock-guard";
import { randomToken, sha256 } from "./secrets";

/**
 * Customer sessions after OTP verification. The cookie holds a random 256-bit token; the server stores only
 * its SHA-256, so a leaked session table can't be replayed. HttpOnly, Secure (prod), SameSite=Lax.
 * A new token is issued on every sign-in (no fixation). Storage: memory (dev/tests) or the own-backend
 * database (MySQL / PostgreSQL / MongoDB) — see lib/db.
 */
export const SESSION_COOKIE = "ah_session";
/** Default; the value in force comes from Admin → Settings → Security (lib/security/policy.ts). */
export const SESSION_TTL_MS = 30 * 86_400_000;

export interface SessionRecord {
  customerId: string;
  createdAt: number;
  expiresAt: number;
}

export interface SessionStore {
  put(tokenHash: string, s: SessionRecord): Promise<void>;
  get(tokenHash: string): Promise<SessionRecord | null>;
  delete(tokenHash: string): Promise<void>;
  /** Revokes every session of a customer; returns how many. */
  deleteByCustomer(customerId: string): Promise<number>;
}

export function createMemorySessionStore(): SessionStore {
  const sessions = new Map<string, SessionRecord>();
  return {
    async put(h, s) {
      sessions.set(h, s);
    },
    async get(h) {
      return sessions.get(h) ?? null;
    },
    async delete(h) {
      sessions.delete(h);
    },
    async deleteByCustomer(id) {
      let n = 0;
      for (const [h, s] of sessions) {
        if (s.customerId === id) {
          sessions.delete(h);
          n++;
        }
      }
      return n;
    },
  };
}

export function resolveSessionStore(env: Env = process.env): SessionStore {
  const db = dbStores(env);
  if (db) return db.sessions;
  if (!mockDataAllowed(env)) throw new BackendUnavailableError("Session store");
  return devSingleton("session_store_v2", createMemorySessionStore);
}

export async function createSession(customerId: string, store = resolveSessionStore(), now = Date.now()): Promise<string> {
  const token = randomToken(32);
  await store.put(sha256(token), { customerId, createdAt: now, expiresAt: now + securityPolicy().customerSessionMs });
  return token;
}

const TOKEN_RE = /^[A-Za-z0-9_-]{40,60}$/;

export function sessionTokenFrom(request: Request): string | null {
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  return token && TOKEN_RE.test(token) ? token : null;
}

/** Sign out this browser. */
export async function revokeSession(token: string, store = resolveSessionStore()) {
  await store.delete(sha256(token));
}

/** "Sign out everywhere" / account deletion: revoke every session of a customer. Returns how many. */
export async function revokeAllSessions(customerId: string, store = resolveSessionStore()): Promise<number> {
  return store.deleteByCustomer(customerId);
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
}

export async function customerIdFromRequest(request: Request, store?: SessionStore, now = Date.now()): Promise<string | null> {
  const token = sessionTokenFrom(request);
  if (!token) return null;
  const s = await (store ?? resolveSessionStore()).get(sha256(token));
  if (!s || s.expiresAt <= now) return null;
  return s.customerId;
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: securityPolicy().customerSessionMs / 1000,
  });
}
