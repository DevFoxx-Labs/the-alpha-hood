import { listOffers, loadCartView, publicCartView } from "@/lib/cart/service";
import { commerce } from "@/lib/commerce";
import { clientIp, guardPublicWrite, jsonError } from "@/lib/http/guard";
import { cartIdFrom, commerceErrorResponse, privateJson } from "@/lib/http/commerce-http";
import { rateLimiter } from "@/lib/http/rate-limit";
import { findCoupon, isCouponLive, normaliseCouponCode } from "@/lib/promotions/coupons";
import { asObject, rejectUnknownFields } from "@/lib/validation";

/**
 * Coupons on the bag (PROMO-01, CART-02).
 * GET  — "View all offers": live coupons with the saving on this bag or the reason they don't apply.
 * POST `{ code }` — apply; DELETE `{}` — remove. Tight per-IP limit + a daily cap stop code guessing.
 */
export async function GET(request: Request) {
  const rl = rateLimiter.hit(`offers:ip:${clientIp(request)}`, 60, 60_000);
  if (!rl.ok) return jsonError(429, "rate_limited", "Too many requests.");
  try {
    return privateJson({ offers: listOffers(await loadCartView(cartIdFrom(request))) });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const guard = await guardPublicWrite(request, { name: "coupon", limit: 10, windowMs: 10 * 60_000, maxBytes: 128 });
  if (!guard.ok) return guard.response;
  const daily = rateLimiter.hit(`coupon-day:ip:${guard.ip}`, 40, 86_400_000);
  if (!daily.ok) return jsonError(429, "rate_limited", "Too many coupon attempts today.");
  const cartId = cartIdFrom(request);
  if (!cartId) return jsonError(409, "cart_empty", "Add something to your bag first.");
  try {
    const input = asObject(guard.body);
    rejectUnknownFields(input, ["code"]);
    const code = normaliseCouponCode(input.code);
    const coupon = code ? findCoupon(code) : null;
    // Same message for unknown and expired codes (no code enumeration).
    if (!coupon || !isCouponLive(coupon, new Date())) return jsonError(422, "invalid_coupon", "This coupon code isn't valid.");

    const view = await loadCartView(cartId);
    if (!view.id) return jsonError(409, "cart_empty", "Add something to your bag first.");
    const trial = listOffers(view).find((o) => o.code === coupon.code);
    if (!trial?.ok) return jsonError(422, "coupon_not_applicable", trial?.reason ?? "This coupon can't be used on your bag.");

    await commerce.cart.setCoupon(cartId, coupon.code);
    return privateJson(publicCartView(await loadCartView(cartId)));
  } catch (error) {
    return commerceErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const guard = await guardPublicWrite(request, { name: "coupon-remove", limit: 30, windowMs: 10 * 60_000, maxBytes: 64 });
  if (!guard.ok) return guard.response;
  const cartId = cartIdFrom(request);
  if (!cartId) return privateJson(publicCartView(await loadCartView(null)));
  try {
    if (await commerce.cart.get(cartId)) await commerce.cart.setCoupon(cartId, null);
    return privateJson(publicCartView(await loadCartView(cartId)));
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
