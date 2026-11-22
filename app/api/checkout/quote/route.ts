import { publicCartView } from "@/lib/cart/service";
import { parseAddressId, parsePayment, parseSpeed } from "@/lib/checkout/parse";
import { defaultDeps, quote } from "@/lib/checkout/service";
import { guardPublicWrite } from "@/lib/http/guard";
import { cartIdFrom, commerceErrorResponse, privateJson, requireCustomer } from "@/lib/http/commerce-http";
import { asObject, rejectUnknownFields } from "@/lib/validation";

/**
 * POST /api/checkout/quote `{ addressId?, speed?, payment? }` → server-computed breakdown, delivery promise
 * and COD eligibility for the shopper's current choices. Read-only (POST only to carry the body).
 */
export async function POST(request: Request) {
  const guard = await guardPublicWrite(request, { name: "quote", limit: 60, windowMs: 60_000, maxBytes: 256 });
  if (!guard.ok) return guard.response;
  const auth = requireCustomer(request);
  if (!auth.ok) return auth.response;
  try {
    const input = asObject(guard.body);
    rejectUnknownFields(input, ["addressId", "speed", "payment"]);
    const q = await quote(defaultDeps(), {
      customerId: auth.customerId,
      cartId: cartIdFrom(request),
      addressId: parseAddressId(input.addressId, { optional: true }),
      speed: parseSpeed(input.speed),
      payment: parsePayment(input.payment, { optional: true }),
    });
    return privateJson({
      cart: publicCartView(q.view),
      pricing: q.pricing,
      speed: q.speed,
      promise: q.promise,
      cod: q.cod,
      codTotal: q.codTotal,
    });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
