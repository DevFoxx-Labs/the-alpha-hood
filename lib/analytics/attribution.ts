import { CONSENT_COOKIE, parseChoice, readCookie } from "@/lib/consent/cookie";
import { clientIp, userAgent } from "@/lib/http/guard";

/**
 * Consent snapshot taken when an order is placed (ANL-01 server-side events). The Conversions API and GA4
 * Measurement Protocol run later (payment webhook, refunds) without the browser, so the order remembers what
 * the visitor had agreed to at that moment — and only the identifiers that agreement covers:
 * - analytics  → the GA4 client id (from `_ga`), for the server-side `refund` event;
 * - advertising → Meta's `_fbp` / `_fbc`, IP address and browser user agent, for the Purchase event.
 * No consent → nothing is stored and no server event is ever sent for this order.
 */
export interface Attribution {
  analytics: boolean;
  advertising: boolean;
  cookiesVersion: string;
  capturedAt: string;
  gaClientId?: string;
  fbp?: string;
  fbc?: string;
  ip?: string;
  userAgent?: string;
}

const GA_RE = /^GA\d\.\d\.(\d{1,12}\.\d{1,12})$/;
const FBP_RE = /^fb\.\d\.\d{10,14}\.\d{1,25}$/;
const FBC_RE = /^fb\.\d\.\d{10,14}\.[A-Za-z0-9_-]{1,500}$/;

export function attributionFrom(request: Request, cookiesVersion: string, now = new Date()): Attribution | null {
  const header = request.headers.get("cookie");
  const choice = parseChoice(readCookie(header, CONSENT_COOKIE), cookiesVersion);
  if (!choice || (!choice.analytics && !choice.advertising)) return null;
  const out: Attribution = { analytics: choice.analytics, advertising: choice.advertising, cookiesVersion, capturedAt: now.toISOString() };
  if (choice.analytics) {
    const ga = GA_RE.exec(decodeURIComponent(readCookie(header, "_ga") ?? ""));
    if (ga) out.gaClientId = ga[1];
  }
  if (choice.advertising) {
    const fbp = readCookie(header, "_fbp");
    const fbc = readCookie(header, "_fbc");
    if (fbp && FBP_RE.test(fbp)) out.fbp = fbp;
    if (fbc && FBC_RE.test(fbc)) out.fbc = fbc;
    const ip = clientIp(request);
    if (ip !== "unknown") out.ip = ip;
    const ua = userAgent(request);
    if (ua) out.userAgent = ua.slice(0, 300);
  }
  return out;
}
