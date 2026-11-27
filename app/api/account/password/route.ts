import { changePassword } from "@/lib/auth/email-auth";
import { completeSignIn } from "@/lib/auth/sign-in";
import { commerceErrorResponse, privateJson, requireAccount } from "@/lib/http/commerce-http";
import { guardPublicWrite, jsonError } from "@/lib/http/guard";
import { rateLimiter } from "@/lib/http/rate-limit";
import { asObject, rejectUnknownFields } from "@/lib/validation";

/**
 * POST /api/account/password `{ currentPassword, newPassword }` — change the password of the signed-in customer.
 * The current password is required (a stolen session alone can't change it); 5 tries per 15 min per account.
 * Every other session is signed out and this browser gets a fresh one. Setting a FIRST password goes through an
 * email code instead (POST /api/auth/email/verify, intent "reset").
 */
export async function POST(request: Request) {
  const guard = await guardPublicWrite(request, { name: "account-password", limit: 10, windowMs: 10 * 60_000, maxBytes: 1_024 });
  if (!guard.ok) return guard.response;
  const auth = await requireAccount(request);
  if (!auth.ok) return auth.response;
  const rl = await rateLimiter.hit(`account-password:cus:${auth.customerId}`, 5, 15 * 60_000);
  if (!rl.ok) return jsonError(429, "rate_limited", "Too many attempts. Try again in a few minutes.", { "Retry-After": String(rl.retryAfterSeconds) });
  try {
    const input = asObject(guard.body);
    rejectUnknownFields(input, ["currentPassword", "newPassword"]);
    await changePassword(auth.customerId, input.currentPassword, input.newPassword);
    const response = privateJson({ ok: true });
    await completeSignIn(request, response, { customerId: auth.customerId, created: false, method: "password", ip: guard.ip, revokeOthers: true });
    return response;
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
