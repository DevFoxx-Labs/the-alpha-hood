import { EmailVerifyError, sendEmailCode } from "@/lib/account/email-verify";
import { commerceErrorResponse, privateJson, requireAccount } from "@/lib/http/commerce-http";
import { guardPublicWrite, jsonError } from "@/lib/http/guard";
import { asObject, rejectUnknownFields } from "@/lib/validation";

/** POST /api/account/email/send `{}` — emails a code to the signed-in customer's address (paid, rate-limited). */
export async function POST(request: Request) {
  const guard = await guardPublicWrite(request, { name: "email-verify-send", limit: 5, windowMs: 10 * 60_000, maxBytes: 64 });
  if (!guard.ok) return guard.response;
  const auth = await requireAccount(request);
  if (!auth.ok) return auth.response;
  try {
    rejectUnknownFields(asObject(guard.body), []);
    return privateJson(await sendEmailCode(auth.customerId));
  } catch (error) {
    if (error instanceof EmailVerifyError) return jsonError(error.status, error.code, error.message);
    return commerceErrorResponse(error);
  }
}
