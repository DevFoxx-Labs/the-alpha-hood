import { parseAddress } from "@/lib/checkout/address";
import { resolveCustomers, MAX_ADDRESSES } from "@/lib/customers/store";
import { guardPublicWrite, jsonError } from "@/lib/http/guard";
import { commerceErrorResponse, privateJson, requireCustomer } from "@/lib/http/commerce-http";

/** POST /api/checkout/addresses `{ address fields }` — saves an address on the signed-in customer only. */
export async function POST(request: Request) {
  const guard = await guardPublicWrite(request, { name: "address", limit: 20, windowMs: 10 * 60_000, maxBytes: 2_048 });
  if (!guard.ok) return guard.response;
  const auth = await requireCustomer(request);
  if (!auth.ok) return auth.response;
  try {
    const customers = resolveCustomers();
    const customer = await customers.get(auth.customerId);
    if (!customer) return jsonError(401, "unauthenticated", "Please verify your phone number again.");
    if (customer.addresses.length >= MAX_ADDRESSES) return jsonError(422, "too_many", "You can save up to 10 addresses.");
    const saved = await customers.addAddress(customer.id, parseAddress(guard.body, customer.phone ?? undefined));
    return privateJson({ address: saved }, { status: 201 });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
