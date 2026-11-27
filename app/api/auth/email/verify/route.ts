import { completeSignIn } from "@/lib/auth/sign-in";
import { RESET_COOKIE, RESET_TTL_MS, verifyEmailCode, verifyResetCode } from "@/lib/auth/email-auth";
import { signInEnabled } from "@/lib/checkout/flags";
import { commerceErrorResponse, privateJson } from "@/lib/http/commerce-http";
import { guardPublicWrite, jsonError } from "@/lib/http/guard";
import { asObject, rejectUnknownFields } from "@/lib/validation";

/**
 * POST /api/auth/email/verify `{ email, challengeId, code, intent, password?, name?, acceptTerms? }`
 * intent: "signin" (code only — creates the account on first use, one-tap notice), "signup" (+ password + the
 * Terms checkbox, validated here on the server), "reset" (+ new password; existing account only).
 * Sets a fresh session. A password set or reset signs out every other session of the account.
 */
export async function POST(request: Request) {
  if (!signInEnabled()) return jsonError(503, "sign_in_disabled", "Sign-in is temporarily unavailable.");
  const guard = await guardPublicWrite(request, { name: "email-code-verify", limit: 20, windowMs: 10 * 60_000, maxBytes: 1_024 });
  if (!guard.ok) return guard.response;
  try {
    const input = asObject(guard.body);
    rejectUnknownFields(input, ["email", "challengeId", "code", "intent", "password", "name", "acceptTerms"]);

    // Forgot password, step 2 of 3: only the code. It is checked (and used up) now; the browser gets a 10-minute,
    // single-use reset ticket in an HttpOnly cookie and then asks for the new password (POST /api/auth/password/reset).
    // Nobody is signed in yet.
    if (input.intent === "reset" && input.password === undefined) {
      const { ticket } = await verifyResetCode({ email: input.email, challengeId: input.challengeId, code: input.code });
      const response = privateJson({ ok: true, step: "new_password" });
      response.cookies.set(RESET_COOKIE, ticket, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/api/auth/password", maxAge: RESET_TTL_MS / 1000 });
      return response;
    }

    const r = await verifyEmailCode({
      email: input.email,
      challengeId: input.challengeId,
      code: input.code,
      intent: input.intent,
      password: input.password,
      name: input.name,
      acceptTerms: input.acceptTerms,
    });
    const response = privateJson({ ok: true, created: r.created, passwordSet: r.passwordSet });
    await completeSignIn(request, response, {
      customerId: r.customerId,
      created: r.created,
      method: "email_otp",
      ip: guard.ip,
      consent: r.consent,
      revokeOthers: r.passwordSet && !r.created,
    });
    return response;
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
