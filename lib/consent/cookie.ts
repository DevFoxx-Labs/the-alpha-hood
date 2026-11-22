import type { CookiePurpose } from "./purposes";

/**
 * The `ah_consent` cookie — isomorphic (server sets it, client reads it to gate trackers).
 * Format: `1.<cookiesNoticeVersion>.a<0|1>.d<0|1>.<unix seconds>`. No personal data.
 * A choice made under an older Cookie Policy version is treated as "no choice" (ask again).
 */
export const CONSENT_COOKIE = "ah_consent";
export const VISITOR_COOKIE = "ah_vid";
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 180;
export const VISITOR_MAX_AGE = 60 * 60 * 24 * 365;

export type CookieChoice = Record<CookiePurpose, boolean> & {
  /** Cookie Policy version the choice was made under. */
  version: string;
  decidedAt: number;
};

export const NO_OPTIONAL_COOKIES: Record<CookiePurpose, boolean> = { analytics: false, advertising: false };

const RE = /^1\.(\d{4}-\d{2}-\d{2})\.a([01])\.d([01])\.(\d{1,12})$/;

export function serializeChoice(choice: CookieChoice): string {
  return `1.${choice.version}.a${choice.analytics ? 1 : 0}.d${choice.advertising ? 1 : 0}.${Math.trunc(choice.decidedAt)}`;
}

export function parseChoice(raw: string | undefined | null, currentVersion: string): CookieChoice | null {
  if (!raw) return null;
  const m = RE.exec(decodeURIComponent(raw));
  if (!m) return null;
  const [, version, a, d, at] = m;
  if (version !== currentVersion) return null;
  return { version, analytics: a === "1", advertising: d === "1", decidedAt: Number(at) };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isVisitorId(value: string | undefined | null): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Minimal cookie-header parser (server side, for route handlers and tests). */
export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}
