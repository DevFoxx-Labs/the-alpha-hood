import { sweepAlerts, type AlertStore } from "@/lib/alerts/service";
import type { CommerceAdapter } from "@/lib/commerce/types";
import { devSingleton, type Env, mockDataAllowed } from "@/lib/mock-guard";
import { notify } from "@/lib/notify/outbox";
import type { OrderStore } from "@/lib/orders/store";

/**
 * LOY-04 / ORD-02 scheduled flows, run by the cron sweep (app/api/cron/sweep):
 * - abandoned checkout: a signed-in customer opened checkout with items and didn't order → reminder after 1 h and
 *   24 h. Marketing: only with marketing consent and inside the frequency cap (lib/notify/outbox).
 * - review request: 3 days after delivery (order-related, transactional channels).
 * - product alerts: back-in-stock / price-drop checks.
 * Browse abandonment and wishlist reminders need server-side browsing / wishlist data we don't keep (the
 * wishlist stays on the device) — not built, see docs/known-gaps.md.
 */
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

interface CheckoutSession {
  customerId: string;
  cartId: string;
  startedAt: string;
  sent: { h1: boolean; h24: boolean };
}

interface FlowState {
  sessions: Map<string, CheckoutSession>;
  reviewRequested: Set<string>;
}

function state(): FlowState | null {
  return mockDataAllowed() ? devSingleton("flows", () => ({ sessions: new Map(), reviewRequested: new Set() }) as FlowState) : null;
}

/** Called when a signed-in customer loads checkout with items (no personal data stored — ids and time only). */
export function recordCheckoutStart(customerId: string, cartId: string, now = new Date()) {
  const s = state();
  if (!s) return;
  const existing = s.sessions.get(customerId);
  if (existing && existing.cartId === cartId && now.getTime() - Date.parse(existing.startedAt) < DAY) return;
  s.sessions.set(customerId, { customerId, cartId, startedAt: now.toISOString(), sent: { h1: false, h24: false } });
}

export interface SweepDeps {
  orders: Pick<OrderStore, "listByCustomer" | "listRecent">;
  commerce: CommerceAdapter;
  alerts: AlertStore;
  env?: Env;
}

export async function runSweep(deps: SweepDeps, now = new Date()) {
  const result = { abandoned: 0, reviews: 0, alerts: 0 };
  const s = state();
  const t = now.getTime();

  if (s) {
    for (const [id, session] of s.sessions) {
      const started = Date.parse(session.startedAt);
      const ordered = (await deps.orders.listByCustomer(id)).some((o) => Date.parse(o.createdAt) >= started);
      if (ordered || t - started > 7 * DAY) {
        s.sessions.delete(id);
        continue;
      }
      if (!session.sent.h24 && t - started >= DAY) {
        session.sent.h24 = session.sent.h1 = true; // one reminder per step, consent or not (never retried in a loop)
        if (await notify(id, "abandoned_checkout_24h", {}, now)) result.abandoned++;
      } else if (!session.sent.h1 && t - started >= HOUR) {
        session.sent.h1 = true;
        if (await notify(id, "abandoned_checkout_1h", {}, now)) result.abandoned++;
      }
    }

    for (const o of await deps.orders.listRecent(1000)) {
      if (o.fulfilment !== "delivered" || !o.deliveredAt || s.reviewRequested.has(o.number)) continue;
      const age = t - Date.parse(o.deliveredAt);
      if (age < 3 * DAY) continue;
      s.reviewRequested.add(o.number);
      if (age > 30 * DAY) continue; // too late to ask
      if (await notify(o.customerId, "review_request", { orderNumber: o.number }, now)) result.reviews++;
    }
  }

  result.alerts = await sweepAlerts({ commerce: deps.commerce, alerts: deps.alerts }, undefined, now);
  return result;
}

/** Test hook. */
export function resetFlowsForTests() {
  const s = state();
  s?.sessions.clear();
  s?.reviewRequested.clear();
}
