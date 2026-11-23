import { attributionFrom } from "@/lib/analytics/attribution";
import { giftCardTriesLeft } from "@/lib/giftcards/limits";
import { parseTenderChoice } from "@/lib/wallet/tenders";
import { isVisitorId, readCookie, VISITOR_COOKIE } from "@/lib/consent/cookie";
import { NOTICES } from "@/lib/legal";
import { parseAddressId, parseAmount, parseIdempotencyKey, parsePayment, parseSpeed, parseUpiApp } from "@/lib/checkout/parse";
import { defaultDeps, placeOrder } from "@/lib/checkout/service";
import { cartIdFrom, commerceErrorResponse, privateJson, requireCustomer } from "@/lib/http/commerce-http";
import { rateLimiter } from "@/lib/http/rate-limit";
import { guardPublicWrite, jsonError } from "@/lib/http/guard";
import { asObject, rejectUnknownFields } from "@/lib/validation";

/**
 * POST /api/checkout/place `{ addressId, speed, payment, expectedTotal, upiApp? }` + `Idempotency-Key`.
 * The client sends choices only; the server prices, checks COD rules, reserves stock and creates the order
 * (and the gateway payment for prepaid). `expectedTotal` must equal the server total or the order is refused.
 */
export async function POST(request: Request) {
  const guard = await guardPublicWrite(request, { name: "place-order", limit: 10, windowMs: 10 * 60_000, maxBytes: 512 });
  if (!guard.ok) return guard.response;
  const auth = await requireCustomer(request);
  if (!auth.ok) return auth.response;
  const perCustomer = rateLimiter.hit(`place-order:customer:${auth.customerId}`, 10, 60 * 60_000);
  if (!perCustomer.ok) return jsonError(429, "rate_limited", "Too many order attempts. Please try again later.");
  try {
    const input = asObject(guard.body);
    rejectUnknownFields(input, ["addressId", "speed", "payment", "expectedTotal", "upiApp", "tenders"]);
    const tenders = parseTenderChoice(input.tenders);
    if (tenders.giftCardCode && !giftCardTriesLeft(auth.customerId, guard.ip)) return jsonError(429, "rate_limited", "Too many gift card attempts. Try again later.");
    const result = await placeOrder(defaultDeps(), {
      customerId: auth.customerId,
      cartId: cartIdFrom(request),
      addressId: parseAddressId(input.addressId)!,
      speed: parseSpeed(input.speed),
      payment: parsePayment(input.payment)!,
      upiApp: parseUpiApp(input.upiApp),
      expectedTotal: parseAmount(input.expectedTotal),
      idempotencyKey: parseIdempotencyKey(request),
      attribution: attributionFrom(request, NOTICES.cookies.version),
      visitorId: visitorIdFrom(request),
      tenders,
    });
    return privateJson(result, { status: 201 });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}

function visitorIdFrom(request: Request): string | null {
  const v = readCookie(request.headers.get("cookie"), VISITOR_COOKIE);
  return isVisitorId(v) ? v : null;
}
