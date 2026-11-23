import { returnDeps } from "@/lib/account/service";
import { ORDER_NUMBER_RE } from "@/lib/checkout/parse";
import { guardPublicWrite, jsonError } from "@/lib/http/guard";
import { commerceErrorResponse, privateJson, requireAccount } from "@/lib/http/commerce-http";
import { resolveOrders } from "@/lib/orders/store";
import { createReturn, parseReturnInput, publicReturn } from "@/lib/returns/service";

/**
 * POST /api/orders/{number}/returns — RET-01 return / exchange request on the caller's own delivered order.
 * Choices only: amounts, fees and bonus are computed on the server.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/orders/[number]/returns">) {
  const guard = await guardPublicWrite(request, { name: "return-create", limit: 10, windowMs: 60 * 60_000, maxBytes: 4_096 });
  if (!guard.ok) return guard.response;
  const auth = await requireAccount(request);
  if (!auth.ok) return auth.response;
  const { number } = await params;
  if (!ORDER_NUMBER_RE.test(number)) return jsonError(404, "order_not_found", "Order not found.");
  try {
    const input = parseReturnInput(guard.body, number);
    const order = await resolveOrders().get(number);
    if (!order || order.customerId !== auth.customerId) return jsonError(404, "order_not_found", "Order not found.");
    const deps = await returnDeps(order.lines.map((l) => l.productId));
    const created = await createReturn(deps, auth.customerId, input);
    return privateJson({ return: publicReturn(created) }, { status: 201 });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
