import { devSingleton, mockDataAllowed } from "@/lib/mock-guard";

/**
 * ORD-02 transactional notifications (SMS with DLT-registered templates + email). Providers pending
 * (PRD §9), so messages go to an outbox that a worker will deliver. The outbox stores the template and
 * references only — never message bodies with personal data, OTPs or full phone numbers.
 * Order updates are transactional (no marketing consent needed); marketing goes through the consent ledger.
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
  | "return_rejected";

export interface OutboxMessage {
  customerId: string;
  template: Template;
  channels: ("sms" | "email")[];
  refs: Record<string, string>;
  createdAt: string;
  status: "queued";
}

function outbox(): OutboxMessage[] | null {
  return mockDataAllowed() ? devSingleton("notify_outbox", () => [] as OutboxMessage[]) : null;
}

export async function notify(customerId: string, template: Template, refs: Record<string, string>) {
  const box = outbox();
  // No provider/DB on the live store yet: nothing to queue to (tracked in docs/known-gaps.md).
  if (!box) return;
  box.push({ customerId, template, channels: ["sms", "email"], refs, createdAt: new Date().toISOString(), status: "queued" });
  if (box.length > 5_000) box.splice(0, box.length - 5_000);
}

export function outboxFor(customerId: string): OutboxMessage[] {
  return (outbox() ?? []).filter((m) => m.customerId === customerId);
}
