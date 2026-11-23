import { loadCartView, publicCartView } from "@/lib/cart/service";
import { clientIp, jsonError } from "@/lib/http/guard";
import { cartIdFrom, commerceErrorResponse, privateJson } from "@/lib/http/commerce-http";
import { rateLimiter } from "@/lib/http/rate-limit";

/** CART-01/02/05: GET /api/cart — the bag, re-validated against the catalogue and stock, server-priced. */
export async function GET(request: Request) {
  const rl = await rateLimiter.hit(`cart-read:ip:${clientIp(request)}`, 120, 60_000);
  if (!rl.ok) return jsonError(429, "rate_limited", "Too many requests.", { "Retry-After": String(rl.retryAfterSeconds) });
  try {
    return privateJson(publicCartView(await loadCartView(cartIdFrom(request))));
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
