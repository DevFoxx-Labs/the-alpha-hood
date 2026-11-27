import { parseAddress } from "@/lib/checkout/address";
import { ADDRESS_ID_RE } from "@/lib/checkout/parse";
import { resolveCustomers } from "@/lib/customers/store";
import { guardPublicWrite, jsonError } from "@/lib/http/guard";
import { commerceErrorResponse, privateJson, requireAccount } from "@/lib/http/commerce-http";

/**
 * PATCH /api/account/addresses/{id} `{ address }` — edits one of the caller's own addresses (owner-scoped: another
 * customer's id is "not found"). Orders already placed keep the address they were placed with.
 * DELETE /api/account/addresses/{id} `{}` — removes one of the caller's own saved addresses.
 */
export async function PATCH(request: Request, { params }: RouteContext<"/api/account/addresses/[id]">) {
  const guard = await guardPublicWrite(request, { name: "address-edit", limit: 30, windowMs: 10 * 60_000, maxBytes: 2_048 });
  if (!guard.ok) return guard.response;
  const auth = await requireAccount(request);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!ADDRESS_ID_RE.test(id)) return jsonError(404, "not_found", "Address not found.");
  try {
    const customers = resolveCustomers();
    const me = await customers.get(auth.customerId);
    if (!me) return jsonError(401, "unauthenticated", "Please sign in again.");
    const address = await customers.updateAddress(me.id, id, parseAddress(guard.body, me.phone ?? undefined));
    if (!address) return jsonError(404, "not_found", "Address not found.");
    return privateJson({ address });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}

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
