import type { NextResponse } from "next/server";
import { isVisitorId, readCookie, VISITOR_COOKIE, VISITOR_MAX_AGE } from "./cookie";

/** Reads the anonymous visitor ID (strictly necessary cookie) or mints a new one. */
export function visitorFrom(request: Request): { id: string; isNew: boolean } {
  const existing = readCookie(request.headers.get("cookie"), VISITOR_COOKIE);
  if (isVisitorId(existing)) return { id: existing, isNew: false };
  return { id: crypto.randomUUID(), isNew: true };
}

export function existingVisitor(request: Request): string | null {
  const existing = readCookie(request.headers.get("cookie"), VISITOR_COOKIE);
  return isVisitorId(existing) ? existing : null;
}

export function setVisitorCookie(response: NextResponse, id: string) {
  response.cookies.set(VISITOR_COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: VISITOR_MAX_AGE,
  });
}
