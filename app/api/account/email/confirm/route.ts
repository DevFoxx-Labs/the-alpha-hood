import { confirmEmailCode, EmailVerifyError } from "@/lib/account/email-verify";
import { publicCustomer, resolveCustomers } from "@/lib/customers/store";
import { commerceErrorResponse, privateJson, requireAccount } from "@/lib/http/commerce-http";
import { guardPublicWrite, jsonError } from "@/lib/http/guard";
import { asObject, rejectUnknownFields } from "@/lib/validation";

/** POST /api/account/email/confirm `{ challengeId, code }` — marks the account's current email address verified. */
export async function POST(request: Request) {
  const guard = await guardPublicWrite(request, { name: "email-verify-confirm", limit: 20, windowMs: 10 * 60_000, maxBytes: 256 });
  if (!guard.ok) return guard.response;
  const auth = await requireAccount(request);
  if (!auth.ok) return auth.response;
  try {
    const input = asObject(guard.body);
    rejectUnknownFields(input, ["challengeId", "code"]);
    await confirmEmailCode(auth.customerId, input.challengeId, input.code);
    const customer = await resolveCustomers().get(auth.customerId);
    return privateJson({ customer: customer ? publicCustomer(customer) : null });
  } catch (error) {
    if (error instanceof EmailVerifyError) return jsonError(error.status, error.code, error.message);
    return commerceErrorResponse(error);
  }
}
