"use client";

import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import { ConsentScript } from "@/components/consent/consent-script";
import { useConsent } from "@/components/consent/consent-provider";
import { type ClientTracking, ensureFbq, ensureGtag } from "@/lib/analytics/client";

/**
 * Loads gtag.js (GA4 with "analytics"; Google Ads with "advertising") and the Meta Pixel ("advertising") only
 * after the visitor accepts — via ConsentScript, the single gate for third-party scripts (DPDP rule §5).
 */
export function AnalyticsLoader({ tracking }: { tracking: ClientTracking }) {
  const { allowed } = useConsent();
  const analytics = !!tracking.ga4Id && allowed("analytics");
  const advertising = allowed("advertising");
  const googleId = analytics ? tracking.ga4Id : advertising ? tracking.googleAdsId : null;

  useEffect(() => {
    if (analytics || (advertising && tracking.googleAdsId)) ensureGtag(tracking, analytics, advertising);
    if (advertising && tracking.metaPixelId) ensureFbq(tracking);
  }, [analytics, advertising, tracking]);

  return (
    <>
      {googleId ? (
        <ConsentScript purpose={analytics ? "analytics" : "advertising"} id="gtag-js" src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(googleId)}`} />
      ) : null}
      {tracking.metaPixelId ? <ConsentScript purpose="advertising" id="meta-pixel" src="https://connect.facebook.net/en_US/fbevents.js" /> : null}
      {advertising && tracking.metaPixelId ? (
        <Suspense fallback={null}>
          <MetaPageViews />
        </Suspense>
      ) : null}
    </>
  );
}

/** Meta counts a PageView per client-side navigation (GA4 does this itself via enhanced measurement). */
function MetaPageViews() {
  const pathname = usePathname();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false; // the initial PageView is sent by ensureFbq
      return;
    }
    window.fbq?.("track", "PageView");
  }, [pathname]);
  return null;
}
