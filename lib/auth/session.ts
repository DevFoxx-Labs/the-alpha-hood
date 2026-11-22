import type { NextResponse } from "next/server";
import { readCookie } from "@/lib/consent/cookie";
import { BackendUnavailableError, devSingleton, type Env, mockDataAllowed } from "@/lib/mock-guard";
import { randomToken, sha256 } from "./secrets";

/**
 * Customer sessions after OTP verification. The cookie holds a random 256-bit token; the server stores only
 * its SHA-256, so a leaked session table can't be replayed. HttpOnly, Secure (prod), SameSite=Lax.
 * A new token is issued on every sign-in (no fixation). Full account management arrives in M6.
 */
export const SESSION_COOKIE = "ah_session";
export const SESSION_TTL_MS = 30 * 86_400_000;

interface Session {
  customerId: string;
  createdAt: number;
  expiresAt: number;
}

export interface SessionStore {
  sessions: Map<string, Session>;
}

export function resolveSessionStore(env: Env = process.env): SessionStore {
  if (!mockDataAllowed(env)) throw new BackendUnavailableError("Session store");
  return devSingleton("session_store", () => ({ sessions: new Map<string, Session>() }));
}

export function createSession(customerId: string, store = resolveSessionStore(), now = Date.now()): string {
  const token = randomToken(32);
  store.sessions.set(sha256(token), { customerId, createdAt: now, expiresAt: now + SESSION_TTL_MS });
  return token;
}

export function customerIdFromRequest(request: Request, store?: SessionStore, now = Date.now()): string | null {
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  if (!token || !/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const s = (store ?? resolveSessionStore()).sessions.get(sha256(token));
  if (!s || s.expiresAt <= now) return null;
  return s.customerId;
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}
