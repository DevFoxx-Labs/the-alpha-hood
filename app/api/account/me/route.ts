import { publicCustomer, resolveCustomers } from "@/lib/customers/store";
import { clientIp, guardPublicWrite, jsonError } from "@/lib/http/guard";
import { commerceErrorResponse, privateJson, requireAccount } from "@/lib/http/commerce-http";
import { rateLimiter } from "@/lib/http/rate-limit";
import { asObject, cleanText, normaliseEmail, rejectUnknownFields } from "@/lib/validation";
import { resolveCredit } from "@/lib/wallet/store-credit";

/** GET /api/account/me — profile (masked phone), addresses, store credit. PATCH `{ name?, email? }`. */
export async function GET(request: Request) {
  const rl = rateLimiter.hit(`account-read:ip:${clientIp(request)}`, 60, 60_000);
  if (!rl.ok) return jsonError(429, "rate_limited", "Too many requests.");
  const auth = await requireAccount(request);
  if (!auth.ok) return auth.response;
  try {
    const customer = await resolveCustomers().get(auth.customerId);
    if (!customer) return jsonError(401, "unauthenticated", "Please sign in again.");
    const credit = resolveCredit();
    return privateJson({
      customer: publicCustomer(customer),
      storeCredit: { balance: await credit.balance(customer.id), history: (await credit.history(customer.id)).slice(0, 20) },
    });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  const guard = await guardPublicWrite(request, { name: "profile", limit: 20, windowMs: 10 * 60_000, maxBytes: 512 });
  if (!guard.ok) return guard.response;
  const auth = await requireAccount(request);
  if (!auth.ok) return auth.response;
  try {
    const input = asObject(guard.body);
    rejectUnknownFields(input, ["name", "email"]);
    const customers = resolveCustomers();
    if (input.name !== undefined) {
      await customers.setName(auth.customerId, input.name === "" ? null : cleanText(input.name, "Name", { min: 2, max: 80 }));
    }
    if (input.email !== undefined) {
      const email = input.email === "" ? null : normaliseEmail(input.email);
      if (input.email !== "" && !email) return jsonError(422, "invalid_input", "Enter a valid email address.");
      await customers.setEmail(auth.customerId, email);
    }
    const customer = await customers.get(auth.customerId);
    return privateJson({ customer: customer ? publicCustomer(customer) : null });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
