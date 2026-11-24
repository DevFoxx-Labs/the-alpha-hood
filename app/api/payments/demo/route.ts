import { customerIdFromRequest } from "@/lib/auth/session";
import { defaultDeps, handlePaymentEvent } from "@/lib/checkout/service";
import { clientIp, guardPublicWrite, jsonError } from "@/lib/http/guard";
import { commerceErrorResponse, privateJson } from "@/lib/http/commerce-http";
import { rateLimiter } from "@/lib/http/rate-limit";
import { isDemoGateway } from "@/lib/payments/gateway";
import { asObject, rejectUnknownFields } from "@/lib/validation";

const PAYMENT_RE = /^pay_[a-f0-9]{24}$/;

/**
 * DEMO payment gateway (development / protected previews only — 404 on the live store, where the real
 * gateway hosts this page). GET shows the payment; POST `{ paymentId, outcome }` simulates the customer
 * paying, then goes through the SAME signed-webhook verification and handler as the real gateway.
 * Only the customer who owns the order can act on it.
 */
async function ownedPayment(request: Request, paymentId: string) {
  const deps = defaultDeps();
  if (!isDemoGateway(deps.gateway)) return { deps, error: jsonError(404, "not_found", "Not found.") };
  const customerId = await customerIdFromRequest(request);
  const order = PAYMENT_RE.test(paymentId) ? await deps.orders.byPaymentId(paymentId) : null;
  if (!customerId || !order || order.customerId !== customerId) return { deps, error: jsonError(404, "not_found", "Not found.") };
  return { deps, gateway: deps.gateway, order };
}

export async function GET(request: Request) {
  const rl = await rateLimiter.hit(`demo-pay-read:ip:${clientIp(request)}`, 60, 60_000);
  if (!rl.ok) return jsonError(429, "rate_limited", "Too many requests.");
  try {
    const paymentId = new URL(request.url).searchParams.get("paymentId") ?? "";
    const r = await ownedPayment(request, paymentId);
    if (r.error) return r.error;
    const p = r.gateway!.describe(paymentId)!;
    return privateJson({ payment: { ...p, paymentId } });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const guard = await guardPublicWrite(request, { name: "demo-pay", limit: 20, windowMs: 10 * 60_000, maxBytes: 128 });
  if (!guard.ok) return guard.response;
  try {
    const input = asObject(guard.body);
    rejectUnknownFields(input, ["paymentId", "outcome"]);
    const paymentId = typeof input.paymentId === "string" ? input.paymentId : "";
    if (input.outcome !== "succeeded" && input.outcome !== "failed") return jsonError(422, "invalid_input", "Unknown outcome.");
    const r = await ownedPayment(request, paymentId);
    if (r.error) return r.error;
    const signed = r.gateway!.simulate(paymentId, input.outcome);
    if (!signed) return jsonError(409, "already_final", "This payment is already complete.");
    const event = r.gateway!.verifyWebhook(signed.rawBody, new Headers({ "x-signature": signed.signature, "x-timestamp": signed.timestamp }));
    if (!event || event === "ignored") return jsonError(401, "invalid_signature", "Invalid signature.");
    const result = await handlePaymentEvent(r.deps, event);
    return privateJson({ result, orderNumber: r.order!.number });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
