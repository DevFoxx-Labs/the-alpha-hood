import { returnDeps } from "@/lib/account/service";
import { audit } from "@/lib/admin/auth";
import { adminError, adminWrite, privateJson } from "@/lib/admin/http";
import { jsonError } from "@/lib/http/guard";
import { resolveOrders } from "@/lib/orders/store";
import { advanceReturn, resolveReturns } from "@/lib/returns/service";
import { asObject, rejectUnknownFields } from "@/lib/validation";

const STEPS = ["picked_up", "qc_passed", "qc_failed"] as const;

/** ADM-04 / RET-04 POST `{ to }` — pickup and quality check. QC pass settles the return (refund / credit / exchange). */
export async function POST(request: Request, { params }: RouteContext<"/api/admin/returns/[number]/action">) {
  const w = await adminWrite(request, "returns.qc", "return-action", 256);
  if (!w.ok) return w.response;
  const { number } = await params;
  if (!/^RT[0-9A-F]{10}$/.test(number)) return jsonError(404, "not_found", "Return not found.");
  try {
    const input = asObject(w.body);
    rejectUnknownFields(input, ["to"]);
    const to = STEPS.find((s) => s === input.to);
    if (!to) return jsonError(422, "invalid_input", "Unknown step.");
    const r = await resolveReturns().get(number);
    if (!r) return jsonError(404, "not_found", "Return not found.");
    const order = await resolveOrders().get(r.orderNumber);
    const updated = await advanceReturn(await returnDeps(order?.lines.map((l) => l.productId) ?? []), number, to);
    await audit(w, `return.${to}`, number, { order: r.orderNumber, payable: r.amounts.payable });
    return privateJson({ status: updated?.status });
  } catch (error) {
    return adminError(error);
  }
}
