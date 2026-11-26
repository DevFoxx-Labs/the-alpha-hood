import type { CustomerStore } from "@/lib/customers/store";
import { type ChannelResult, type ClaimedMessage, type DeliveryOutcome, isMarketing, type OutboxStore } from "./outbox";
import { securityPolicy } from "@/lib/security/policy";
import { type EmailAdapter, EmailError } from "./email";
import { renderEmail } from "./email-templates";
import { SMS_PHONE_RE, SMS_VARIABLES, type SmsAdapter, SmsError, type SmsTemplate, templateVars } from "./sms";
import { allows } from "./switches";

/**
 * Notification delivery worker (run by the cron sweep). Takes due messages from the outbox exclusively (atomic claim),
 * sends what can be sent and records a result per channel:
 * - SMS: transactional templates only (marketing is never sent by SMS), only with an owner-configured DLT template,
 *   to the customer's CURRENT verified phone (looked up now — the outbox never stores phone numbers; an erased
 *   account has none). Variables are the template's allow-list only.
 * - Email: the fixed plain-text template for the message (lib/notify/email-templates.ts), to the customer's CURRENT
 *   email — only a verified one while Settings → Security asks for that — through the live email provider.
 * - Both: re-checked against the owner's notification switches at send time, so switching a channel off also
 *   stops what is already queued (`skipped`).
 * - WhatsApp: `no_provider` until a provider exists.
 * A temporary failure (timeout, 5xx, rate limit) is retried with back-off up to MAX_ATTEMPTS; a permanent one is
 * recorded as failed. Never logs phone numbers or message contents.
 */
export const MAX_ATTEMPTS = 5;
const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];

export interface DeliveryDeps {
  outbox: OutboxStore;
  sms: SmsAdapter;
  /** Optional so older callers keep working; without it email stays `no_provider`. */
  email?: EmailAdapter;
  customers: Pick<CustomerStore, "get">;
  env?: Record<string, string | undefined>;
}

export interface DeliveryReport {
  claimed: number;
  sent: number;
  retry: number;
  failed: number;
}

async function deliverEmail(deps: DeliveryDeps, m: ClaimedMessage): Promise<ChannelResult | "retry"> {
  if (!allows(m.template, "email")) return "skipped";
  if (!deps.email?.enabled) return "no_provider";
  const customer = await deps.customers.get(m.customerId);
  if (!customer?.email) return "skipped";
  if (securityPolicy(deps.env).requireVerifiedEmail && !customer.emailVerified) return "skipped";
  let message;
  try {
    message = renderEmail(m.template, m.refs, customer.email);
  } catch {
    return "failed";
  }
  try {
    await deps.email.send(message);
    return "sent";
  } catch (e) {
    return e instanceof EmailError && e.code !== "unavailable" ? "failed" : "retry";
  }
}

async function deliverOne(deps: DeliveryDeps, m: ClaimedMessage): Promise<DeliveryOutcome> {
  const results: Partial<Record<string, ChannelResult>> = { ...m.results };
  let retry = false;
  for (const channel of m.channels) {
    if (results[channel] === "sent") continue; // a retry never re-sends what already went out
    if (channel === "email") {
      const r = await deliverEmail(deps, m);
      if (r === "retry") retry = true;
      else results.email = r;
      continue;
    }
    if (channel !== "sms") {
      results[channel] = "no_provider";
      continue;
    }
    const template = m.template as SmsTemplate;
    if (isMarketing(m.template) || !(template in SMS_VARIABLES) || !allows(m.template, "sms") || !deps.sms.supports(template)) {
      results.sms = "skipped";
      continue;
    }
    const customer = await deps.customers.get(m.customerId);
    if (!customer || !SMS_PHONE_RE.test(customer.phone)) {
      results.sms = "skipped";
      continue;
    }
    try {
      await deps.sms.send(customer.phone, template, templateVars(template, m.refs));
      results.sms = "sent";
    } catch (e) {
      if (e instanceof SmsError && !e.retryable) results.sms = "failed";
      else retry = true;
    }
  }
  const attempt = m.attempts + 1;
  if (retry && attempt < MAX_ATTEMPTS) {
    return { status: "queued", results: results as DeliveryOutcome["results"], nextAttemptAt: Date.now() + BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)] };
  }
  if (retry) for (const ch of m.channels) if (ch !== "whatsapp" && results[ch] === undefined) results[ch] = "failed";
  const anyFailed = Object.values(results).includes("failed");
  return { status: anyFailed ? "failed" : "done", results: results as DeliveryOutcome["results"] };
}

export async function deliverOutbox(deps: DeliveryDeps, now = Date.now(), limit = 50): Promise<DeliveryReport> {
  const batch = await deps.outbox.claim(limit, now);
  const report: DeliveryReport = { claimed: batch.length, sent: 0, retry: 0, failed: 0 };
  for (const m of batch) {
    let outcome: DeliveryOutcome;
    try {
      outcome = await deliverOne(deps, m);
    } catch {
      outcome = { status: "queued", results: m.results, nextAttemptAt: now + BACKOFF_MS[0] };
    }
    await deps.outbox.finish(m.id, outcome, now);
    for (const ch of ["sms", "email"] as const) if (outcome.results[ch] === "sent" && m.results[ch] !== "sent") report.sent++;
    if (outcome.status === "queued") report.retry++;
    if (outcome.status === "failed") report.failed++;
  }
  return report;
}
