import { audit } from "@/lib/admin/auth";
import { adminError, adminWrite, privateJson } from "@/lib/admin/http";
import { OpsError, setHold } from "@/lib/admin/ops";
import { can, type Permission } from "@/lib/admin/permissions";
import { ORDER_NUMBER_RE } from "@/lib/checkout/parse";
import { defaultDeps } from "@/lib/checkout/service";
import { jsonError } from "@/lib/http/guard";
import { advanceFulfilment, cancelOrder } from "@/lib/orders/lifecycle";
import { asObject, cleanText, rejectUnknownFields } from "@/lib/validation";

const ACTIONS: Record<string, Permission> = {
  hold: "orders.write",
  release: "orders.write",
  cancel: "orders.write",
  packed: "orders.ship",
  shipped: "orders.ship",
  out_for_delivery: "orders.ship",
  delivered: "orders.ship",
  rto: "orders.ship",
};

/** ADM-03 POST `{ action, reason? }` — each action needs its own permission; every call is audited. */
export async function POST(request: Request, { params }: RouteContext<"/api/admin/orders/[number]/action">) {
  const w = await adminWrite(request, "orders.read", "order-action", 512);
  if (!w.ok) return w.response;
  const { number } = await params;
  if (!ORDER_NUMBER_RE.test(number)) return jsonError(404, "not_found", "Order not found.");
  try {
    const input = asObject(w.body);
    rejectUnknownFields(input, ["action", "reason"]);
    const action = typeof input.action === "string" ? input.action : "";
    const permission = ACTIONS[action];
    if (!permission) return jsonError(422, "invalid_input", "Unknown action.");
    if (!can(w.staff.role, permission)) return jsonError(403, "forbidden", "You don't have access to this.");
    const needsReason = action === "hold" || action === "cancel";
    const reason = needsReason ? cleanText(input.reason, "Reason", { min: 3, max: 200 }) : "";

    let result: unknown;
    if (action === "hold" || action === "release") {
      result = (await setHold(number, action === "hold", w.staff.email, reason))?.hold ?? null;
    } else if (action === "cancel") {
      const o = await cancelOrder(defaultDeps(), null, number, new Date(), { staff: w.staff.id, reason });
      result = o.fulfilment;
    } else {
      const o = await advanceFulfilment(defaultDeps(), number, action as "packed");
      result = o.fulfilment;
    }
    await audit(w, `order.${action}`, number, reason ? { reason } : {});
    return privateJson({ ok: true, result });
  } catch (error) {
    if (error instanceof OpsError) return jsonError(error.status, error.code, error.message);
    return adminError(error);
  }
}
