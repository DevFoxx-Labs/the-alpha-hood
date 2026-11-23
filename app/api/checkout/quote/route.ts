import { publicCartView } from "@/lib/cart/service";
import { parseAddressId, parsePayment, parseSpeed } from "@/lib/checkout/parse";
import { defaultDeps, quote } from "@/lib/checkout/service";
import { giftCardTriesLeft, recordGiftCardFailure } from "@/lib/giftcards/limits";
import { guardPublicWrite, jsonError } from "@/lib/http/guard";
import { parseTenderChoice, TenderError } from "@/lib/wallet/tenders";
import { cartIdFrom, commerceErrorResponse, privateJson, requireCustomer } from "@/lib/http/commerce-http";
import { asObject, rejectUnknownFields } from "@/lib/validation";

/**
 * POST /api/checkout/quote `{ addressId?, speed?, payment? }` → server-computed breakdown, delivery promise
 * and COD eligibility for the shopper's current choices. Read-only (POST only to carry the body).
 */
export async function POST(request: Request) {
  const guard = await guardPublicWrite(request, { name: "quote", limit: 60, windowMs: 60_000, maxBytes: 512 });
  if (!guard.ok) return guard.response;
  const auth = await requireCustomer(request);
  if (!auth.ok) return auth.response;
  try {
    const input = asObject(guard.body);
    rejectUnknownFields(input, ["addressId", "speed", "payment", "tenders"]);
    const tenders = parseTenderChoice(input.tenders);
    if (tenders.giftCardCode && !(await giftCardTriesLeft(auth.customerId, guard.ip))) return jsonError(429, "rate_limited", "Too many gift card attempts. Try again later.");
    const q = await quote(defaultDeps(), {
      customerId: auth.customerId,
      cartId: cartIdFrom(request),
      addressId: parseAddressId(input.addressId, { optional: true }),
      speed: parseSpeed(input.speed),
      payment: parsePayment(input.payment, { optional: true }),
      tenders,
    }).catch(async (e) => {
      if (e instanceof TenderError && e.code === "invalid_gift_card") await recordGiftCardFailure(auth.customerId, guard.ip);
      throw e;
    });
    return privateJson({
      cart: publicCartView(q.view),
      pricing: q.pricing,
      speed: q.speed,
      promise: q.promise,
      cod: q.cod,
      codTotal: q.codTotal,
      codPayable: q.codPayable,
      tenders: { coins: q.tenders.coins, giftCard: q.tenders.giftCard ? { last4: q.tenders.giftCard.last4, amount: q.tenders.giftCard.amount } : null, storeCredit: q.tenders.storeCredit, total: q.tenders.total },
      payable: q.payable,
      wallet: q.wallet,
    });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
