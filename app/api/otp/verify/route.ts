import { verifyOtp } from "@/lib/auth/otp";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { signInEnabled } from "@/lib/checkout/flags";
import { resolveLedger } from "@/lib/consent/ledger";
import { recordAccountConsent } from "@/lib/consent/service";
import { existingVisitor } from "@/lib/consent/visitor";
import { resolveCustomers } from "@/lib/customers/store";
import { guardPublicWrite, jsonError, userAgent } from "@/lib/http/guard";
import { commerceErrorResponse, privateJson } from "@/lib/http/commerce-http";
import { maskPhone, securityEvent } from "@/lib/security/log";
import { LINK_COOKIE, openPendingLink } from "@/lib/auth/social";
import { resolveSocialIdentities } from "@/lib/auth/social-identities";
import { readCookie } from "@/lib/consent/cookie";
import { alertNewCustomerDevice } from "@/lib/security/sign-in-alerts";
import { checkDevice, setDeviceCookie } from "@/lib/security/devices";
import { asObject, normaliseEmail, rejectUnknownFields } from "@/lib/validation";

/**
 * POST /api/otp/verify `{ challengeId, code, email? }` → signs in (creates the customer on first use) and
 * sets a fresh HttpOnly session cookie. Account creation records the Terms + Privacy consent (DPDP) with the
 * notice versions shown next to the button.
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
    const { customer, created } = await customers.findOrCreateByPhone(phone);
    if (created) {
      await recordAccountConsent(resolveLedger(), {
        userId: customer.id,
        visitorId: existingVisitor(request),
        ctx: { ip: guard.ip, userAgent: userAgent(request), source: "web" },
      });
    }
    if (email && email !== customer.email) await customers.setEmail(customer.id, email);

    // "Continue with Google / Facebook" from a signed-out browser ends here: the mobile is now verified, so the social
    // account is linked to this customer and is enough to sign in next time. Only a verified Google email is ever
    // used, and only when the customer has none.
    const pending = openPendingLink(readCookie(request.headers.get("cookie"), LINK_COOKIE));
    let linked: string | null = null;
    if (pending) {
      const ok = await resolveSocialIdentities().link({ provider: pending.provider, subject: pending.subject, customerId: customer.id, email: pending.email, createdAt: new Date().toISOString() });
      if (ok) {
        linked = pending.provider;
        // Google said this address is verified: it is stored as verified.
        if (pending.email && !email && !customer.email) await customers.setEmail(customer.id, pending.email, true);
        if (pending.name && !customer.name) await customers.setName(customer.id, pending.name);
      }
      securityEvent("login", { customer: customer.id, kind: `social_${pending.provider}_linked`, ok });
    }

    securityEvent("login", { customer: customer.id, phone: maskPhone(phone), created });
    const response = privateJson({ ok: true, ...(linked ? { linked } : {}) });
    setSessionCookie(response, await createSession(customer.id));
    if (pending) response.cookies.set(LINK_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
    const device = await checkDevice("customer", customer.id, request);
    setDeviceCookie(response, device);
    if (device.isNew && !created) await alertNewCustomerDevice(customer.id, userAgent(request));
    return response;
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
