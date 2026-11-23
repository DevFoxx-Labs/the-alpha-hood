import { audit, requireStaff } from "@/lib/admin/auth";
import { adminError, adminWrite, privateJson } from "@/lib/admin/http";
import { listPayouts, markPayoutPaid } from "@/lib/admin/ops";
import { ORDER_NUMBER_RE } from "@/lib/checkout/parse";
import { jsonError } from "@/lib/http/guard";
import { asObject, rejectUnknownFields } from "@/lib/validation";

/** COD refunds queued to UPI. GET → list; POST `{ orderNumber, refundId, utr }` → mark paid (role money limit). */
export async function GET(request: Request) {
  const auth = await requireStaff(request, "refunds.issue");
  if (!auth.ok) return auth.response;
  try {
    return privateJson({ rows: await listPayouts() });
  } catch (error) {
    return adminError(error);
  }
}

export async function POST(request: Request) {
  const w = await adminWrite(request, "refunds.issue", "payout", 256);
  if (!w.ok) return w.response;
  try {
    const input = asObject(w.body);
    rejectUnknownFields(input, ["orderNumber", "refundId", "utr"]);
    const orderNumber = typeof input.orderNumber === "string" ? input.orderNumber : "";
    const refundId = typeof input.refundId === "string" ? input.refundId : "";
    const utr = typeof input.utr === "string" ? input.utr.trim() : "";
    if (!ORDER_NUMBER_RE.test(orderNumber) || !/^r[a-z]{0,4}_[a-f0-9]{8,32}$/.test(refundId)) return jsonError(404, "not_found", "Refund not found.");
    if (!/^[A-Za-z0-9]{8,30}$/.test(utr)) return jsonError(422, "invalid_input", "Enter the bank UTR / reference.");
    const amount = await markPayoutPaid(w.staff.role, orderNumber, refundId, utr);
    await audit(w, "refund.payout_paid", orderNumber, { refundId, amount, utr });
    return privateJson({ ok: true });
  } catch (error) {
    return adminError(error);
  }
}
