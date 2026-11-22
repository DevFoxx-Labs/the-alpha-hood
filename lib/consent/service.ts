import { ValidationError } from "@/lib/http/guard";
import { noticeVersion, NOTICES } from "@/lib/legal";
import type { CookieChoice } from "./cookie";
import type { ConsentLedger, ConsentRecord } from "./ledger";
import {
  COOKIE_PURPOSES,
  type CommunicationPurpose,
  type ConsentMethod,
  type ConsentSource,
  type ConsentStatus,
  type CookiePurpose,
} from "./purposes";

/**
 * The one place consent decisions are validated and written (web routes now; mobile/API later).
 */

export interface RequestContext {
  ip: string;
  userAgent: string;
  source: ConsentSource;
}

const COOKIE_METHODS: ConsentMethod[] = ["cookie_banner", "preferences", "consent_settings"];

/** Strict allow-list parse of a cookie-choice body: `{ analytics, advertising, method }`. */
export function parseCookieChoiceInput(body: unknown): { choice: Record<CookiePurpose, boolean>; method: ConsentMethod } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ValidationError("Expected an object.");
  }
  const input = body as Record<string, unknown>;
  const allowed = new Set<string>([...COOKIE_PURPOSES, "method"]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) throw new ValidationError(`Unknown field "${key}".`);
  }
  const choice = {} as Record<CookiePurpose, boolean>;
  for (const p of COOKIE_PURPOSES) {
    if (typeof input[p] !== "boolean") throw new ValidationError(`"${p}" must be true or false.`);
    choice[p] = input[p];
  }
  const method = input.method;
  if (typeof method !== "string" || !COOKIE_METHODS.includes(method as ConsentMethod)) {
    throw new ValidationError("Invalid method.");
  }
  return { choice, method: method as ConsentMethod };
}

function latestStatus(history: ConsentRecord[], purpose: string): ConsentStatus | undefined {
  for (let i = history.length - 1; i >= 0; i--) if (history[i].purpose === purpose) return history[i].status;
  return undefined;
}

/** granted → granted; previously granted + now off → withdrawn; otherwise denied. */
export function nextStatus(previous: ConsentStatus | undefined, accepted: boolean): ConsentStatus {
  if (accepted) return "granted";
  return previous === "granted" ? "withdrawn" : "denied";
}

/**
 * Records one ledger row per offered cookie purpose — every banner/preferences decision, even unchanged.
 * Purposes whose tracker isn't configured can't be granted (forced off).
 */
export async function recordCookieChoice(
  ledger: ConsentLedger,
  input: {
    visitorId: string;
    choice: Record<CookiePurpose, boolean>;
    method: ConsentMethod;
    activePurposes: CookiePurpose[];
    ctx: RequestContext;
    now?: Date;
  },
): Promise<{ choice: CookieChoice; records: ConsentRecord[] }> {
  const { visitorId, method, activePurposes, ctx, now = new Date() } = input;
  const effective = {} as Record<CookiePurpose, boolean>;
  for (const p of COOKIE_PURPOSES) effective[p] = activePurposes.includes(p) && input.choice[p];

  const history = await ledger.listByVisitor(visitorId);
  const version = noticeVersion(["cookies", "privacy"]);
  const records = await ledger.append(
    activePurposes.map((purpose) => ({
      user_id: null,
      visitor_id: visitorId,
      subscriber_id: null,
      purpose,
      status: nextStatus(latestStatus(history, purpose), effective[purpose]),
      method,
      source: ctx.source,
      notice_version: version,
      ip_address: ctx.ip,
      user_agent: ctx.userAgent,
    })),
    now,
  );

  return {
    choice: { ...effective, version: NOTICES.cookies.version, decidedAt: Math.floor(now.getTime() / 1000) },
    records,
  };
}

/** Opt-in to offers from a form checkbox (newsletter). The checkbox must have been ticked by the user. */
export async function recordCommunicationConsent(
  ledger: ConsentLedger,
  input: {
    purpose: CommunicationPurpose;
    subscriberId: string;
    visitorId: string | null;
    userId?: string | null;
    status: ConsentStatus;
    method: ConsentMethod;
    ctx: RequestContext;
    now?: Date;
  },
): Promise<ConsentRecord> {
  const [record] = await ledger.append(
    [
      {
        user_id: input.userId ?? null,
        visitor_id: input.visitorId,
        subscriber_id: input.subscriberId,
        purpose: input.purpose,
        status: input.status,
        method: input.method,
        source: input.ctx.source,
        notice_version: noticeVersion(["privacy"]),
        ip_address: input.ctx.ip,
        user_agent: input.ctx.userAgent,
      },
    ],
    input.now,
  );
  return record;
}

/** What the visitor sees on "Your consents" — no IP / user agent echoed back. */
export function publicHistory(records: ConsentRecord[]) {
  return records.map((r) => ({
    purpose: r.purpose,
    status: r.status,
    method: r.method,
    source: r.source,
    notice_version: r.notice_version,
    created_at: r.created_at,
  }));
}

/**
 * Required consent at account creation (DPDP rule §2–3): one-tap OTP sign-up shows "By continuing you agree
 * to the Terms and Privacy Notice" next to the button; this records it with the notice versions shown.
 */
export async function recordAccountConsent(
  ledger: ConsentLedger,
  input: { userId: string; visitorId: string | null; ctx: RequestContext; now?: Date },
): Promise<ConsentRecord> {
  const [record] = await ledger.append(
    [
      {
        user_id: input.userId,
        visitor_id: input.visitorId,
        subscriber_id: null,
        purpose: "terms_privacy",
        status: "granted",
        method: "signup_notice",
        source: input.ctx.source,
        notice_version: noticeVersion(["terms", "privacy"]),
        ip_address: input.ctx.ip,
        user_agent: input.ctx.userAgent,
      },
    ],
    input.now,
  );
  return record;
}
