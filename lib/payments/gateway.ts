import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mockPaymentsAllowed } from "@/lib/checkout/flags";
import type { Paise } from "@/lib/format";
import { BackendUnavailableError, devSingleton, type Env } from "@/lib/mock-guard";
import type { PaymentMethod } from "@/lib/pricing/price-cart";
import { createRazorpayGateway, readRazorpayConfig } from "./razorpay";

/**
 * Payment gateway (CHK-04/06). Card, UPI, netbanking and wallet details are entered on the gateway's hosted page:
 * no card data ever reaches our servers (PCI).
 * - `razorpay` (lib/payments/razorpay.ts): PAYMENT_GATEWAY=razorpay + RAZORPAY_KEY_ID / _KEY_SECRET / _WEBHOOK_SECRET.
 * - `demo`: development / protected previews only.
 * - otherwise every call refuses (fail closed).
 *
 * Webhooks: each gateway verifies its own signature over the RAW body (constant-time compare); event ids are
 * de-duplicated by the handler, so a replayed event is a no-op. `"ignored"` = correctly signed but not an event we
 * act on (answered 200 so the gateway doesn't retry it).
 */
export interface PaymentEvent {
  id: string;
  type: "payment.succeeded" | "payment.failed";
  paymentId: string;
  orderNumber: string;
  amount: Paise;
}

export interface PaymentGateway {
  readonly name: string;
  createPayment(input: { orderNumber: string; amount: Paise; method: Exclude<PaymentMethod, "cod">; upiApp?: string }): Promise<{ paymentId: string; redirectUrl: string }>;
  verifyWebhook(rawBody: string, headers: Headers, now?: number): PaymentEvent | "ignored" | null;
  fetchStatus(paymentId: string): Promise<{ status: "pending" | "succeeded" | "failed"; amount: Paise } | null>;
  /**
   * Refund to the original payment method. Idempotent per `reference` (the gateway's idempotency key); never
   * more than was captured in total. Returns the gateway refund id.
   */
  refund(paymentId: string, amount: Paise, reference: string): Promise<{ refundId: string }>;
}

export const WEBHOOK_TOLERANCE_MS = 5 * 60_000;
const PAYMENT_ID_RE = /^pay_[a-f0-9]{24}$/;
/** Gateway payment ids we accept anywhere in the app: demo `pay_…` or Razorpay payment link `plink_…`. */
export const GATEWAY_PAYMENT_ID_RE = /^(pay_[a-f0-9]{24}|plink_[A-Za-z0-9]{8,24})$/;
const ORDER_RE = /^AH[0-9A-Z]{8}$/;

function sign(secret: string, timestamp: string, body: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function parseEvent(raw: unknown): PaymentEvent | null {
  if (typeof raw !== "object" || raw === null) return null;
  const e = raw as Record<string, unknown>;
  if (typeof e.id !== "string" || !/^evt_[a-f0-9]{24}$/.test(e.id)) return null;
  if (e.type !== "payment.succeeded" && e.type !== "payment.failed") return null;
  if (typeof e.paymentId !== "string" || !PAYMENT_ID_RE.test(e.paymentId)) return null;
  if (typeof e.orderNumber !== "string" || !ORDER_RE.test(e.orderNumber)) return null;
  if (!Number.isSafeInteger(e.amount) || (e.amount as number) < 0) return null;
  return { id: e.id, type: e.type, paymentId: e.paymentId, orderNumber: e.orderNumber, amount: e.amount as number };
}

export function verifySignedBody(secret: string, rawBody: string, signature: string | null, timestamp: string | null, now = Date.now()) {
  if (!secret || !signature || !timestamp || !/^\d{10,16}$/.test(timestamp) || !/^[a-f0-9]{64}$/.test(signature)) return null;
  if (Math.abs(now - Number(timestamp)) > WEBHOOK_TOLERANCE_MS) return null;
  const expected = Buffer.from(sign(secret, timestamp, rawBody), "hex");
  const given = Buffer.from(signature, "hex");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    return parseEvent(JSON.parse(rawBody));
  } catch {
    return null;
  }
}

// ── Demo gateway (development / protected previews only) ─────────────────────────────────────────

export interface DemoGateway extends PaymentGateway {
  /** What the demo "bank page" shows. */
  describe(paymentId: string): { orderNumber: string; amount: Paise; method: string; status: string } | null;
  /** Simulates the customer finishing payment and the gateway sending a signed webhook. */
  simulate(paymentId: string, outcome: "succeeded" | "failed", now?: number): { rawBody: string; signature: string; timestamp: string } | null;
}

export function createDemoGateway(secret = randomBytes(32).toString("hex")): DemoGateway {
  const payments = new Map<string, { orderNumber: string; amount: Paise; method: string; status: "pending" | "succeeded" | "failed"; refunded: Paise }>();
  const refunds = new Map<string, string>();
  const hex = (n: number) => randomBytes(n).toString("hex");
  return {
    name: "demo",
    async createPayment({ orderNumber, amount, method }) {
      const paymentId = `pay_${hex(12)}`;
      payments.set(paymentId, { orderNumber, amount, method, status: "pending", refunded: 0 });
      return { paymentId, redirectUrl: `/checkout/pay/${paymentId}` };
    },
    verifyWebhook(rawBody, headers, now) {
      return verifySignedBody(secret, rawBody, headers.get("x-signature"), headers.get("x-timestamp"), now);
    },
    async fetchStatus(paymentId) {
      const p = payments.get(paymentId);
      return p ? { status: p.status, amount: p.amount } : null;
    },
    async refund(paymentId, amount, reference) {
      const existing = refunds.get(reference);
      if (existing) return { refundId: existing };
      const p = payments.get(paymentId);
      if (!p || p.status !== "succeeded") throw new Error("Payment not captured");
      if (!Number.isSafeInteger(amount) || amount <= 0 || p.refunded + amount > p.amount) throw new Error("Refund exceeds captured amount");
      p.refunded += amount;
      const refundId = `rfnd_${hex(12)}`;
      refunds.set(reference, refundId);
      return { refundId };
    },
    describe(paymentId) {
      if (!PAYMENT_ID_RE.test(paymentId)) return null;
      const p = payments.get(paymentId);
      return p ? { orderNumber: p.orderNumber, amount: p.amount, method: p.method, status: p.status } : null;
    },
    simulate(paymentId, outcome, now = Date.now()) {
      const p = payments.get(paymentId);
      if (!p || p.status !== "pending") return null;
      p.status = outcome;
      const rawBody = JSON.stringify({
        id: `evt_${hex(12)}`,
        type: outcome === "succeeded" ? "payment.succeeded" : "payment.failed",
        paymentId,
        orderNumber: p.orderNumber,
        amount: p.amount,
      });
      const timestamp = String(now);
      return { rawBody, signature: sign(secret, timestamp, rawBody), timestamp };
    },
  };
}

export function resolveGateway(env: Env = process.env): PaymentGateway {
  if (env.PAYMENT_GATEWAY === "razorpay") {
    const cfg = readRazorpayConfig(env);
    if (cfg) return createRazorpayGateway(cfg);
  } else if (mockPaymentsAllowed(env)) return devSingleton("demo_gateway", () => createDemoGateway());
  const fail = async (): Promise<never> => {
    throw new BackendUnavailableError("Payment gateway");
  };
  return { name: "disabled", createPayment: fail, verifyWebhook: () => null, fetchStatus: fail, refund: fail };
}

export function isDemoGateway(g: PaymentGateway): g is DemoGateway {
  return g.name === "demo" && "simulate" in g;
}
