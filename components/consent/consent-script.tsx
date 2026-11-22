"use client";

import Script from "next/script";
import type { CookiePurpose } from "@/lib/consent/purposes";
import { useConsent } from "./consent-provider";

/**
 * The only way a third-party tracker may be added (ANL-01, M8): the script element is not rendered — so
 * nothing is requested — until the visitor has accepted `purpose`. Loads after the page is idle.
 * Withdrawal reloads the page (consent-provider), so the script is gone afterwards.
 */
export function ConsentScript({
  purpose,
  id,
  src,
  children,
}: {
  purpose: CookiePurpose;
  id: string;
  src?: string;
  children?: string;
}) {
  const { allowed } = useConsent();
  if (!allowed(purpose)) return null;
  return (
    <Script id={id} src={src} strategy="lazyOnload">
      {children}
    </Script>
  );
}
