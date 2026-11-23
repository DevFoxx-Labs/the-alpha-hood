import { dbStores } from "@/lib/db";
import { ValidationError } from "@/lib/http/guard";
import { LEGAL_CONFIG } from "@/lib/legal/config";
import { BackendUnavailableError, devSingleton, type Env, mockDataAllowed } from "@/lib/mock-guard";
import { asObject, cleanText, normaliseEmail, normaliseIndianMobile, rejectUnknownFields } from "@/lib/validation";
import { REQUEST_TYPES, type RequestType } from "./request-types";

/**
 * Data Principal rights + grievances (DPDP ss.11–14): one request form → grievance inbox with a reference
 * number and acknowledgement timelines. Free of charge. Identity is verified by the Grievance Officer
 * (OTP to the contact on file) before any access/erasure is fulfilled — never from this form alone.
 *
 * Inbox persistence + staff queue arrive with the database/admin (M7). Until then: in-memory in dev,
 * refused (503) in production so a request is never silently lost.
 */
export { REQUEST_TYPES, type RequestType };

export interface PrivacyRequestInput {
  type: RequestType;
  name: string;
  contact: string;
  contactKind: "email" | "phone";
  orderNumber: string | null;
  details: string;
  nominee: { name: string; contact: string } | null;
}

export interface PrivacyRequest extends PrivacyRequestInput {
  reference: string;
  status: "received" | "acknowledged" | "in_progress" | "resolved" | "rejected";
  /** Staff notes / response log (append-only). */
  log?: { at: string; by: string; status: string; note: string }[];
  createdAt: string;
  acknowledgeBy: string;
  resolveBy: string;
}

export interface GrievanceInbox {
  create(input: PrivacyRequestInput, now: Date): Promise<PrivacyRequest>;
  countRecentByContact(contact: string, sinceMs: number, now: Date): Promise<number>;
  list(): Promise<PrivacyRequest[]>;
  get(reference: string): Promise<PrivacyRequest | null>;
  setStatus(reference: string, status: PrivacyRequest["status"], by: string, note: string, now?: Date): Promise<PrivacyRequest | null>;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function reference(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `PR-${Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("")}`;
}

/** A new request with its reference and DPDP deadlines (one rule for every store). */
export function newPrivacyRequest(input: PrivacyRequestInput, now: Date): PrivacyRequest {
  return {
    ...input,
    reference: reference(),
    status: "received",
    createdAt: now.toISOString(),
    acknowledgeBy: new Date(now.getTime() + LEGAL_CONFIG.acknowledgeWithinHours * 3_600_000).toISOString(),
    resolveBy: new Date(now.getTime() + LEGAL_CONFIG.resolveWithinDays * 86_400_000).toISOString(),
  };
}

export function createMemoryInbox(): GrievanceInbox {
  const items: PrivacyRequest[] = [];
  return {
    async create(input, now) {
      const request = newPrivacyRequest(input, now);
      items.push(request);
      return request;
    },
    async countRecentByContact(contact, sinceMs, now) {
      const since = now.getTime() - sinceMs;
      return items.filter((r) => r.contact === contact && Date.parse(r.createdAt) >= since).length;
    },
    async list() {
      return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((r) => structuredClone(r));
    },
    async get(reference) {
      const r = items.find((x) => x.reference === reference);
      return r ? structuredClone(r) : null;
    },
    async setStatus(reference, status, by, note, now = new Date()) {
      const r = items.find((x) => x.reference === reference);
      if (!r) return null;
      r.status = status;
      r.log = [...(r.log ?? []), { at: now.toISOString(), by, status, note }];
      return structuredClone(r);
    },
  };
}

export function resolveInbox(env: Env = process.env): GrievanceInbox {
  const db = dbStores(env);
  if (db) return db.inbox;
  if (mockDataAllowed(env)) return devSingleton("grievance_inbox", createMemoryInbox);
  const fail = async (): Promise<never> => {
    throw new BackendUnavailableError("Grievance inbox");
  };
  return { create: fail, countRecentByContact: fail, list: fail, get: fail, setStatus: fail };
}

function parseContact(value: unknown, field: string): { contact: string; kind: "email" | "phone" } {
  const email = normaliseEmail(value);
  if (email) return { contact: email, kind: "email" };
  const phone = normaliseIndianMobile(value);
  if (phone) return { contact: phone, kind: "phone" };
  throw new ValidationError(`${field}: enter a valid email or 10-digit mobile number.`);
}

export function parsePrivacyRequest(body: unknown): PrivacyRequestInput {
  const input = asObject(body);
  rejectUnknownFields(input, ["type", "name", "contact", "orderNumber", "details", "nomineeName", "nomineeContact", "declaration"]);
  if (input.declaration !== true) {
    throw new ValidationError("Please confirm the request is about your own data (or that you are authorised).");
  }
  const type = input.type;
  if (typeof type !== "string" || !Object.hasOwn(REQUEST_TYPES, type)) throw new ValidationError("Choose a request type.");

  const name = cleanText(input.name, "Name", { min: 2, max: 100 });
  const { contact, kind } = parseContact(input.contact, "Contact");
  const details = cleanText(input.details, "Details", { min: 10, max: 2000, multiline: true });

  let orderNumber: string | null = null;
  if (input.orderNumber !== undefined && input.orderNumber !== "") {
    const raw = cleanText(input.orderNumber, "Order number", { max: 40 });
    if (!/^[A-Za-z0-9#-]{1,40}$/.test(raw)) throw new ValidationError("Order number has invalid characters.");
    orderNumber = raw;
  }

  let nominee: PrivacyRequestInput["nominee"] = null;
  if (type === "nomination") {
    const nomineeName = cleanText(input.nomineeName, "Nominee name", { min: 2, max: 100 });
    const { contact: nomineeContact } = parseContact(input.nomineeContact, "Nominee contact");
    nominee = { name: nomineeName, contact: nomineeContact };
  }

  return { type: type as RequestType, name, contact, contactKind: kind, orderNumber, details, nominee };
}

/** Per-contact cap on top of the per-IP route limit, so one address can't flood the inbox. */
export const MAX_REQUESTS_PER_CONTACT_PER_DAY = 3;

export async function submitPrivacyRequest(inbox: GrievanceInbox, input: PrivacyRequestInput, now = new Date()) {
  const recent = await inbox.countRecentByContact(input.contact, 86_400_000, now);
  if (recent >= MAX_REQUESTS_PER_CONTACT_PER_DAY) {
    throw new ValidationError("We already have requests from this contact today. We'll reply to those first.");
  }
  return inbox.create(input, now);
}
