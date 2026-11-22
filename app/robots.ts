import type { MetadataRoute } from "next";
import { indexingAllowed } from "@/lib/seo/indexing";
import { siteUrl } from "@/lib/seo/site";

/**
 * CMS-03 robots.txt. Private and transactional areas are never crawled. Until the live store is configured
 * (real SITE_URL, real backend), the whole site is disallowed so previews and demo data never get indexed.
 */
export default function robots(): MetadataRoute.Robots {
  if (!indexingAllowed()) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api/", "/account", "/checkout", "/bag", "/wishlist", "/dev", "/search", "/privacy/request", "/*?*sort="],
      },
    ],
    sitemap: siteUrl("/sitemap.xml"),
    host: siteUrl("/"),
  };
}
