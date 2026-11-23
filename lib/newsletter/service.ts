import { recordCommunicationConsent, type RequestContext } from "@/lib/consent/service";
import type { ConsentLedger } from "@/lib/consent/ledger";
import { dbStores } from "@/lib/db";
import { ValidationError } from "@/lib/http/guard";
import { BackendUnavailableError, devSingleton, type Env, mockDataAllowed } from "@/lib/mock-guard";
import { asObject, normaliseEmail, normaliseIndianMobile, rejectUnknownFields } from "@/lib/validation";

/**
 * GLB-05 newsletter: email OR WhatsApp number, only with a ticked (never pre-ticked) consent checkbox,
 * validated on the server. Each sign-up writes a consent ledger row linked to the subscriber.
 *
 * No messages are sent yet (no email/WhatsApp provider — PRD §9). When one is added, a confirmation
 * (double opt-in) message must verify the contact before any offer is sent (docs/known-gaps.md).
 */
export type NewsletterChannel = "email" | "whatsapp";

export interface Subscriber {
  id: string;
  channel: NewsletterChannel;
  contact: string;
  status: "pending_confirmation" | "confirmed" | "unsubscribed";
  createdAt: string;
}

export interface NewsletterStore {
  upsert(channel: NewsletterChannel, contact: string, now: Date): Promise<Subscriber>;
  /** Marks unsubscribed; returns false if unknown or already unsubscribed. */
  unsubscribe(id: string): Promise<boolean>;
}

export function createMemoryNewsletterStore(): NewsletterStore {
  const byKey = new Map<string, Subscriber>();
  return {
    async unsubscribe(id) {
      for (const sub of byKey.values()) {
        if (sub.id === id && sub.status !== "unsubscribed") {
          sub.status = "unsubscribed";
          return true;
        }
      }
      return false;
    },
    async upsert(channel, contact, now) {
      const key = `${channel}:${contact}`;
      const existing = byKey.get(key);
      if (existing && existing.status !== "unsubscribed") return existing;
      const sub: Subscriber = {
        id: crypto.randomUUID(),
        channel,
        contact,
        status: "pending_confirmation",
        createdAt: now.toISOString(),
      };
      byKey.set(key, sub);
      return sub;
    },
  };
}

export function resolveNewsletterStore(env: Env = process.env): NewsletterStore {
  const db = dbStores(env);
  if (db) return db.newsletter;
  if (mockDataAllowed(env)) return devSingleton("newsletter", createMemoryNewsletterStore);
  const fail = async (): Promise<never> => {
    throw new BackendUnavailableError("Newsletter");
  };
  return { upsert: fail, unsubscribe: fail };
}

export function parseNewsletterInput(body: unknown): { channel: NewsletterChannel; contact: string } {
  const input = asObject(body);
  rejectUnknownFields(input, ["channel", "contact", "consent"]);
  // DPDP: consent must be an affirmative act — the checkbox value must be literally `true`.
  if (input.consent !== true) throw new ValidationError("Please tick the box to agree to receive offers.");
  const channel = input.channel;
  if (channel !== "email" && channel !== "whatsapp") throw new ValidationError("Choose email or WhatsApp.");
  const contact = channel === "email" ? normaliseEmail(input.contact) : normaliseIndianMobile(input.contact);
  if (!contact) {
    throw new ValidationError(channel === "email" ? "Enter a valid email address." : "Enter a valid 10-digit mobile number.");
  }
  return { channel, contact };
}

/**
 * DPDP rule §4: withdraw every offer subscription this browser signed up — one click, effective
 * immediately (subscriber marked unsubscribed + `withdrawn` ledger rows). Returns how many were withdrawn.
 */
export async function withdrawForVisitor(
  deps: { store: NewsletterStore; ledger: ConsentLedger },
  input: { visitorId: string; ctx: RequestContext; now?: Date },
): Promise<number> {
  const history = await deps.ledger.listByVisitor(input.visitorId);
  const latest = new Map<string, (typeof history)[number]>();
  for (const row of history) {
    if (row.subscriber_id && (row.purpose === "marketing_email" || row.purpose === "marketing_whatsapp")) {
      latest.set(`${row.subscriber_id}:${row.purpose}`, row);
    }
  }
  let count = 0;
  for (const row of latest.values()) {
    if (row.status !== "granted" || !row.subscriber_id) continue;
    await deps.store.unsubscribe(row.subscriber_id);
    await recordCommunicationConsent(deps.ledger, {
      purpose: row.purpose as "marketing_email" | "marketing_whatsapp",
      subscriberId: row.subscriber_id,
      visitorId: input.visitorId,
      status: "withdrawn",
      method: "consent_settings",
      ctx: input.ctx,
      now: input.now,
    });
    count++;
  }
  return count;
}

export async function subscribe(
  deps: { store: NewsletterStore; ledger: ConsentLedger },
  input: { channel: NewsletterChannel; contact: string; visitorId: string | null; ctx: RequestContext; now?: Date },
) {
  const now = input.now ?? new Date();
  const subscriber = await deps.store.upsert(input.channel, input.contact, now);
  await recordCommunicationConsent(deps.ledger, {
    purpose: input.channel === "email" ? "marketing_email" : "marketing_whatsapp",
    subscriberId: subscriber.id,
    visitorId: input.visitorId,
    status: "granted",
    method: "checkbox",
    ctx: input.ctx,
    now,
  });
  return subscriber;
}
