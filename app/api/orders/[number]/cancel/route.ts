import { ORDER_NUMBER_RE } from "@/lib/checkout/parse";
import { defaultDeps } from "@/lib/checkout/service";
import { guardPublicWrite, jsonError } from "@/lib/http/guard";
import { commerceErrorResponse, privateJson, requireAccount } from "@/lib/http/commerce-http";
import { cancelOrder } from "@/lib/orders/lifecycle";

/** POST /api/orders/{number}/cancel `{}` — ORD-04 cancel before packing; prepaid is refunded in full. */
export async function POST(request: Request, { params }: RouteContext<"/api/orders/[number]/cancel">) {
  const guard = await guardPublicWrite(request, { name: "order-cancel", limit: 10, windowMs: 10 * 60_000, maxBytes: 64 });
  if (!guard.ok) return guard.response;
  const auth = requireAccount(request);
  if (!auth.ok) return auth.response;
  const { number } = await params;
  if (!ORDER_NUMBER_RE.test(number)) return jsonError(404, "order_not_found", "Order not found.");
  try {
    const order = await cancelOrder(defaultDeps(), auth.customerId, number);
    return privateJson({ ok: true, fulfilment: order.fulfilment });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
