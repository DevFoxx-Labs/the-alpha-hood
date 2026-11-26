import { randomBytes } from "node:crypto";
import { EmailError } from "@/lib/notify/email";
import { asObject, maskContact, normaliseEmail, rejectUnknownFields } from "@/lib/validation";
import { emailCatalogPayload, type EmailCatalogPayload, SMTP_ENCRYPTIONS, SMTP_PORTS, type SmtpEncryption } from "./email-catalog";
import { refreshActiveEmail } from "./email-runtime";
import { type EmailProviderDoc, type SendDeps, sendThrough } from "./email-transport";
import { ProviderError } from "./errors";
import type { Change } from "./http";
import { HOSTNAME_RE, publicAddress, UnsafeHostError } from "./net-guard";
import type { ProviderRow, ProviderStore } from "./store";

/**
 * Admin → Email providers: the only place email provider rows are written. Same rules as AstroGaon's
 * MailProviderService, because whoever controls the live provider can read every staff password-reset email:
 * - username and password sealed in the database and never returned (only a masked username);
 * - a provider goes live only after a successful test email;
 * - changing the live provider's connection is tested BEFORE it is saved;
 * - at most one provider is live (transaction + UNIQUE index); the live one can't be deleted;
 * - the host must resolve to public addresses only (checked on save and on every send).
 */
export const MAX_EMAIL_PROVIDERS = 20;

export interface EmailProviderView {
  id: string;
  name: string;
  host: string;
  port: number;
  encryption: SmtpEncryption;
  fromAddress: string;
  fromName: string;
  replyTo: string | null;
  usernameHint: string | null;
  passwordSet: boolean;
  readable: boolean;
  active: boolean;
  activatedAt: string | null;
  verified: boolean;
  lastTest: EmailProviderDoc["lastTest"];
  updatedAt: string;
}

export interface EmailProvidersPayload {
  providers: EmailProviderView[];
  catalog: EmailCatalogPayload;
  fallback: "environment" | "demo" | "none";
  limits: { maxProviders: number };
}

const maskUser = (u: string) => (u.length <= 4 ? "••••" : `${u.slice(0, 2)}${"•".repeat(Math.min(8, u.length - 4))}${u.slice(-2)}`);

function view(row: ProviderRow<EmailProviderDoc>): EmailProviderView {
  const d = row.doc;
  return {
    id: row.id,
    name: d?.name ?? "Unreadable provider",
    host: d?.host ?? "",
    port: d?.port ?? 587,
    encryption: d?.encryption ?? "tls",
    fromAddress: d?.fromAddress ?? "",
    fromName: d?.fromName ?? "",
    replyTo: d?.replyTo ?? null,
    usernameHint: d?.username ? maskUser(d.username) : null,
    passwordSet: !!d?.password,
    readable: d !== null,
    active: row.active,
    activatedAt: d?.activatedAt ?? null,
    verified: d?.lastTest?.ok === true,
    lastTest: d?.lastTest ?? null,
    updatedAt: row.updatedAt,
  };
}

export async function emailProvidersPayload(store: ProviderStore, env: Record<string, string | undefined> = process.env): Promise<EmailProvidersPayload> {
  const rows = await store.list<EmailProviderDoc>("email");
  return {
    providers: rows.map(view).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)),
    catalog: emailCatalogPayload(),
    fallback: env.EMAIL_PROVIDER ? "environment" : env.NODE_ENV !== "production" || env.ALLOW_MOCK_PAYMENTS === "true" ? "demo" : "none",
    limits: { maxProviders: MAX_EMAIL_PROVIDERS },
  };
}

const LINE = /^[^\r\n\u0000-\u001f]{1,120}$/;
type Parsed = Pick<EmailProviderDoc, "name" | "host" | "port" | "encryption" | "username" | "password" | "fromAddress" | "fromName" | "replyTo">;

/** Parses the form. Blank username / password on an edit = keep what is stored. */
function parse(body: unknown, existing: EmailProviderDoc | null): Parsed {
  const input = asObject(body);
  rejectUnknownFields(input, ["name", "host", "port", "encryption", "username", "password", "fromAddress", "fromName", "replyTo", "code", "testTo"]);
  const errors: Record<string, string> = {};
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  const name = text(input.name);
  if (!LINE.test(name) || name.length > 80) errors.name = "Enter a name (up to 80 characters).";
  const host = text(input.host).toLowerCase();
  if (!HOSTNAME_RE.test(host)) errors.host = "Enter the SMTP host name, like smtp.example.com.";
  const port = typeof input.port === "number" ? input.port : Number(text(input.port));
  if (!(SMTP_PORTS as readonly number[]).includes(port)) errors.port = `Choose port ${SMTP_PORTS.join(", ")}.`;
  const encryption = text(input.encryption) as SmtpEncryption;
  if (!SMTP_ENCRYPTIONS.includes(encryption)) errors.encryption = "Choose STARTTLS or SSL/TLS.";

  const keep = existing !== null;
  const username = text(input.username) || (keep ? existing.username : "");
  const password = typeof input.password === "string" && input.password !== "" ? input.password : keep ? existing.password : "";
  if (!username || !LINE.test(username) || username.length > 255) errors.username = "Enter the SMTP username.";
  if (!password || password.length > 1000 || /[\r\n]/.test(password)) errors.password = "Enter the SMTP password.";

  const fromAddress = normaliseEmail(input.fromAddress);
  if (!fromAddress) errors.fromAddress = "Enter the address emails are sent from.";
  const fromName = text(input.fromName);
  if (!LINE.test(fromName) || /[<>"]/.test(fromName)) errors.fromName = "Enter a sender name without < > or quotes.";
  let replyTo: string | null = null;
  if (text(input.replyTo) !== "") {
    replyTo = normaliseEmail(input.replyTo);
    if (!replyTo) errors.replyTo = "Enter a valid reply-to address or leave it empty.";
  }
  if (Object.keys(errors).length) throw new ProviderError(422, "invalid_input", "Check the highlighted fields.", errors);
  return { name, host, port, encryption, username, password, fromAddress: fromAddress!, fromName, replyTo };
}

const connection = (d: Pick<EmailProviderDoc, "host" | "port" | "encryption" | "username" | "password" | "fromAddress">) => JSON.stringify([d.host, d.port, d.encryption, d.username, d.password, d.fromAddress]);

async function assertPublic(host: string, deps: SendDeps): Promise<void> {
  try {
    await publicAddress(host, deps.resolve);
  } catch (e) {
    throw new ProviderError(422, "invalid_input", e instanceof UnsafeHostError ? e.message : "The host could not be checked.", { host: e instanceof Error ? e.message : "Check the host." });
  }
}

async function mustGet(store: ProviderStore, id: string): Promise<ProviderRow<EmailProviderDoc>> {
  const row = /^prv_[a-f0-9]{20}$/.test(id) ? await store.get<EmailProviderDoc>("email", id) : null;
  if (!row) throw new ProviderError(404, "not_found", "This email provider no longer exists.");
  return row;
}

function recipient(to: unknown, fallback: string): string {
  const email = to === undefined || to === "" ? normaliseEmail(fallback) : normaliseEmail(to);
  if (!email) throw new ProviderError(422, "invalid_input", "Enter an email address for the test email.", { to: "Enter a valid email address." });
  return email;
}

function probe(doc: EmailProviderDoc, to: string, deps: SendDeps) {
  return sendThrough(doc, {
    to,
    subject: "Test email from The Alpha Hood",
    text: [`This is a test email from Admin → Email providers.`, `Provider: "${doc.name}", sending as ${doc.fromAddress}.`, "If you can read this, the provider works and can be made live."].join("\n\n"),
  }, deps);
}

export interface EmailDeps extends SendDeps {
  now?: Date;
}

export async function createEmailProvider(store: ProviderStore, body: unknown, by: string, deps: EmailDeps = {}): Promise<Change & { provider: EmailProviderView }> {
  if ((await store.list("email")).length >= MAX_EMAIL_PROVIDERS) throw new ProviderError(409, "limit", `You can add up to ${MAX_EMAIL_PROVIDERS} email providers. Delete one you no longer use first.`);
  const parsed = parse(body, null);
  await assertPublic(parsed.host, deps);
  const now = deps.now ?? new Date();
  const doc: EmailProviderDoc = { ...parsed, lastTest: null, activatedAt: null, createdAt: now.toISOString(), updatedBy: by };
  const id = `prv_${randomBytes(10).toString("hex")}`;
  await store.put("email", id, doc, now);
  return { provider: view((await store.get<EmailProviderDoc>("email", id))!), liveChanged: false, summary: `Added the email provider "${doc.name}".` };
}

export async function updateEmailProvider(store: ProviderStore, id: string, body: unknown, by: string, staffEmail: string, deps: EmailDeps = {}): Promise<Change & { provider: EmailProviderView }> {
  const row = await mustGet(store, id);
  const before = row.doc;
  const parsed = parse(body, before);
  await assertPublic(parsed.host, deps);
  const now = deps.now ?? new Date();
  const changed = !before || connection(before) !== connection(parsed);
  let lastTest = before?.lastTest ?? null;
  if (changed && row.active) {
    // The live provider must keep delivering staff reset codes: prove the new settings first.
    const to = recipient(asObject(body).testTo, staffEmail);
    try {
      await probe({ ...(before as EmailProviderDoc), ...parsed }, to, deps);
    } catch (e) {
      throw new ProviderError(422, "test_failed", `Not saved: the live provider could not send with these settings. ${e instanceof EmailError ? e.message : "Sending failed."}`);
    }
    lastTest = { ok: true, at: now.toISOString(), message: `Test email sent to ${maskContact(to)} while saving.` };
  } else if (changed) lastTest = null;
  const doc: EmailProviderDoc = { ...parsed, lastTest, activatedAt: before?.activatedAt ?? null, createdAt: before?.createdAt ?? now.toISOString(), updatedBy: by };
  await store.put("email", id, doc, now);
  if (row.active) await refreshActiveEmail(store);
  return { provider: view((await store.get<EmailProviderDoc>("email", id))!), liveChanged: changed && row.active, summary: `Updated the email provider "${doc.name}".` };
}

export async function testEmailProvider(store: ProviderStore, id: string, to: unknown, by: string, staffEmail: string, deps: EmailDeps = {}) {
  const row = await mustGet(store, id);
  if (!row.doc) throw new ProviderError(409, "unreadable", "This provider's password can't be read. Edit it and enter it again.");
  const target = recipient(to, staffEmail);
  const now = deps.now ?? new Date();
  let result: { ok: boolean; message: string };
  try {
    await probe(row.doc, target, deps);
    result = { ok: true, message: `Test email sent to ${maskContact(target)}. Check the inbox (and the spam folder).` };
  } catch (e) {
    result = { ok: false, message: `Sending failed: ${e instanceof EmailError ? e.message : "unexpected error."}` };
  }
  await store.put("email", id, { ...row.doc, lastTest: { ...result, at: now.toISOString() }, updatedBy: by }, now);
  return { ...result, provider: view((await store.get<EmailProviderDoc>("email", id))!) };
}

export async function activateEmailProvider(store: ProviderStore, id: string, by: string, deps: EmailDeps = {}): Promise<Change & { provider: EmailProviderView }> {
  const row = await mustGet(store, id);
  if (!row.doc) throw new ProviderError(409, "unreadable", "This provider's password can't be read. Edit it and enter it again.");
  if (row.doc.lastTest?.ok !== true) throw new ProviderError(409, "not_verified", "Send a successful test email with this provider before making it live.");
  if (row.active) return { provider: view(row), liveChanged: false, summary: "Already live." };
  const now = deps.now ?? new Date();
  const previous = (await store.list<EmailProviderDoc>("email")).find((r) => r.active);
  await store.put("email", id, { ...row.doc, activatedAt: now.toISOString(), updatedBy: by }, now);
  if (!(await store.setActive("email", id, now))) throw new ProviderError(404, "not_found", "This email provider no longer exists.");
  await refreshActiveEmail(store);
  return { provider: view((await store.get<EmailProviderDoc>("email", id))!), liveChanged: true, summary: `Activated the email provider "${row.doc.name}"${previous?.doc ? ` (replacing "${previous.doc.name}")` : ""}.` };
}

export async function deactivateEmailProvider(store: ProviderStore, id: string): Promise<Change & { provider: EmailProviderView }> {
  const row = await mustGet(store, id);
  if (!row.active) return { provider: view(row), liveChanged: false, summary: "Already off." };
  await store.setActive("email", null);
  await refreshActiveEmail(store);
  return { provider: view((await store.get<EmailProviderDoc>("email", id))!), liveChanged: true, summary: `Deactivated the email provider "${row.doc?.name ?? id}".` };
}

export async function deleteEmailProvider(store: ProviderStore, id: string): Promise<{ summary: string }> {
  const row = await mustGet(store, id);
  if (row.active || !(await store.remove("email", id))) throw new ProviderError(409, "live", "This provider is live. Make another one live or deactivate it before deleting it.");
  return { summary: `Deleted the email provider "${row.doc?.name ?? id}".` };
}
