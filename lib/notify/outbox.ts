import type { ConsentLedger, ConsentRecord } from "@/lib/consent/ledger";
import { resolveLedger } from "@/lib/consent/ledger";
import { devSingleton, mockDataAllowed } from "@/lib/mock-guard";

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
  | "abandoned_checkout_24h";

export type Channel = "sms" | "email" | "whatsapp";

const MARKETING: Template[] = ["abandoned_checkout_1h", "abandoned_checkout_24h"];
export const isMarketing = (t: Template) => MARKETING.includes(t);

export const FREQUENCY_CAP = { perDay: 1, perWeek: 3 } as const;

export interface OutboxMessage {
  customerId: string;
  template: Template;
  channels: Channel[];
  refs: Record<string, string>;
  createdAt: string;
  status: "queued";
}

function outbox(): OutboxMessage[] | null {
  return mockDataAllowed() ? devSingleton("notify_outbox", () => [] as OutboxMessage[]) : null;
}

function latest(rows: ConsentRecord[], purpose: string) {
  for (let i = rows.length - 1; i >= 0; i--) if (rows[i].purpose === purpose) return rows[i].status;
  return undefined;
}

/** Channels allowed for this customer and template, from the consent ledger. */
export async function channelsFor(customerId: string, template: Template, ledger: ConsentLedger = resolveLedger()): Promise<Channel[]> {
  const rows = await ledger.listByUser(customerId).catch(() => [] as ConsentRecord[]);
  const on = (p: string) => latest(rows, p) === "granted";
  if (isMarketing(template)) return [...(on("marketing_email") ? (["email"] as const) : []), ...(on("marketing_whatsapp") ? (["whatsapp"] as const) : [])];
  return ["sms", "email", ...(on("whatsapp_updates") ? (["whatsapp"] as const) : [])];
}

/** Queues a message; returns false when nothing may be sent (no consent, over the cap, or no outbox). */
export async function notify(customerId: string, template: Template, refs: Record<string, string>, now = new Date(), ledger?: ConsentLedger): Promise<boolean> {
  const box = outbox();
  // No provider/DB on the live store yet: nothing to queue to (tracked in docs/known-gaps.md).
  if (!box) return false;
  const channels = await channelsFor(customerId, template, ledger);
  if (channels.length === 0) return false;
  if (isMarketing(template)) {
    const t = now.getTime();
    const mine = box.filter((m) => m.customerId === customerId && isMarketing(m.template));
    const inDay = mine.filter((m) => t - Date.parse(m.createdAt) < 86_400_000).length;
    const inWeek = mine.filter((m) => t - Date.parse(m.createdAt) < 7 * 86_400_000).length;
    if (inDay >= FREQUENCY_CAP.perDay || inWeek >= FREQUENCY_CAP.perWeek) return false;
  }
  box.push({ customerId, template, channels, refs, createdAt: now.toISOString(), status: "queued" });
  if (box.length > 5_000) box.splice(0, box.length - 5_000);
  return true;
}

export function outboxFor(customerId: string): OutboxMessage[] {
  return (outbox() ?? []).filter((m) => m.customerId === customerId);
}

/** Test hook. */
export function clearOutboxForTests() {
  outbox()?.splice(0);
}
