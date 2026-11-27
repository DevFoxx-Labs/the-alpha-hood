import { verifyOtp } from "@/lib/auth/otp";
import { customerIdFromRequest } from "@/lib/auth/session";
import { completeSignIn } from "@/lib/auth/sign-in";
import { signInEnabled } from "@/lib/checkout/flags";
import { EmailInUseError, isErased, resolveCustomers } from "@/lib/customers/store";
import { guardPublicWrite, jsonError } from "@/lib/http/guard";
import { commerceErrorResponse, privateJson } from "@/lib/http/commerce-http";
import { maskPhone, securityEvent } from "@/lib/security/log";
import { LINK_COOKIE, openPendingLink } from "@/lib/auth/social";
import { resolveSocialIdentities } from "@/lib/auth/social-identities";
import { readCookie } from "@/lib/consent/cookie";
import { asObject, normaliseEmail, rejectUnknownFields } from "@/lib/validation";

/**
 * POST /api/otp/verify `{ challengeId, code, email? }` → signs in with the verified mobile number and sets a fresh
 * HttpOnly session cookie.
 * - Signed in to an account that has no mobile yet (started by email or Google) and the number is nobody's: the
 *   number is added to THAT account (`attached`) — checkout and "Add mobile number" in Settings land here.
 * - Otherwise: the account of this number, created on first use. Account creation records the Terms + Privacy
 *   consent (DPDP) with the notice versions shown next to the button.
 */
export async function POST(request: Request) {
  if (!signInEnabled()) return jsonError(503, "sign_in_disabled", "Sign-in is temporarily unavailable.");
  const guard = await guardPublicWrite(request, { name: "otp-verify", limit: 20, windowMs: 10 * 60_000, maxBytes: 512 });
  if (!guard.ok) return guard.response;
  try {
    const input = asObject(guard.body);
    rejectUnknownFields(input, ["challengeId", "code", "email"]);
    if (typeof input.challengeId !== "string" || !/^[A-Za-z0-9_-]{16,40}$/.test(input.challengeId)) {
      return jsonError(422, "invalid", "That code is incorrect or has expired.");
    }
    if (typeof input.code !== "string") return jsonError(422, "invalid", "That code is incorrect or has expired.");
    let email: string | null = null;
    if (input.email !== undefined && input.email !== "") {
      email = normaliseEmail(input.email);
      if (!email) return jsonError(422, "invalid_input", "Enter a valid email address or leave it empty.");
    }

    const phone = await verifyOtp(input.challengeId, input.code.trim());
    const customers = resolveCustomers();

    // A signed-in account without a mobile number gets this one (the session proves the account, the code the number).
    let attached = false;
    const signedIn = await customerIdFromRequest(request);
    if (signedIn) {
      const me = await customers.get(signedIn);
      if (me && me.phone === null && !isErased(me) && !(await customers.findByPhone(phone))) {
        attached = await customers.attachPhone(me.id, phone);
        if (attached) securityEvent("phone_attached", { customer: me.id, phone: maskPhone(phone) });
      }
    }
    const { customer, created } = attached ? { customer: (await customers.get(signedIn!))!, created: false } : await customers.findOrCreateByPhone(phone);
    if (email && email !== customer.email) await customers.setEmail(customer.id, email);

    // "Continue with Google / Facebook" from a signed-out browser can end here: the mobile is now verified, so the
    // social account is linked to this customer and is enough to sign in next time. Only a verified Google email is
    // ever used, and only when the customer has none.
    const pending = openPendingLink(readCookie(request.headers.get("cookie"), LINK_COOKIE));
    let linked: string | null = null;
    if (pending) {
      const ok = await resolveSocialIdentities().link({ provider: pending.provider, subject: pending.subject, customerId: customer.id, email: pending.email, createdAt: new Date().toISOString() });
      if (ok) {
        linked = pending.provider;
        if (pending.email && !email && !customer.email) {
          // Google said this address is verified: stored as verified, unless another account already signs in with it.
          await customers.setEmail(customer.id, pending.email, true).catch((e) => {
            if (!(e instanceof EmailInUseError)) throw e;
          });
        }
        if (pending.name && !customer.name) await customers.setName(customer.id, pending.name);
      }
      securityEvent("login", { customer: customer.id, kind: `social_${pending.provider}_linked`, ok });
    }

    const response = privateJson({ ok: true, ...(linked ? { linked } : {}), ...(attached ? { attached: true } : {}) });
    if (pending) response.cookies.set(LINK_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
    await completeSignIn(request, response, { customerId: customer.id, created, method: "phone_otp", ip: guard.ip });
    return response;
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
