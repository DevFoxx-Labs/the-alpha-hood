import { ORDER_NUMBER_RE } from "@/lib/checkout/parse";
import { defaultDeps, retryPayment } from "@/lib/checkout/service";
import { guardPublicWrite, jsonError } from "@/lib/http/guard";
import { commerceErrorResponse, privateJson, requireCustomer } from "@/lib/http/commerce-http";
import { asObject, rejectUnknownFields } from "@/lib/validation";

/** POST /api/checkout/retry `{ orderNumber }` — new payment attempt for the caller's own failed order. */
export async function POST(request: Request) {
  const guard = await guardPublicWrite(request, { name: "retry-payment", limit: 10, windowMs: 10 * 60_000, maxBytes: 128 });
  if (!guard.ok) return guard.response;
  const auth = await requireCustomer(request);
  if (!auth.ok) return auth.response;
  try {
    const input = asObject(guard.body);
    rejectUnknownFields(input, ["orderNumber"]);
    if (typeof input.orderNumber !== "string" || !ORDER_NUMBER_RE.test(input.orderNumber)) {
      return jsonError(404, "order_not_found", "Order not found.");
    }
    return privateJson(await retryPayment(defaultDeps(), auth.customerId, input.orderNumber));
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
