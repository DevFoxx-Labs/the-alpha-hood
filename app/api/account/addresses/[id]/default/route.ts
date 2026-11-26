import { ADDRESS_ID_RE } from "@/lib/checkout/parse";
import { resolveCustomers } from "@/lib/customers/store";
import { commerceErrorResponse, privateJson, requireAccount } from "@/lib/http/commerce-http";
import { guardPublicWrite, jsonError } from "@/lib/http/guard";

/** POST /api/account/addresses/{id}/default `{}` — makes one of the caller's own addresses the default. */
export async function POST(request: Request, { params }: RouteContext<"/api/account/addresses/[id]/default">) {
  const guard = await guardPublicWrite(request, { name: "address-default", limit: 30, windowMs: 10 * 60_000, maxBytes: 64 });
  if (!guard.ok) return guard.response;
  const auth = await requireAccount(request);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!ADDRESS_ID_RE.test(id)) return jsonError(404, "not_found", "Address not found.");
  try {
    if (!(await resolveCustomers().setDefaultAddress(auth.customerId, id))) return jsonError(404, "not_found", "Address not found.");
    return privateJson({ ok: true });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
