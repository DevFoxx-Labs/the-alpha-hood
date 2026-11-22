import { STORE_CONFIG } from "@/lib/config/store";
import { merchantFeedXml } from "@/lib/feeds/merchant";
import { clientIp, jsonError } from "@/lib/http/guard";
import { rateLimiter } from "@/lib/http/rate-limit";
import { getAllProducts, storefrontAvailable } from "@/lib/storefront";

/**
 * GET /feeds/products.xml — ANL-02 Google Merchant Center + Meta catalogue feed (both read this format).
 * Public catalogue data only. Built from the cached catalogue (minutes), so price / stock changes reach the
 * feed on the platforms' next scheduled fetch. Not indexed; rate-limited per IP.
 */
export async function GET(request: Request) {
  const rl = rateLimiter.hit(`feed:ip:${clientIp(request)}`, 30, 60 * 60_000);
  if (!rl.ok) return jsonError(429, "rate_limited", "Too many requests.");
  if (!storefrontAvailable()) return jsonError(503, "unavailable", "Catalogue not available.");
  const products = await getAllProducts();
  const body = merchantFeedXml(products, { brand: STORE_CONFIG.name, title: STORE_CONFIG.name });
  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=900, s-maxage=900",
      "X-Robots-Tag": "noindex",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
