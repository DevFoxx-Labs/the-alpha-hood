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
    if (email) await customers.setEmail(customer.id, email);

    securityEvent("login", { customer: customer.id, phone: maskPhone(phone), created });
    const response = privateJson({ ok: true });
    setSessionCookie(response, createSession(customer.id));
    return response;
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
