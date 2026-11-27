import { parseAddress } from "@/lib/checkout/address";
import { MAX_ADDRESSES, resolveCustomers } from "@/lib/customers/store";
import { commerceErrorResponse, privateJson, requireAccount } from "@/lib/http/commerce-http";
import { guardPublicWrite, jsonError } from "@/lib/http/guard";

/**
 * POST /api/account/addresses `{ address }` — adds an address to the signed-in customer's own book (theirs or someone
 * they order for). Every field is checked on the server (lib/checkout/address.ts); the customer id comes from the
 * session, never from the body.
 */
export async function POST(request: Request) {
  const guard = await guardPublicWrite(request, { name: "address", limit: 20, windowMs: 10 * 60_000, maxBytes: 2_048 });
  if (!guard.ok) return guard.response;
  const auth = await requireAccount(request);
  if (!auth.ok) return auth.response;
  try {
    const customers = resolveCustomers();
    const customer = await customers.get(auth.customerId);
    if (!customer) return jsonError(401, "unauthenticated", "Please sign in again.");
    if (customer.addresses.length >= MAX_ADDRESSES) return jsonError(422, "too_many", `You can save up to ${MAX_ADDRESSES} addresses. Remove one first.`);
    const address = await customers.addAddress(customer.id, parseAddress(guard.body, customer.phone ?? undefined));
    return privateJson({ address }, { status: 201 });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
