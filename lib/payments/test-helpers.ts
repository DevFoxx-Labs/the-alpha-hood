import type { PaymentEvent, PaymentGateway } from "./gateway";

/** Tests: verifies a demo-gateway signed body the way the webhook route does (headers) and narrows the result. */
export function demoVerify(gateway: PaymentGateway, rawBody: string, signature: string | null, timestamp: string | null, now?: number): PaymentEvent | null {
  const h = new Headers();
  if (signature !== null) h.set("x-signature", signature);
  if (timestamp !== null) h.set("x-timestamp", timestamp);
  const e = gateway.verifyWebhook(rawBody, h, now);
  return e === "ignored" ? null : e;
}
