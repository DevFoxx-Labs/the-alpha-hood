import { createHash } from "node:crypto";
import { after } from "next/server";
import { readTracking } from "@/lib/config/tracking";
import type { Paise } from "@/lib/format";
import type { Env } from "@/lib/mock-guard";
import type { Order } from "@/lib/orders/store";
import { siteUrl } from "@/lib/seo/site";
import { purchaseEventId, rupeesValue } from "./events";

/**
 * ANL-01 server-side events: Meta Conversions API `Purchase` (deduplicated with the Pixel by event id) and the
 * GA4 Measurement Protocol `refund` (no browser is present when a refund happens).
 *
 * - Fail closed: nothing is sent unless the public ID AND the server secret are configured.
 * - Consent: only what the order's consent snapshot (lib/analytics/attribution.ts) allows. No snapshot → nothing.
 * - Contact data goes to Meta only as SHA-256 hashes, only with advertising consent. Never logged.
 * - Outbox: services queue events in memory; they are sent after the response (`after()`), never inside an
 *   order lock or DB transaction. In-memory = lost on a crash — becomes a durable outbox with the database.
 */
export interface ServerAnalyticsConfig {
  meta: { pixelId: string; token: string; testEventCode: string | null } | null;
  ga4: { measurementId: string; apiSecret: string } | null;
}

export function readServerAnalytics(env: Env = process.env): ServerAnalyticsConfig {
  const t = readTracking(env);
  const token = env.META_CAPI_TOKEN?.trim() ?? "";
  const test = env.META_TEST_EVENT_CODE?.trim() ?? "";
  const secret = env.GA4_API_SECRET?.trim() ?? "";
  return {
    meta: t.metaPixelId && /^[A-Za-z0-9_-]{20,400}$/.test(token) ? { pixelId: t.metaPixelId, token, testEventCode: /^TEST\w{1,20}$/.test(test) ? test : null } : null,
    ga4: t.ga4Id && /^[A-Za-z0-9_-]{8,64}$/.test(secret) ? { measurementId: t.ga4Id, apiSecret: secret } : null,
  };
}

export interface QueuedEvent {
  /** Dedupe key: one send per (destination, event). */
  key: string;
  destination: "meta" | "ga4";
  url: string;
  body: unknown;
}

interface Outbox {
  queue: QueuedEvent[];
  sent: Set<string>;
}
const g = globalThis as unknown as { __alpha_hood_analytics_outbox?: Outbox };
function outbox(): Outbox {
  return (g.__alpha_hood_analytics_outbox ??= { queue: [], sent: new Set() });
}

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
/** Meta normalisation: digits only with the country code (India: 91 + 10 digits). */
export function normalisePhone(phone: string): string | null {
  const d = phone.replace(/\D/g, "");
  if (/^[6-9]\d{9}$/.test(d)) return `91${d}`;
  if (/^91[6-9]\d{9}$/.test(d)) return d;
  return null;
}

export function metaPurchaseEvent(order: Order, cfg: NonNullable<ServerAnalyticsConfig["meta"]>, now = new Date()): QueuedEvent | null {
  const a = order.attribution;
  if (!a?.advertising) return null;
  const phone = normalisePhone(order.address.phone);
  const userData: Record<string, unknown> = { external_id: [sha256(order.customerId)] };
  if (phone) userData.ph = [sha256(phone)];
  if (a.ip) userData.client_ip_address = a.ip;
  if (a.userAgent) userData.client_user_agent = a.userAgent;
  if (a.fbp) userData.fbp = a.fbp;
  if (a.fbc) userData.fbc = a.fbc;
  const eventTime = Math.floor(Date.parse(order.confirmedAt ?? now.toISOString()) / 1000);
  return {
    key: `meta:${purchaseEventId(order.number)}`,
    destination: "meta",
    url: `https://graph.facebook.com/v21.0/${cfg.pixelId}/events`,
    body: {
      access_token: cfg.token,
      ...(cfg.testEventCode ? { test_event_code: cfg.testEventCode } : {}),
      data: [
        {
          event_name: "Purchase",
          event_time: eventTime,
          event_id: purchaseEventId(order.number),
          action_source: "website",
          event_source_url: siteUrl(`/checkout/order/${order.number}`),
          user_data: userData,
          custom_data: {
            currency: "INR",
            value: rupeesValue(order.pricing.total),
            order_id: order.number,
            content_type: "product_group",
            content_ids: order.lines.map((l) => l.productId),
            contents: order.lines.map((l) => ({ id: l.productId, quantity: l.quantity, item_price: rupeesValue(Math.round(l.net / Math.max(1, l.quantity))) })),
            num_items: order.lines.reduce((s, l) => s + l.quantity, 0),
          },
        },
      ],
    },
  };
}

export function ga4RefundEvent(order: Order, amount: Paise, reference: string, cfg: NonNullable<ServerAnalyticsConfig["ga4"]>): QueuedEvent | null {
  const a = order.attribution;
  if (!a?.analytics || !a.gaClientId || amount <= 0) return null;
  const qs = new URLSearchParams({ measurement_id: cfg.measurementId, api_secret: cfg.apiSecret });
  return {
    key: `ga4:refund:${reference}`,
    destination: "ga4",
    url: `https://www.google-analytics.com/mp/collect?${qs}`,
    body: {
      client_id: a.gaClientId,
      non_personalized_ads: !a.advertising,
      events: [{ name: "refund", params: { transaction_id: order.number, currency: "INR", value: rupeesValue(amount) } }],
    },
  };
}

function enqueue(e: QueuedEvent | null) {
  if (!e) return;
  const box = outbox();
  if (box.sent.has(e.key) || box.queue.some((q) => q.key === e.key)) return;
  box.queue.push(e);
  try {
    after(() => flushServerEvents());
  } catch {
    // Not inside a request (tests, scripts): the caller flushes.
  }
}

/** Called when an order becomes confirmed (paid, or COD placed). */
export function queuePurchase(order: Order, env: Env = process.env) {
  const cfg = readServerAnalytics(env);
  if (cfg.meta) enqueue(metaPurchaseEvent(order, cfg.meta));
}

/** Called once per refund reference (cancellation refund, return refund / credit). */
export function queueRefund(order: Order, amount: Paise, reference: string, env: Env = process.env) {
  const cfg = readServerAnalytics(env);
  if (cfg.ga4) enqueue(ga4RefundEvent(order, amount, reference, cfg.ga4));
}

/** Sends queued events (3 s timeout each). Failures are dropped after one attempt and counted, never logged with data. */
export async function flushServerEvents(fetchImpl: typeof fetch = fetch): Promise<{ sent: number; failed: number }> {
  const box = outbox();
  const batch = box.queue.splice(0, box.queue.length);
  let sent = 0;
  let failed = 0;
  await Promise.all(
    batch.map(async (e) => {
      try {
        const res = await fetchImpl(e.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(e.body),
          signal: AbortSignal.timeout(3000),
          cache: "no-store",
        });
        if (!res.ok) throw new Error(String(res.status));
        box.sent.add(e.key);
        sent++;
      } catch {
        failed++;
      }
    }),
  );
  if (box.sent.size > 10_000) box.sent.clear();
  return { sent, failed };
}

/** Test hooks. */
export function pendingServerEvents(): readonly QueuedEvent[] {
  return outbox().queue;
}
export function resetServerEventsForTests() {
  const box = outbox();
  box.queue.length = 0;
  box.sent.clear();
}
