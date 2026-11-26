import type { NextConfig } from "next";
import { nextRedirects } from "./lib/seo/redirects";

// Baseline security headers. A full CSP (nonce-based) is tracked in docs/known-gaps.md.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // geolocation=(self): "Use my current location" in the address form (asked only when the customer taps it).
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const LISTING_PARAMS = [
  "size", "fit", "colour", "fabric", "sleeve", "pattern", "occasion",
  "price", "discount", "instock", "sort", "page",
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // Image pipeline (web-performance rule): AVIF/WebP, and srcset widths no wider than our widest source (1920 px
  // hero composites; mascot sources are ≤ 1536 px), so no 2048 / 3840 candidates repeat in every page.
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [360, 480, 640, 828, 1080, 1280, 1536, 1920],
    imageSizes: [64, 96, 128, 192, 256, 320],
    minimumCacheTTL: 2_678_400,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // CMS-03 redirects manager (lib/seo/redirects.ts). Permanent = 308, treated like a 301 by search engines.
  async redirects() {
    return nextRedirects();
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/dev/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      { source: "/admin/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "Cache-Control", value: "no-store" }] },
      { source: "/admin", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "Cache-Control", value: "no-store" }] },
      // PLP-02: filtered / sorted / paged listing URLs are crawlable but not indexed (canonical = clean URL).
      ...LISTING_PARAMS.map((key) => ({
        source: "/:path*",
        has: [{ type: "query" as const, key }],
        headers: [{ key: "X-Robots-Tag", value: "noindex, follow" }],
      })),
      { source: "/search", headers: [{ key: "X-Robots-Tag", value: "noindex, follow" }] },
      // PWA: the service worker must always be revalidated so a fix ships at once.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }] },
    ];
  },
};

export default nextConfig;
