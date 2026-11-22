import { commerce } from "@/lib/commerce";
import { clientIp, jsonError } from "@/lib/http/guard";
import { commerceErrorResponse } from "@/lib/http/commerce-http";
import { rateLimiter } from "@/lib/http/rate-limit";

/** GET /api/products/by-ids?ids=a,b,c — public catalogue data for the wishlist page (max 50 ids). */
export async function GET(request: Request) {
  const rl = rateLimiter.hit(`by-ids:ip:${clientIp(request)}`, 60, 60_000);
  if (!rl.ok) return jsonError(429, "rate_limited", "Too many requests.");
  const raw = new URL(request.url).searchParams.get("ids") ?? "";
  const ids = [...new Set(raw.split(","))].filter((id) => /^[a-z0-9_]{1,64}$/.test(id)).slice(0, 50);
  try {
    const products = (await Promise.all(ids.map((id) => commerce.getProductById(id)))).filter((p) => p !== null);
    return Response.json({ products }, { headers: { "Cache-Control": "public, max-age=60" } });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
