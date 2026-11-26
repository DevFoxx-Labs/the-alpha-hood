import { randomBytes } from "node:crypto";
import type { NextResponse } from "next/server";
import { sha256 } from "@/lib/auth/secrets";
import { readCookie } from "@/lib/consent/cookie";
import { dbStores } from "@/lib/db";
import { devSingleton, mockDataAllowed } from "@/lib/mock-guard";

/**
 * New-device sign-in detection (AstroGaon's "new_device_sign_in"). Each browser gets a random device id in a
 * strictly necessary HttpOnly cookie (`ah_device`, 12 months — listed in the Cookie Policy). A sign-in is "new" the
 * first time an account is seen with that device id. Only a hash of (account, device) is stored, through the
 * database's one-time markers — no device list, no IP history, nothing to profile anyone with.
 */
export const DEVICE_COOKIE = "ah_device";
const DEVICE_RE = /^[A-Za-z0-9_-]{32}$/;
const YEAR_S = 365 * 86_400;

export type AccountKind = "customer" | "staff";

/** True the first time (account, device) is seen. Never throws: on a storage error it says "not new" (no alert spam). */
async function firstSeen(kind: AccountKind, accountId: string, deviceId: string): Promise<boolean> {
  const key = sha256(`device:${kind}:${accountId}:${deviceId}`).slice(0, 64);
  try {
    const db = dbStores();
    if (db) return await db.primitives.marker("known_device", key);
    if (!mockDataAllowed()) return false;
    const seen = devSingleton("known_devices", () => new Set<string>());
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  } catch {
    return false;
  }
}

export interface DeviceCheck {
  deviceId: string;
  /** This account has not signed in on this browser before. */
  isNew: boolean;
  /** The browser had no (valid) device cookie: set it on the response. */
  setCookie: boolean;
}

export async function checkDevice(kind: AccountKind, accountId: string, request: Request): Promise<DeviceCheck> {
  const existing = readCookie(request.headers.get("cookie"), DEVICE_COOKIE);
  const deviceId = existing && DEVICE_RE.test(existing) ? existing : randomBytes(24).toString("base64url");
  return { deviceId, isNew: await firstSeen(kind, accountId, deviceId), setCookie: deviceId !== existing };
}

export function setDeviceCookie(response: NextResponse, check: DeviceCheck) {
  if (!check.setCookie) return;
  response.cookies.set(DEVICE_COOKIE, check.deviceId, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: YEAR_S });
}

/** "Chrome on Windows" — a short, safe label from the user agent (no version numbers, no raw header). */
export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "a browser";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad|iPod/.test(ua) ? "iPhone / iPad" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "an unknown device";
  return `${browser} on ${os}`;
}

export const signInTime = (now = new Date()) =>
  now.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).replace(/ /g, " ");
