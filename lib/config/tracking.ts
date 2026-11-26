import type { Env } from "@/lib/mock-guard";
import { live } from "@/lib/settings/version";

/**
 * Third-party trackers (ANL-01). Each one is "in use" only when its public ID is configured, and even then
 * its script loads only after the visitor accepts the matching cookie category (components/consent).
 * IDs are public identifiers, not secrets; they are read on the server and passed down as props.
 * Server-side secrets (Conversions API token, GA4 API secret) live in lib/analytics/server.ts, never here.
 */
export interface TrackingConfig {
  /** GA4 measurement ID, e.g. G-XXXXXXX — "analytics" consent. */
  ga4Id: string | null;
  /** Meta Pixel ID (digits) — "advertising" consent. */
  metaPixelId: string | null;
  /** Google Ads conversion ID, e.g. AW-123456789 — "advertising" consent. */
  googleAdsId: string | null;
  /** Google Ads purchase conversion label (with googleAdsId). */
  googleAdsPurchaseLabel: string | null;
}

export function readTracking(env: Env = process.env): TrackingConfig {
  const ga4 = env.GA4_MEASUREMENT_ID?.trim() ?? "";
  const pixel = env.META_PIXEL_ID?.trim() ?? "";
  const ads = env.GOOGLE_ADS_ID?.trim() ?? "";
  const label = env.GOOGLE_ADS_PURCHASE_LABEL?.trim() ?? "";
  const adsId = /^AW-\d{6,14}$/.test(ads) ? ads : null;
  return {
    ga4Id: /^G-[A-Z0-9]{4,16}$/.test(ga4) ? ga4 : null,
    metaPixelId: /^\d{6,20}$/.test(pixel) ? pixel : null,
    googleAdsId: adsId,
    googleAdsPurchaseLabel: adsId && /^[A-Za-z0-9_-]{4,40}$/.test(label) ? label : null,
  };
}

/** Re-read after Admin → Settings changes a tracker ID (lib/settings/runtime.ts). */
export const TRACKING: TrackingConfig = live(() => readTracking());
