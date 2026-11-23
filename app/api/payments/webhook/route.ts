import { defaultDeps, handlePaymentEvent } from "@/lib/checkout/service";
import { clientIp, jsonError } from "@/lib/http/guard";
import { commerceErrorResponse } from "@/lib/http/commerce-http";
import { rateLimiter } from "@/lib/http/rate-limit";
import { resolveGateway } from "@/lib/payments/gateway";
import { securityEvent } from "@/lib/security/log";

/**
 * POST /api/payments/webhook — server-to-server from the payment gateway (CHK-06). No same-origin check
 * (the caller is the gateway); instead the HMAC signature over the RAW body + timestamp is verified and
 * fails closed (no gateway configured → every request is rejected). Events are idempotent.
 */
export async function POST(request: Request) {
  const rl = await rateLimiter.hit(`webhook:ip:${clientIp(request)}`, 300, 60_000);
  if (!rl.ok) return jsonError(429, "rate_limited", "Too many requests.");
  const raw = await request.text();
  if (raw.length > 16_384) return jsonError(413, "payload_too_large", "Too large.");

  const deps = defaultDeps();
  const event = deps.gateway.verifyWebhook(raw, request.headers.get("x-signature"), request.headers.get("x-timestamp"));
  if (!event) {
    securityEvent("payment_signature_invalid", { ip: clientIp(request), gateway: resolveGateway().name });
    return jsonError(401, "invalid_signature", "Invalid signature.");
  }
  try {
    const result = await handlePaymentEvent(deps, event);
    return Response.json({ received: true, result });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
