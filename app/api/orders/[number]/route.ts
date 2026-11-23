import { orderDetail, returnDeps } from "@/lib/account/service";
import { ORDER_NUMBER_RE } from "@/lib/checkout/parse";
import { clientIp, jsonError } from "@/lib/http/guard";
import { commerceErrorResponse, privateJson, requireCustomer } from "@/lib/http/commerce-http";
import { rateLimiter } from "@/lib/http/rate-limit";
import { resolveOrders } from "@/lib/orders/store";

/** GET /api/orders/{number} — the caller's own order with timeline, cancel/return options (404 otherwise). */
export async function GET(request: Request, { params }: RouteContext<"/api/orders/[number]">) {
  const rl = rateLimiter.hit(`order-read:ip:${clientIp(request)}`, 60, 60_000);
  if (!rl.ok) return jsonError(429, "rate_limited", "Too many requests.");
  const auth = await requireCustomer(request);
  if (!auth.ok) return auth.response;
  const { number } = await params;
  if (!ORDER_NUMBER_RE.test(number)) return jsonError(404, "order_not_found", "Order not found.");
  try {
    const order = await resolveOrders().get(number);
    if (!order || order.customerId !== auth.customerId) return jsonError(404, "order_not_found", "Order not found.");
    const deps = await returnDeps(order.lines.map((l) => l.productId));
    return privateJson({ order: orderDetail(order, await deps.returns.listByOrder(order.number), deps) });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
