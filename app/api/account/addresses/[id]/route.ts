import { ADDRESS_ID_RE } from "@/lib/checkout/parse";
import { resolveCustomers } from "@/lib/customers/store";
import { guardPublicWrite, jsonError } from "@/lib/http/guard";
import { commerceErrorResponse, privateJson, requireAccount } from "@/lib/http/commerce-http";

/** DELETE /api/account/addresses/{id} `{}` — removes one of the caller's own saved addresses. */
export async function DELETE(request: Request, { params }: RouteContext<"/api/account/addresses/[id]">) {
  const guard = await guardPublicWrite(request, { name: "address-delete", limit: 20, windowMs: 10 * 60_000, maxBytes: 64 });
  if (!guard.ok) return guard.response;
  const auth = await requireAccount(request);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!ADDRESS_ID_RE.test(id)) return jsonError(404, "not_found", "Address not found.");
  try {
    const removed = await resolveCustomers().removeAddress(auth.customerId, id);
    if (!removed) return jsonError(404, "not_found", "Address not found.");
    return privateJson({ ok: true });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
