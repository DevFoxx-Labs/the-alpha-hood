import type { Env } from "@/lib/mock-guard";

/**
 * Third-party trackers (ANL-01). Each one is "in use" only when its public ID is configured, and even then
 * its script loads only after the visitor accepts the matching cookie category (components/consent).
 * IDs are public identifiers, not secrets; they are read on the server and passed down as props.
 */
export interface TrackingConfig {
  /** GA4 measurement ID, e.g. G-XXXXXXX. */
  ga4Id: string | null;
  /** Meta Pixel ID (digits). */
  metaPixelId: string | null;
}

export function readTracking(env: Env = process.env): TrackingConfig {
  const ga4 = env.GA4_MEASUREMENT_ID?.trim() ?? "";
  const pixel = env.META_PIXEL_ID?.trim() ?? "";
  return {
    ga4Id: /^G-[A-Z0-9]{4,16}$/.test(ga4) ? ga4 : null,
    metaPixelId: /^\d{6,20}$/.test(pixel) ? pixel : null,
  };
}

export const TRACKING = readTracking();
