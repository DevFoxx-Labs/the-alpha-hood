import { recordCommunicationConsent, type RequestContext } from "@/lib/consent/service";
import type { ConsentLedger } from "@/lib/consent/ledger";
import { dbStores } from "@/lib/db";
import { ValidationError } from "@/lib/http/guard";
import { BackendUnavailableError, devSingleton, type Env, mockDataAllowed } from "@/lib/mock-guard";
import type { CommunicationPurpose } from "@/lib/consent/purposes";
import { csvCell } from "@/lib/security/csv-cell";
import { asObject, normaliseEmail, normaliseIndianMobile, rejectUnknownFields } from "@/lib/validation";

/**
 * GLB-05 newsletter: email, WhatsApp number OR mobile number for SMS — one channel per sign-up, each its own consent
 * purpose — only with a ticked (never pre-ticked) consent checkbox,
 * validated on the server. Each sign-up writes a consent ledger row linked to the subscriber.
 *
 * No messages are sent yet (no email/WhatsApp provider — PRD §9). When one is added, a confirmation
 * (double opt-in) message must verify the contact before any offer is sent (docs/known-gaps.md).
 */
export type NewsletterChannel = "email" | "whatsapp" | "sms";
export const NEWSLETTER_CHANNELS: readonly NewsletterChannel[] = ["email", "whatsapp", "sms"];

/** One consent purpose per channel (unbundled: offers by WhatsApp and by SMS are separate choices). */
export const CHANNEL_PURPOSE = {
  email: "marketing_email",
  whatsapp: "marketing_whatsapp",
  sms: "marketing_sms",
} as const satisfies Record<NewsletterChannel, CommunicationPurpose>;
const MARKETING_PURPOSE_SET = new Set<string>(Object.values(CHANNEL_PURPOSE));

export interface Subscriber {
  id: string;
  channel: NewsletterChannel;
  contact: string;
  status: "pending_confirmation" | "confirmed" | "unsubscribed";
  createdAt: string;
}

/** Admin list filter. `q` matches part of the contact (plain text, never a pattern). Newest first. */
export interface SubscriberQuery {
  channel?: NewsletterChannel;
  status?: Subscriber["status"];
  q?: string;
  limit: number;
  offset: number;
}

export interface NewsletterStore {
  upsert(channel: NewsletterChannel, contact: string, now: Date): Promise<Subscriber>;
  /** Admin list (newest first) + total matching. */
  list(query: SubscriberQuery): Promise<{ rows: Subscriber[]; total: number }>;
  /** Marks unsubscribed; returns false if unknown or already unsubscribed. */
  unsubscribe(id: string): Promise<boolean>;
}

export function createMemoryNewsletterStore(): NewsletterStore {
  const byKey = new Map<string, Subscriber>();
  return {
    async list({ channel, status, q, limit, offset }) {
      const needle = q?.toLowerCase();
      const all = [...byKey.values()]
        .filter((x) => (!channel || x.channel === channel) && (!status || x.status === status) && (!needle || x.contact.toLowerCase().includes(needle)))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? 1 : -1));
      return { rows: all.slice(offset, offset + limit).map((x) => ({ ...x })), total: all.length };
    },
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
  return { upsert: fail, list: fail, unsubscribe: fail };
}

export function parseNewsletterInput(body: unknown): { channel: NewsletterChannel; contact: string } {
  const input = asObject(body);
  rejectUnknownFields(input, ["channel", "contact", "consent"]);
  // DPDP: consent must be an affirmative act — the checkbox value must be literally `true`.
  if (input.consent !== true) throw new ValidationError("Please tick the box to agree to receive offers.");
  const channel = input.channel;
  if (channel !== "email" && channel !== "whatsapp" && channel !== "sms") throw new ValidationError("Choose email, WhatsApp or SMS.");
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
    if (row.subscriber_id && MARKETING_PURPOSE_SET.has(row.purpose)) {
      latest.set(`${row.subscriber_id}:${row.purpose}`, row);
    }
  }
  let count = 0;
  for (const row of latest.values()) {
    if (row.status !== "granted" || !row.subscriber_id) continue;
    await deps.store.unsubscribe(row.subscriber_id);
    await recordCommunicationConsent(deps.ledger, {
      purpose: row.purpose as CommunicationPurpose,
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
    purpose: CHANNEL_PURPOSE[input.channel],
    subscriberId: subscriber.id,
    visitorId: input.visitorId,
    status: "granted",
    method: "checkbox",
    ctx: input.ctx,
    now,
  });
  return subscriber;
}

/* ---------- Admin: subscriber list + CSV export (`subscribers.read`) ---------- */

export const SUBSCRIBER_PAGE_SIZE = 50;
export const SUBSCRIBER_EXPORT_MAX = 20_000;

const STATUSES = ["pending_confirmation", "confirmed", "unsubscribed"] as const;

/** Allow-listed query → store query. Unknown values are ignored (treated as "all"). */
export function parseSubscriberQuery(params: URLSearchParams): Omit<SubscriberQuery, "limit" | "offset"> & { page: number } {
  const channel = params.get("channel");
  const status = params.get("status");
  const q = (params.get("q") ?? "").trim().toLowerCase().slice(0, 80);
  const page = Math.min(10_000, Math.max(1, Math.floor(Number(params.get("page")) || 1)));
  return {
    channel: (NEWSLETTER_CHANNELS as readonly string[]).includes(channel ?? "") ? (channel as NewsletterChannel) : undefined,
    status: (STATUSES as readonly string[]).includes(status ?? "") ? (status as Subscriber["status"]) : undefined,
    q: q || undefined,
    page,
  };
}

/** Masked for the on-screen list (`ra****@gmail.com`, `+91******3210`); the full contact only goes out in the audited export. */
export function maskContact(channel: NewsletterChannel, contact: string): string {
  if (channel !== "email") return contact.length > 4 ? `${contact.slice(0, 3)}${"*".repeat(Math.max(0, contact.length - 7))}${contact.slice(-4)}` : "****";
  const at = contact.indexOf("@");
  if (at < 1) return "****";
  const user = contact.slice(0, at);
  return `${user.slice(0, Math.min(2, user.length))}${"*".repeat(Math.max(2, user.length - 2))}${contact.slice(at)}`;
}

export async function listSubscribers(store: NewsletterStore, params: URLSearchParams) {
  const { page, ...filter } = parseSubscriberQuery(params);
  const { rows, total } = await store.list({ ...filter, limit: SUBSCRIBER_PAGE_SIZE, offset: (page - 1) * SUBSCRIBER_PAGE_SIZE });
  return {
    rows: rows.map((r) => ({ id: r.id, channel: r.channel, contact: maskContact(r.channel, r.contact), status: r.status, createdAt: r.createdAt })),
    total,
    page,
    pageSize: SUBSCRIBER_PAGE_SIZE,
  };
}

/**
 * CSV of the filtered list with full contacts (for sending campaigns). Unsubscribed people are left out unless the
 * filter asks for them. Every cell is formula-neutralised (CSV injection).
 */
export async function subscribersCsv(store: NewsletterStore, params: URLSearchParams): Promise<{ csv: string; count: number }> {
  const { page: _page, ...filter } = parseSubscriberQuery(params);
  void _page;
  const { rows } = await store.list({ ...filter, limit: SUBSCRIBER_EXPORT_MAX, offset: 0 });
  const keep = filter.status ? rows : rows.filter((r) => r.status !== "unsubscribed");
  const lines = [["channel", "contact", "status", "subscribed_at"].join(",")];
  for (const r of keep) lines.push([r.channel, r.contact, r.status, r.createdAt].map(csvCell).join(","));
  return { csv: `${lines.join("\r\n")}\r\n`, count: keep.length };
}
