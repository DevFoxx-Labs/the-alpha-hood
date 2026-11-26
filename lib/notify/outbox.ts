import { allows } from "./switches";
import type { ConsentLedger, ConsentRecord } from "@/lib/consent/ledger";
import { resolveLedger } from "@/lib/consent/ledger";
import { locks } from "@/lib/concurrency/lock";
import { dbStores } from "@/lib/db";
import { devSingleton, type Env, mockDataAllowed } from "@/lib/mock-guard";

/**
 * ORD-02 / LOY-04 notifications. Providers (SMS with DLT templates, email, WhatsApp BSP) are pending (PRD §9),
 * so messages go to an outbox that a worker will deliver. The outbox stores the template and references only —
 * never message bodies with personal data, OTPs or full phone numbers.
 *
 * Channels follow consent (DPDP):
 * - transactional (order / return / alert the customer asked for): SMS + email, plus WhatsApp only if the
 *   customer switched on "Order updates on WhatsApp" (`whatsapp_updates`);
 * - marketing (abandoned checkout): only the channels with marketing consent (`marketing_email`,
 *   `marketing_whatsapp`), and at most 1 per 24 h and 3 per 7 days per customer. No consent → not queued.
 *   The cap check and the insert run under a per-customer lock (two sweeps can't both slip past it).
 */
export type Template =
  | "order_confirmed"
  | "order_packed"
  | "order_shipped"
  | "order_out_for_delivery"
  | "order_delivered"
  | "order_cancelled"
  | "refund_initiated"
  | "return_requested"
  | "return_pickup_scheduled"
  | "return_completed"
  | "return_rejected"
  | "review_request"
  | "back_in_stock"
  | "price_drop"
  | "abandoned_checkout_1h"
  | "abandoned_checkout_24h"
  | "new_device_sign_in"
  | "review_published"
  | "review_rejected"
  | "review_replied"
  | "feedback_answered";

export type Channel = "sms" | "email" | "whatsapp";

const MARKETING: Template[] = ["abandoned_checkout_1h", "abandoned_checkout_24h"];
export const isMarketing = (t: Template) => MARKETING.includes(t);

export const FREQUENCY_CAP = { perDay: 1, perWeek: 3 } as const;

export type OutboxStatus = "queued" | "sending" | "done" | "failed";
/** Per channel: sent, skipped (no template / no number / no consent provider), or no_provider yet. */
export type ChannelResult = "sent" | "skipped" | "no_provider" | "failed";

export interface OutboxMessage {
  customerId: string;
  template: Template;
  channels: Channel[];
  refs: Record<string, string>;
  createdAt: string;
  status: OutboxStatus;
}

/** A message handed to the delivery worker (exclusively — nobody else holds it while it's `sending`). */
export interface ClaimedMessage extends OutboxMessage {
  id: string;
  attempts: number;
  results: Partial<Record<Channel, ChannelResult>>;
}

export interface DeliveryOutcome {
  status: "done" | "failed" | "queued";
  results: Partial<Record<Channel, ChannelResult>>;
  /** For `queued` (retry): not before this time (ms). */
  nextAttemptAt?: number;
}

/** A claim older than this is treated as a crashed worker and the message is offered again. */
export const STALE_CLAIM_MS = 10 * 60_000;

export interface OutboxStore {
  push(m: OutboxMessage): Promise<void>;
  /** Atomically takes up to `limit` due queued messages (and re-offers stale claims). */
  claim(limit: number, now: number): Promise<ClaimedMessage[]>;
  /** Records the result of a claimed message (only if it's still claimed). */
  finish(id: string, outcome: DeliveryOutcome, now: number): Promise<void>;
  /** Marketing messages queued for this customer since `since` (ISO). */
  marketingSince(customerId: string, since: string): Promise<number>;
  listFor(customerId: string): Promise<OutboxMessage[]>;
  /** Account erasure: drops queued messages for the customer. */
  erase(customerId: string): Promise<void>;
}

type Stored = ClaimedMessage & { nextAttemptAt: number; claimedAt: number };

export function createMemoryOutbox(): OutboxStore & { clear(): void } {
  const box: Stored[] = [];
  let n = 0;
  return {
    async push(m) {
      box.push({ ...structuredClone(m), id: `msg_${++n}`, attempts: 0, results: {}, nextAttemptAt: 0, claimedAt: 0 });
      if (box.length > 5_000) box.splice(0, box.length - 5_000);
    },
    async claim(limit, now) {
      const out: ClaimedMessage[] = [];
      for (const m of box) {
        if (out.length >= limit) break;
        const stale = m.status === "sending" && m.claimedAt < now - STALE_CLAIM_MS;
        if ((m.status === "queued" && m.nextAttemptAt <= now) || stale) {
          m.status = "sending";
          m.claimedAt = now;
          const { nextAttemptAt: _n, claimedAt: _c, ...rest } = structuredClone(m);
          void _n;
          void _c;
          out.push(rest);
        }
      }
      return out;
    },
    async finish(id, outcome) {
      const m = box.find((x) => x.id === id);
      if (!m || m.status !== "sending") return;
      m.status = outcome.status;
      m.results = { ...outcome.results };
      m.attempts += 1;
      m.nextAttemptAt = outcome.nextAttemptAt ?? 0;
    },
    async marketingSince(customerId, since) {
      return box.filter((m) => m.customerId === customerId && isMarketing(m.template) && m.createdAt >= since).length;
    },
    async listFor(customerId) {
      return box
        .filter((m) => m.customerId === customerId)
        .map(({ customerId: c, template, channels, refs, createdAt, status }) => structuredClone({ customerId: c, template, channels, refs, createdAt, status }));
    },
    async erase(customerId) {
      for (let i = box.length - 1; i >= 0; i--) if (box[i].customerId === customerId) box.splice(i, 1);
    },
    clear() {
      box.splice(0);
    },
  };
}

/** The outbox, or null when there is nowhere to queue to (live store without a database). */
export function resolveOutbox(env: Env = process.env): OutboxStore | null {
  const db = dbStores(env);
  if (db) return db.outbox;
  return mockDataAllowed(env) ? devSingleton("notify_outbox_v2", createMemoryOutbox) : null;
}

function latest(rows: ConsentRecord[], purpose: string) {
  for (let i = rows.length - 1; i >= 0; i--) if (rows[i].purpose === purpose) return rows[i].status;
  return undefined;
}

/** Channels allowed for this customer and template, from the consent ledger. */
export async function channelsFor(customerId: string, template: Template, ledger: ConsentLedger = resolveLedger()): Promise<Channel[]> {
  const rows = await ledger.listByUser(customerId).catch(() => [] as ConsentRecord[]);
  const on = (p: string) => latest(rows, p) === "granted";
  // The customer's own choices first; then the owner's switches can only take channels away (lib/notify/catalog.ts).
  const wanted: Channel[] = isMarketing(template)
    ? [...(on("marketing_email") ? (["email"] as const) : []), ...(on("marketing_whatsapp") ? (["whatsapp"] as const) : [])]
    : ["sms", "email", ...(on("whatsapp_updates") ? (["whatsapp"] as const) : [])];
  return wanted.filter((ch) => ch === "whatsapp" || allows(template, ch));
}

/** Queues a message; returns false when nothing may be sent (no consent, over the cap, or no outbox). */
export async function notify(customerId: string, template: Template, refs: Record<string, string>, now = new Date(), ledger?: ConsentLedger): Promise<boolean> {
  const box = resolveOutbox();
  // No provider/DB on the live store yet: nothing to queue to (tracked in docs/known-gaps.md).
  if (!box) return false;
  const channels = await channelsFor(customerId, template, ledger);
  if (channels.length === 0) return false;
  const message: OutboxMessage = { customerId, template, channels, refs, createdAt: now.toISOString(), status: "queued" };
  if (!isMarketing(template)) {
    await box.push(message);
    return true;
  }
  return locks.run(`notify:marketing:${customerId}`, async () => {
    const t = now.getTime();
    const inDay = await box.marketingSince(customerId, new Date(t - 86_400_000).toISOString());
    const inWeek = await box.marketingSince(customerId, new Date(t - 7 * 86_400_000).toISOString());
    if (inDay >= FREQUENCY_CAP.perDay || inWeek >= FREQUENCY_CAP.perWeek) return false;
    await box.push(message);
    return true;
  });
}

export async function outboxFor(customerId: string): Promise<OutboxMessage[]> {
  return (await resolveOutbox()?.listFor(customerId)) ?? [];
}

/** Test hook (memory outbox only). */
export function clearOutboxForTests() {
  const box = resolveOutbox();
  if (box && "clear" in box) (box as { clear(): void }).clear();
}
