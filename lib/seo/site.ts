import type { Env } from "@/lib/mock-guard";

/**
 * Canonical origin for sitemaps, feeds, structured data and Open Graph (CMS-03). Only an absolute https URL
 * without a path is accepted (http only for localhost). Anything else is ignored, so a typo in `SITE_URL`
 * can never point canonicals at another host.
 */
export function readSiteUrl(env: Env = process.env): string {
  const raw = env.SITE_URL?.trim() ?? "";
  try {
    const u = new URL(raw);
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if ((u.protocol === "https:" || (local && u.protocol === "http:")) && (u.pathname === "/" || u.pathname === "") && !u.search && !u.hash && !u.username) {
      return u.origin;
    }
  } catch {
    // fall through
  }
  return "http://localhost:3000";
}

export const SITE_ORIGIN = readSiteUrl();

/** True once a real public origin is configured (sitemaps and feeds need absolute URLs). */
export const SITE_URL_CONFIGURED = SITE_ORIGIN !== "http://localhost:3000";

export function siteUrl(path: string): string {
  return `${SITE_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}
