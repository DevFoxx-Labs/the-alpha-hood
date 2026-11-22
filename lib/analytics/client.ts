"use client";

import { CONSENT_COOKIE, parseChoice, readCookie } from "@/lib/consent/cookie";
import type { CookiePurpose } from "@/lib/consent/purposes";
import { type EventMap, type EventName, purchaseEventId, rupeesValue, toGa4, toMeta } from "./events";

/**
 * Browser side of ANL-01. `track()` is safe to call from any component:
 * - it reads the visitor's choice from the `ah_consent` cookie on every call, so nothing is queued, stored
 *   or sent before consent, and a withdrawal takes effect on the next event;
 * - GA4 gets events only with "analytics", Meta Pixel and Google Ads only with "advertising";
 * - the tracker scripts themselves are loaded by <Analytics/> (components/analytics) through ConsentScript.
 * Until a script arrives, events wait in the vendor's own standard queue (dataLayer / fbq.queue).
 */
export interface ClientTracking {
  ga4Id: string | null;
  metaPixelId: string | null;
  googleAdsId: string | null;
  googleAdsPurchaseLabel: string | null;
  cookiesVersion: string;
}

type Gtag = (...args: unknown[]) => void;
type Fbq = ((...args: unknown[]) => void) & { queue?: unknown[]; callMethod?: (...a: unknown[]) => void; loaded?: boolean; version?: string; push?: unknown };
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

export const TRACKING_ELEMENT_ID = "ah-tracking";

let cached: ClientTracking | null | undefined;
function config(): ClientTracking | null {
  if (cached !== undefined) return cached;
  try {
    const el = document.getElementById(TRACKING_ELEMENT_ID);
    cached = el?.textContent ? (JSON.parse(el.textContent) as ClientTracking) : null;
  } catch {
    cached = null;
  }
  return cached;
}

export function consentFor(purpose: CookiePurpose): boolean {
  const cfg = config();
  if (!cfg || typeof document === "undefined") return false;
  const choice = parseChoice(readCookie(document.cookie, CONSENT_COOKIE), cfg.cookiesVersion);
  return choice?.[purpose] === true;
}

let gtagState: string | null = null;
/** The official gtag bootstrap (no network request — the script is loaded separately after consent). */
export function ensureGtag(cfg: ClientTracking, analytics: boolean, advertising: boolean) {
  if (!window.gtag) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
  }
  // Google consent mode mirrors the visitor's choice; the script itself only loads after a "yes".
  const state = {
    analytics_storage: analytics ? "granted" : "denied",
    ad_storage: advertising ? "granted" : "denied",
    ad_user_data: advertising ? "granted" : "denied",
    ad_personalization: advertising ? "granted" : "denied",
  };
  const key = `${analytics ? 1 : 0}${advertising ? 1 : 0}`;
  if (gtagState === key) return;
  if (gtagState === null) {
    window.gtag("consent", "default", state);
    window.gtag("js", new Date());
  } else {
    // Accepting a second category later in the same page view (withdrawal reloads the page instead).
    window.gtag("consent", "update", state);
  }
  if (analytics && cfg.ga4Id && !configured.has(cfg.ga4Id)) {
    configured.add(cfg.ga4Id);
    window.gtag("config", cfg.ga4Id, { send_page_view: true });
  }
  if (advertising && cfg.googleAdsId && !configured.has(cfg.googleAdsId)) {
    configured.add(cfg.googleAdsId);
    window.gtag("config", cfg.googleAdsId);
  }
  gtagState = key;
}
const configured = new Set<string>();

let fbqReady = false;
/** The official Meta Pixel bootstrap queue (the script tag is rendered by ConsentScript). */
export function ensureFbq(cfg: ClientTracking) {
  if (!cfg.metaPixelId) return;
  if (!window.fbq) {
    const n: Fbq = function (...args: unknown[]) {
      if (n.callMethod) n.callMethod(...args);
      else n.queue!.push(args);
    } as Fbq;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    window.fbq = n;
    window._fbq = n;
  }
  if (fbqReady) return;
  fbqReady = true;
  window.fbq("init", cfg.metaPixelId);
  window.fbq("track", "PageView");
}

const TRACKED_KEY = "ah_tracked_orders";
/** A purchase is reported once per device (refreshing the confirmation page doesn't double count). */
function firstTimeFor(orderNumber: string): boolean {
  try {
    const list = JSON.parse(window.localStorage.getItem(TRACKED_KEY) ?? "[]") as string[];
    if (list.includes(orderNumber)) return false;
    window.localStorage.setItem(TRACKED_KEY, JSON.stringify([...list, orderNumber].slice(-20)));
    return true;
  } catch {
    return true;
  }
}

export function track<N extends EventName>(name: N, params: EventMap[N]): void {
  if (typeof window === "undefined") return;
  const cfg = config();
  if (!cfg) return;
  const analytics = !!cfg.ga4Id && consentFor("analytics");
  const advertising = (!!cfg.metaPixelId || !!cfg.googleAdsId) && consentFor("advertising");
  if (!analytics && !advertising) return;
  if (name === "purchase" && !firstTimeFor((params as EventMap["purchase"]).orderNumber)) return;

  try {
    if (analytics || (advertising && cfg.googleAdsId)) ensureGtag(cfg, analytics, advertising);
    if (analytics) {
      const ga = toGa4(name, params);
      if (ga) window.gtag!("event", name, { ...ga, send_to: cfg.ga4Id });
    }
    if (advertising && cfg.googleAdsId && cfg.googleAdsPurchaseLabel && name === "purchase") {
      const p = params as EventMap["purchase"];
      window.gtag!("event", "conversion", {
        send_to: `${cfg.googleAdsId}/${cfg.googleAdsPurchaseLabel}`,
        value: rupeesValue(p.value),
        currency: "INR",
        transaction_id: p.orderNumber,
      });
    }
    if (advertising && cfg.metaPixelId) {
      const meta = toMeta(name, params);
      if (meta) {
        ensureFbq(cfg);
        const eventID = name === "purchase" ? purchaseEventId((params as EventMap["purchase"]).orderNumber) : undefined;
        window.fbq!("track", meta.name, meta.params, eventID ? { eventID } : undefined);
      }
    }
  } catch {
    // Analytics must never break shopping.
  }
}

/** Test hook: forget the parsed config and bootstrap state. */
export function resetAnalyticsForTests() {
  cached = undefined;
  gtagState = null;
  configured.clear();
  fbqReady = false;
}
