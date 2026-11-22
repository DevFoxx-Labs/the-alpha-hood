import { toJsonLd } from "@/lib/seo/json-ld";
import { type ClientTracking, TRACKING_ELEMENT_ID } from "@/lib/analytics/client";
import { AnalyticsLoader } from "./analytics-loader";

/**
 * ANL-01 mount point (root layout). Writes the public tracker IDs as inert JSON (no request, no cookie) and
 * renders the consent-gated loader. With no IDs configured nothing at all is rendered.
 */
export function Analytics({ tracking }: { tracking: ClientTracking }) {
  if (!tracking.ga4Id && !tracking.metaPixelId && !tracking.googleAdsId) return null;
  return (
    <>
      <script type="application/json" id={TRACKING_ELEMENT_ID} dangerouslySetInnerHTML={{ __html: toJsonLd(tracking) }} />
      <AnalyticsLoader tracking={tracking} />
    </>
  );
}
