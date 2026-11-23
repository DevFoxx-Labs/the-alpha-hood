import { clientIp, jsonError } from "@/lib/http/guard";
import { commerceErrorResponse, privateJson, requireAccount } from "@/lib/http/commerce-http";
import { rateLimiter } from "@/lib/http/rate-limit";
import { resolveOrders } from "@/lib/orders/store";

/** GET /api/account/orders — the caller's orders, newest first (ACC-02). */
export async function GET(request: Request) {
  const rl = rateLimiter.hit(`orders-list:ip:${clientIp(request)}`, 60, 60_000);
  if (!rl.ok) return jsonError(429, "rate_limited", "Too many requests.");
  const auth = requireAccount(request);
  if (!auth.ok) return auth.response;
  try {
    const orders = (await resolveOrders().listByCustomer(auth.customerId)).filter((o) => o.status !== "expired" || o.attempts.length > 0);
    return privateJson({
      orders: orders.map((o) => ({
        number: o.number,
        createdAt: o.createdAt,
        status: o.status,
        fulfilment: o.fulfilment,
        total: o.pricing.total,
        itemCount: o.lines.reduce((n, l) => n + l.quantity, 0),
        images: o.lines.slice(0, 3).map((l) => l.image),
        // Delivered items the customer can tag in a #WearTheHood post (ids + titles only).
        delivered: o.deliveredAt ? o.lines.map((l) => ({ productId: l.productId, title: l.title })) : [],
        deliveryBy: o.delivery.by,
      })),
    });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
