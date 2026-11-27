import { publicCustomer, resolveCustomers } from "@/lib/customers/store";
import { resolveCredit } from "@/lib/wallet/store-credit";

/**
 * What the signed-in customer's account screens start from: masked profile, addresses, store credit. One builder
 * for `GET /api/account/me` and the server-rendered account pages (lib/account/server.ts), so both always match.
 * null = no such customer (deleted).
 */
export async function accountView(customerId: string) {
  const customer = await resolveCustomers().get(customerId);
  if (!customer) return null;
  const credit = resolveCredit();
  return {
    customer: publicCustomer(customer),
    storeCredit: { balance: await credit.balance(customer.id), history: (await credit.history(customer.id)).slice(0, 20) },
  };
}

export type AccountView = NonNullable<Awaited<ReturnType<typeof accountView>>>;
