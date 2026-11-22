import { audit, requireStaff } from "@/lib/admin/auth";
import { adminError, adminWrite, privateJson } from "@/lib/admin/http";
import { adjustCredit, customerAdminView } from "@/lib/admin/ops";
import { can } from "@/lib/admin/permissions";
import { resolveCustomers } from "@/lib/customers/store";
import { jsonError } from "@/lib/http/guard";
import { asObject, cleanText, rejectUnknownFields } from "@/lib/validation";

const ID_RE = /^cus_[A-Za-z0-9_-]{8,24}$/;

/** ADM-06 customer profile. POST `{ action: block_cod | unblock_cod | credit, amount?, reason }` (audited). */
export async function GET(request: Request, { params }: RouteContext<"/api/admin/customers/[id]">) {
  const auth = requireStaff(request, "customers.read");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!ID_RE.test(id)) return jsonError(404, "not_found", "Customer not found.");
  try {
    const c = await customerAdminView(id);
    return c ? privateJson({ customer: c }) : jsonError(404, "not_found", "Customer not found.");
  } catch (error) {
    return adminError(error);
  }
}

export async function POST(request: Request, { params }: RouteContext<"/api/admin/customers/[id]">) {
  const w = await adminWrite(request, "customers.read", "customer", 512);
  if (!w.ok) return w.response;
  if (!can(w.staff.role, "customers.write")) return jsonError(403, "forbidden", "You don't have access to this.");
  const { id } = await params;
  if (!ID_RE.test(id)) return jsonError(404, "not_found", "Customer not found.");
  try {
    const input = asObject(w.body);
    rejectUnknownFields(input, ["action", "amount", "reason"]);
    const reason = cleanText(input.reason, "Reason", { min: 3, max: 200 });
    if (input.action === "block_cod" || input.action === "unblock_cod") {
      const c = await resolveCustomers().get(id);
      if (!c) return jsonError(404, "not_found", "Customer not found.");
      await resolveCustomers().setCodBlocked(id, input.action === "block_cod");
      await audit(w, `customer.${input.action}`, id, { reason });
      return privateJson({ ok: true });
    }
    if (input.action === "credit") {
      if (typeof input.amount !== "number" || !Number.isSafeInteger(input.amount)) return jsonError(422, "invalid_input", "Enter an amount in paise.");
      const entry = await adjustCredit(w.staff.role, id, input.amount);
      await audit(w, "customer.credit_adjust", id, { amount: input.amount, reason, entry: entry.id });
      return privateJson({ ok: true });
    }
    return jsonError(422, "invalid_input", "Unknown action.");
  } catch (error) {
    return adminError(error);
  }
}
