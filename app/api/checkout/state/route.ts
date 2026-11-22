import { customerIdFromRequest } from "@/lib/auth/session";
import { loadCartView, publicCartView } from "@/lib/cart/service";
import { checkoutEnabled, codEnabled } from "@/lib/checkout/flags";
import { publicCustomer, resolveCustomers } from "@/lib/customers/store";
import { clientIp, jsonError } from "@/lib/http/guard";
import { cartIdFrom, commerceErrorResponse, privateJson } from "@/lib/http/commerce-http";
import { rateLimiter } from "@/lib/http/rate-limit";

/** GET /api/checkout/state — flags, the signed-in customer (masked) and the validated bag. */
export async function GET(request: Request) {
  const rl = rateLimiter.hit(`checkout-state:ip:${clientIp(request)}`, 60, 60_000);
  if (!rl.ok) return jsonError(429, "rate_limited", "Too many requests.");
  try {
    const enabled = checkoutEnabled();
    const customerId = enabled ? customerIdFromRequest(request) : null;
    const customer = customerId ? await resolveCustomers().get(customerId) : null;
    const view = await loadCartView(cartIdFrom(request));
    return privateJson({
      enabled,
      codEnabled: codEnabled(),
      customer: customer ? publicCustomer(customer) : null,
      cart: publicCartView(view),
    });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
