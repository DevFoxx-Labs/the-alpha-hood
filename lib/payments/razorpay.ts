import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Paise } from "@/lib/format";
import type { PaymentEvent, PaymentGateway } from "./gateway";

/**
 * Razorpay adapter (CHK-04/06) using **Payment Links** — Razorpay's hosted payment page (UPI, cards, netbanking,
 * wallets). Chosen over the on-page Checkout.js widget because nothing third-party loads on our site (no script,
 * no cookies before consent, no CSP exceptions, no LCP cost); the customer is redirected to Razorpay and back.
 *
 * Security:
 * - Fixed API host (https://api.razorpay.com) — no user-controlled URLs (SSRF); HTTP Basic with the key pair; 10 s
 *   timeout; secrets never logged or returned.
 * - We send only the order number and amount — no customer phone / email (DPDP data minimisation); the customer
 *   types what Razorpay needs on Razorpay's page.
 * - Webhooks: `X-Razorpay-Signature` = HMAC-SHA256(raw body, webhook secret), constant-time compare. Only
 *   `payment_link.paid` (→ succeeded) and `payment_link.expired` / `.cancelled` (→ failed) are acted on; the event
 *   id (`x-razorpay-event-id`) de-duplicates deliveries; INR only; amounts are checked against the attempt by the
 *   checkout handler.
 * - The return from Razorpay is never trusted: the return route asks the API for the link's status (`fetchStatus`).
 * - Refunds: `X-Refund-Idempotency` + `receipt` derived from our reference, so a retried refund can't pay twice.
 */
export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  /** Public site URL for the return link (https in production). */
  siteUrl: string;
  /** Test keys (`rzp_test_…`) — refused by the go-live check on production. */
  test: boolean;
}

type Env = Record<string, string | undefined>;
const API = "https://api.razorpay.com/v1";
const LINK_ID_RE = /^plink_[A-Za-z0-9]{8,24}$/;
const PAY_ID_RE = /^pay_[A-Za-z0-9]{8,24}$/;
const ORDER_RE = /^AH[0-9A-Z]{8}$/;
/** Payment links must stay open at least 15 minutes; ours closes a little after the 15-minute stock hold. */
export const LINK_TTL_MS = 16 * 60_000;
/** Older webhook events are refused (Razorpay retries for about a day). */
const MAX_EVENT_AGE_MS = 3 * 86_400_000;

export function readRazorpayConfig(env: Env = process.env): RazorpayConfig | null {
  const keyId = env.RAZORPAY_KEY_ID ?? "";
  const keySecret = env.RAZORPAY_KEY_SECRET ?? "";
  const webhookSecret = env.RAZORPAY_WEBHOOK_SECRET ?? "";
  if (!/^rzp_(live|test)_[A-Za-z0-9]{8,32}$/.test(keyId) || keySecret.length < 16 || webhookSecret.length < 16) return null;
  const siteUrl = (env.SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return { keyId, keySecret, webhookSecret, siteUrl, test: keyId.startsWith("rzp_test_") };
}

export class RazorpayError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(`Razorpay request failed (${status} ${code})`);
    this.name = "RazorpayError";
  }
}

/** Idempotency key / receipt from our reference: 32 hex chars, only [a-f0-9] (header rules: ≥ 10, [A-Za-z0-9_-]). */
export const refundKey = (reference: string) => createHash("sha256").update(`ah-refund:${reference}`).digest("hex").slice(0, 32);

interface LinkEntity {
  id: string;
  amount: number;
  amount_paid?: number;
  currency: string;
  status: "created" | "partially_paid" | "expired" | "cancelled" | "paid";
  reference_id?: string;
  payments?: { payment_id: string; amount: number; status: string }[] | null;
}

export function createRazorpayGateway(cfg: RazorpayConfig, fetchImpl: typeof fetch = (...a) => fetch(...a)): PaymentGateway {
  const auth = `Basic ${Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString("base64")}`;

  async function call<T>(method: "GET" | "POST", path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
    const res = await fetchImpl(`${API}${path}`, {
      method,
      headers: { Authorization: auth, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
      redirect: "error",
    });
    const data = (await res.json().catch(() => null)) as (T & { error?: { code?: string } }) | null;
    if (!res.ok || !data) throw new RazorpayError(res.status, data?.error?.code ?? "unknown");
    return data;
  }

  const fetchLink = (id: string) => call<LinkEntity>("GET", `/payment_links/${id}`);

  return {
    name: "razorpay",

    async createPayment({ orderNumber, amount }) {
      if (!ORDER_RE.test(orderNumber)) throw new Error("Invalid order number");
      if (!Number.isSafeInteger(amount) || amount < 100) throw new Error("Amount must be at least ₹1 in whole paise");
      const link = await call<{ id: string; short_url: string }>("POST", "/payment_links", {
        amount,
        currency: "INR",
        accept_partial: false,
        reference_id: orderNumber,
        description: `The Alpha Hood order ${orderNumber}`,
        expire_by: Math.floor((Date.now() + LINK_TTL_MS) / 1000),
        notify: { sms: false, email: false },
        reminder_enable: false,
        notes: { order: orderNumber },
        callback_url: `${cfg.siteUrl}/api/payments/return?order=${orderNumber}`,
        callback_method: "get",
      });
      if (!LINK_ID_RE.test(link.id) || !/^https:\/\/(rzp\.io|[a-z0-9.-]+\.razorpay\.com)\//.test(link.short_url)) throw new RazorpayError(502, "unexpected_response");
      return { paymentId: link.id, redirectUrl: link.short_url };
    },

    verifyWebhook(rawBody, headers, now = Date.now()): PaymentEvent | "ignored" | null {
      const signature = headers.get("x-razorpay-signature") ?? "";
      if (!/^[a-f0-9]{64}$/.test(signature)) return null;
      const expected = createHmac("sha256", cfg.webhookSecret).update(rawBody).digest();
      const given = Buffer.from(signature, "hex");
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
      let body: { event?: string; created_at?: number; payload?: { payment_link?: { entity?: LinkEntity } } };
      try {
        body = JSON.parse(rawBody);
      } catch {
        return null;
      }
      const type = body.event === "payment_link.paid" ? "payment.succeeded" : body.event === "payment_link.expired" || body.event === "payment_link.cancelled" ? "payment.failed" : null;
      if (!type) return "ignored";
      if (typeof body.created_at !== "number" || now - body.created_at * 1000 > MAX_EVENT_AGE_MS) return null;
      const link = body.payload?.payment_link?.entity;
      if (!link || !LINK_ID_RE.test(link.id) || link.currency !== "INR" || !link.reference_id || !ORDER_RE.test(link.reference_id)) return null;
      const amount = type === "payment.succeeded" ? Number(link.amount_paid ?? 0) : Number(link.amount);
      if (!Number.isSafeInteger(amount) || amount < 0) return null;
      // Stable event id per (link, outcome): Razorpay's header id when present, else derived — duplicates are no-ops.
      const headerId = headers.get("x-razorpay-event-id") ?? "";
      const id = `evt_${createHash("sha256").update(/^[A-Za-z0-9_]{6,64}$/.test(headerId) ? headerId : `${link.id}:${type}`).digest("hex").slice(0, 24)}`;
      return { id, type, paymentId: link.id, orderNumber: link.reference_id, amount };
    },

    async fetchStatus(paymentId) {
      if (!LINK_ID_RE.test(paymentId)) return null;
      try {
        const link = await fetchLink(paymentId);
        if (link.currency !== "INR") return null;
        if (link.status === "paid") return { status: "succeeded", amount: Number(link.amount_paid ?? link.amount) as Paise };
        if (link.status === "expired" || link.status === "cancelled") return { status: "failed", amount: Number(link.amount) as Paise };
        return { status: "pending", amount: Number(link.amount) as Paise };
      } catch (e) {
        if (e instanceof RazorpayError && e.status === 404) return null;
        throw e;
      }
    },

    async refund(paymentId, amount, reference) {
      if (!Number.isSafeInteger(amount) || amount < 100) throw new Error("Refunds must be at least ₹1 in whole paise");
      const link = LINK_ID_RE.test(paymentId) ? await fetchLink(paymentId) : null;
      const captured = link?.payments?.find((p) => p.status === "captured" && PAY_ID_RE.test(p.payment_id));
      if (!link || link.status !== "paid" || !captured) throw new Error("Payment not captured");
      const key = refundKey(reference);
      // Already refunded under this reference (a retry after a timeout)? Return it instead of refunding again.
      const existing = await call<{ items: { id: string; receipt?: string | null }[] }>("GET", `/payments/${captured.payment_id}/refunds?count=100`);
      const done = existing.items.find((r) => r.receipt === key);
      if (done) return { refundId: done.id };
      const r = await call<{ id: string }>("POST", `/payments/${captured.payment_id}/refund`, { amount, speed: "normal", receipt: key, notes: { reference: reference.slice(0, 200) } }, { "X-Refund-Idempotency": key });
      if (!/^rfnd_[A-Za-z0-9]{8,24}$/.test(r.id)) throw new RazorpayError(502, "unexpected_response");
      return { refundId: r.id };
    },
  };
}
