import { commerce } from "@/lib/commerce";
import { clientIp, jsonError } from "@/lib/http/guard";
import { customerIdFromRequest } from "@/lib/auth/session";
import { commerceErrorResponse, privateJson } from "@/lib/http/commerce-http";
import { rateLimiter } from "@/lib/http/rate-limit";
import { resolveOrders } from "@/lib/orders/store";
import { resolveReturns } from "@/lib/returns/service";
import { adviseSize } from "@/lib/sizing/advice";

const PRODUCT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** GET ?productId= — PDP-04 size advice for the signed-in customer; `{ advice: null }` for guests. */
export async function GET(request: Request) {
  if (!(await rateLimiter.hit(`size-advice:ip:${clientIp(request)}`, 60, 60_000)).ok) return jsonError(429, "rate_limited", "Too many requests.");
  const productId = new URL(request.url).searchParams.get("productId") ?? "";
  if (!PRODUCT_ID_RE.test(productId)) return jsonError(422, "invalid_input", "Invalid product.");
  try {
    const customerId = await customerIdFromRequest(request);
    if (!customerId) return privateJson({ advice: null });
    const target = await commerce.getProductById(productId);
    if (!target) return jsonError(404, "not_found", "Product not found.");
    const orders = (await resolveOrders().listByCustomer(customerId)).filter((o) => o.status === "confirmed");
    const ids = [...new Set(orders.flatMap((o) => o.lines.map((l) => l.productId)))];
    const charts = new Map<string, string>();
    for (const id of ids) {
      const p = await commerce.getProductById(id);
      if (p) charts.set(id, p.sizeChart);
    }
    const returns = (await resolveReturns().listByCustomer(customerId)).flatMap((r) =>
      r.items.map((it) => ({ productId: orders.find((o) => o.number === r.orderNumber)?.lines.find((l) => l.lineId === it.lineId)?.productId ?? "", reason: r.reason })),
    );
    const advice = adviseSize(target, orders, (id) => charts.get(id) as never, returns);
    return privateJson({ advice });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
