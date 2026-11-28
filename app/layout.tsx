import type { Metadata, Viewport } from "next";
import { Anton } from "next/font/google";
import localFont from "next/font/local";
import { Analytics } from "@/components/analytics/analytics";
import { WebVitals } from "@/components/analytics/web-vitals";
import { ServiceWorker } from "@/components/store/service-worker";
import { ConsentProvider } from "@/components/consent/consent-provider";
import { CookieBanner, CookiePreferences } from "@/components/consent/cookie-banner";
import { StoreUIProvider } from "@/components/store/store-ui-provider";
import { Toaster } from "@/components/ui/sonner";
import { TRACKING } from "@/lib/config/tracking";
import { activeCookiePurposes } from "@/lib/consent/purposes";
import { NOTICES } from "@/lib/legal";
import { indexingAllowed } from "@/lib/seo/indexing";
import { SITE_ORIGIN } from "@/lib/seo/site";
import "./globals.css";

/*
 * DESIGN.md §2.2: Inter, self-hosted. These are the same Google files that next/font/google served, copied
 * byte-for-byte by scripts/build-fonts.py (see its header). The only change is that ₹ (U+20B9) now comes
 * from a 1.3 KB file instead of the 83 KB latin-ext file, which every page with a price used to download at
 * high priority. Faces keep Google's unicode-ranges (latin-ext minus U+20B9). "Inter Fallback" is in
 * app/globals.css with next/font's original values. Loader options must be literals, so ranges are repeated.
 */
const inter = localFont({
  src: "../assets/fonts/inter-latin.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["Inter Fallback"],
  declarations: [
    { prop: "font-family", value: "Inter" },
    { prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" },
  ],
});
// The other faces share the family name "Inter" with their own unicode-range and download only when a page
// shows one of their characters. Their (unused) variables on <html> keep their CSS in the bundle.
const interRupee = localFont({
  src: "../assets/fonts/inter-rupee.woff2",
  variable: "--font-inter-rupee",
  weight: "100 900",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Inter" },
    { prop: "unicode-range", value: "U+20B9" },
  ],
});
const interLatinExt = localFont({
  src: "../assets/fonts/inter-latin-ext.woff2",
  variable: "--font-inter-latin-ext",
  weight: "100 900",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Inter" },
    { prop: "unicode-range", value: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20B8, U+20BA-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF" },
  ],
});
const interVietnamese = localFont({
  src: "../assets/fonts/inter-vietnamese.woff2",
  variable: "--font-inter-vietnamese",
  weight: "100 900",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Inter" },
    { prop: "unicode-range", value: "U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB" },
  ],
});

const anton = Anton({
  variable: "--font-anton",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "The Alpha Hood — Built for the ones who lead",
    template: "%s · The Alpha Hood",
  },
  description: "Bold streetwear and everyday menswear, designed in India.",
  metadataBase: new URL(SITE_ORIGIN),
  applicationName: "The Alpha Hood",
  openGraph: { type: "website", siteName: "The Alpha Hood", locale: "en_IN" },
  twitter: { card: "summary_large_image" },
  // CMS-03: nothing is indexable until the live store is switched on (lib/seo/indexing.ts).
  ...(indexingAllowed() ? {} : { robots: { index: false, follow: false } }),
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-IN" className={`${inter.variable} ${interRupee.variable} ${interLatinExt.variable} ${interVietnamese.variable} ${anton.variable} antialiased`}>
      <body className="min-h-dvh">
        <ConsentProvider activePurposes={activeCookiePurposes(TRACKING)} cookiesVersion={NOTICES.cookies.version}>
          <StoreUIProvider>
            {children}
            <Toaster />
          </StoreUIProvider>
          <CookieBanner />
          <CookiePreferences />
          <Analytics tracking={{ ...TRACKING, cookiesVersion: NOTICES.cookies.version }} />
          <WebVitals />
          <ServiceWorker />
        </ConsentProvider>
      </body>
    </html>
  );
}
