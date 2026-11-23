import { OtpError, sendOtp } from "@/lib/auth/otp";
import { randomToken } from "@/lib/auth/secrets";
import { ORDER_NUMBER_RE } from "@/lib/checkout/parse";
import { signInEnabled } from "@/lib/checkout/flags";
import { resolveCustomers } from "@/lib/customers/store";
import { guardPublicWrite, jsonError } from "@/lib/http/guard";
import { commerceErrorResponse, privateJson } from "@/lib/http/commerce-http";
import { rateLimiter } from "@/lib/http/rate-limit";
import { resolveOrders } from "@/lib/orders/store";
import { asObject, normaliseIndianMobile, rejectUnknownFields } from "@/lib/validation";

/**
 * ORD-03 public "Track order": POST `{ orderNumber, phone }`. A code is sent only if the phone belongs to the
 * order — but the response is identical either way (no order or phone enumeration). Verifying the code signs
 * the person in (/api/otp/verify) and the order page then shows it (owner check).
 */
export async function POST(request: Request) {
  if (!signInEnabled()) return jsonError(503, "sign_in_disabled", "Tracking is temporarily unavailable.");
  const guard = await guardPublicWrite(request, { name: "track-send", limit: 5, windowMs: 10 * 60_000, maxBytes: 128 });
  if (!guard.ok) return guard.response;
  const daily = await rateLimiter.hit(`track-day:ip:${guard.ip}`, 20, 86_400_000);
  if (!daily.ok) return jsonError(429, "rate_limited", "Too many attempts today.");
  try {
    const input = asObject(guard.body);
    rejectUnknownFields(input, ["orderNumber", "phone"]);
    const number = typeof input.orderNumber === "string" ? input.orderNumber.trim().toUpperCase() : "";
    const phone = normaliseIndianMobile(input.phone);
    if (!ORDER_NUMBER_RE.test(number) || !phone) return jsonError(422, "invalid_input", "Enter your order number and the mobile number used for it.");

    const order = await resolveOrders().get(number);
    const customer = order ? await resolveCustomers().get(order.customerId) : null;
    // Decoy id, indistinguishable from a real one; verifying it just fails like a wrong code.
    let challengeId = randomToken(18);
    let demoCode: string | undefined;
    if (customer && customer.phone === phone) {
      try {
        const sent = await sendOtp(phone);
        challengeId = sent.challengeId;
        demoCode = sent.demoCode;
      } catch (e) {
        // Cooldown / caps on the real phone must look exactly like a non-match (no enumeration).
        if (!(e instanceof OtpError)) throw e;
      }
    }
    return privateJson({
      challengeId,
      message: "If the details match an order, we've sent a code to that mobile number.",
      ...(demoCode ? { demoCode } : {}),
    });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
