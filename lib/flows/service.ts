import { sweepAlerts, type AlertStore } from "@/lib/alerts/service";
import type { CommerceAdapter } from "@/lib/commerce/types";
import { dbStores } from "@/lib/db";
import { devSingleton, type Env, mockDataAllowed } from "@/lib/mock-guard";
import { notify } from "@/lib/notify/outbox";
import type { OrderStore } from "@/lib/orders/store";

/**
 * LOY-04 / ORD-02 scheduled flows, run by the cron sweep (app/api/cron/sweep):
 * - abandoned checkout: a signed-in customer opened checkout with items and didn't order → reminder after 1 h and
 *   24 h. Marketing: only with marketing consent and inside the frequency cap (lib/notify/outbox).
 * - review request: 3 days after delivery (order-related, transactional channels).
 * - product alerts: back-in-stock / price-drop checks.
 * Each step is claimed with a conditional write before the message is queued, so two sweeps running at the same
 * time (two servers, a retried cron) send each reminder at most once.
 * Browse abandonment and wishlist reminders need server-side browsing / wishlist data we don't keep (the
 * wishlist stays on the device) — not built, see docs/known-gaps.md.
 */
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export interface CheckoutSession {
  customerId: string;
  cartId: string;
  startedAt: string;
  sent: { h1: boolean; h24: boolean };
}

export interface FlowStore {
  getCheckout(customerId: string): Promise<CheckoutSession | null>;
  putCheckout(s: CheckoutSession): Promise<void>;
  listCheckouts(): Promise<CheckoutSession[]>;
  deleteCheckout(customerId: string): Promise<void>;
  /**
   * Claims a reminder step for this checkout (only if it's still the same checkout and not yet claimed).
   * `h24` also claims `h1`. Returns false when someone else already did.
   */
  claimStep(customerId: string, startedAt: string, step: "h1" | "h24"): Promise<boolean>;
  /** Claims the review request for an order (once ever). */
  claimReview(orderNumber: string): Promise<boolean>;
}

export function createMemoryFlowStore(): FlowStore & { clear(): void } {
  const sessions = new Map<string, CheckoutSession>();
  const reviewed = new Set<string>();
  return {
    async getCheckout(id) {
      const s = sessions.get(id);
      return s ? structuredClone(s) : null;
    },
    async putCheckout(s) {
      sessions.set(s.customerId, structuredClone(s));
    },
    async listCheckouts() {
      return [...sessions.values()].map((s) => structuredClone(s));
    },
    async deleteCheckout(id) {
      sessions.delete(id);
    },
    async claimStep(id, startedAt, step) {
      const s = sessions.get(id);
      if (!s || s.startedAt !== startedAt || s.sent[step]) return false;
      s.sent[step] = true;
      if (step === "h24") s.sent.h1 = true;
      return true;
    },
    async claimReview(n) {
      if (reviewed.has(n)) return false;
      reviewed.add(n);
      return true;
    },
    clear() {
      sessions.clear();
      reviewed.clear();
    },
  };
}

export function resolveFlows(env: Env = process.env): FlowStore | null {
  const db = dbStores(env);
  if (db) return db.flows;
  return mockDataAllowed(env) ? devSingleton("flows_v2", createMemoryFlowStore) : null;
}

/** Called when a signed-in customer loads checkout with items (no personal data stored — ids and time only). */
export async function recordCheckoutStart(customerId: string, cartId: string, now = new Date()) {
  const s = resolveFlows();
  if (!s) return;
  const existing = await s.getCheckout(customerId);
  if (existing && existing.cartId === cartId && now.getTime() - Date.parse(existing.startedAt) < DAY) return;
  await s.putCheckout({ customerId, cartId, startedAt: now.toISOString(), sent: { h1: false, h24: false } });
}

export interface SweepDeps {
  orders: Pick<OrderStore, "listByCustomer" | "listRecent">;
  commerce: CommerceAdapter;
  alerts: AlertStore;
  flows?: FlowStore | null;
  env?: Env;
}

export async function runSweep(deps: SweepDeps, now = new Date()) {
  const result = { abandoned: 0, reviews: 0, alerts: 0 };
  const s = deps.flows === undefined ? resolveFlows(deps.env) : deps.flows;
  const t = now.getTime();

  if (s) {
    for (const session of await s.listCheckouts()) {
      const id = session.customerId;
      const started = Date.parse(session.startedAt);
      const ordered = (await deps.orders.listByCustomer(id)).some((o) => Date.parse(o.createdAt) >= started);
      if (ordered || t - started > 7 * DAY) {
        await s.deleteCheckout(id);
        continue;
      }
      // One reminder per step, consent or not (never retried in a loop); the claim makes it once across servers.
      if (!session.sent.h24 && t - started >= DAY) {
        if ((await s.claimStep(id, session.startedAt, "h24")) && (await notify(id, "abandoned_checkout_24h", {}, now))) result.abandoned++;
      } else if (!session.sent.h1 && t - started >= HOUR) {
        if ((await s.claimStep(id, session.startedAt, "h1")) && (await notify(id, "abandoned_checkout_1h", {}, now))) result.abandoned++;
      }
    }

    for (const o of await deps.orders.listRecent(1000)) {
      if (o.fulfilment !== "delivered" || !o.deliveredAt) continue;
      const age = t - Date.parse(o.deliveredAt);
      if (age < 3 * DAY) continue;
      if (!(await s.claimReview(o.number))) continue;
      if (age > 30 * DAY) continue; // too late to ask
      if (await notify(o.customerId, "review_request", { orderNumber: o.number }, now)) result.reviews++;
    }
  }

  result.alerts = await sweepAlerts({ commerce: deps.commerce, alerts: deps.alerts }, undefined, now);
  return result;
}

/** Test hook (memory store only). */
export function resetFlowsForTests() {
  const s = resolveFlows();
  if (s && "clear" in s) (s as { clear(): void }).clear();
}
