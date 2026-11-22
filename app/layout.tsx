import type { Metadata, Viewport } from "next";
import { Anton, Inter } from "next/font/google";
import { ConsentProvider } from "@/components/consent/consent-provider";
import { CookieBanner, CookiePreferences } from "@/components/consent/cookie-banner";
import { StoreUIProvider } from "@/components/store/store-ui-provider";
import { Toaster } from "@/components/ui/sonner";
import { TRACKING } from "@/lib/config/tracking";
import { activeCookiePurposes } from "@/lib/consent/purposes";
import { NOTICES } from "@/lib/legal";
import "./globals.css";

// DESIGN.md §2.2 — self-hosted by next/font (no request to Google from the browser), swap, Latin subset.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
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
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-IN" className={`${inter.variable} ${anton.variable} antialiased`}>
      <body className="min-h-dvh">
        <ConsentProvider activePurposes={activeCookiePurposes(TRACKING)} cookiesVersion={NOTICES.cookies.version}>
          <StoreUIProvider>
            {children}
            <Toaster />
          </StoreUIProvider>
          <CookieBanner />
          <CookiePreferences />
        </ConsentProvider>
      </body>
    </html>
  );
}
