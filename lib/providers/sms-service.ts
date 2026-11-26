import { randomBytes, randomInt } from "node:crypto";
import { ValidationError } from "@/lib/http/guard";
import { SmsError, type SmsTemplate } from "@/lib/notify/sms";
import { asObject, maskContact, normaliseIndianMobile, rejectUnknownFields } from "@/lib/validation";
import { isSmsDriver, MESSAGE_TEMPLATES, SMS_DRIVERS, smsCatalogPayload, type SmsCatalogPayload, type SmsDriver } from "./sms-catalog";
import { type Fetcher, gatewaySendOtp, type SmsProviderDoc } from "./sms-gateway";
import { refreshActiveSms } from "./sms-runtime";
import type { ProviderRow, ProviderStore } from "./store";

/**
 * Admin → SMS providers: the only place SMS provider rows are written.
 *
 * Whoever controls the live provider can read every sign-in code, so:
 * - keys are sealed in the database and never returned (only a masked hint);
 * - a provider goes live only after a successful test SMS;
 * - changing the live provider's connection is tested BEFORE it is saved (sign-in must keep working);
 * - at most one provider is live (transaction + UNIQUE index);
 * - the live provider can't be deleted.
 */
export const MAX_SMS_PROVIDERS = 20;

export class ProviderError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface SmsProviderView {
  id: string;
  name: string;
  driver: SmsDriver;
  driverLabel: string;
  senderId: string | null;
  otpTemplate: string | null;
  templates: Partial<Record<SmsTemplate, string>>;
  /** Masked: first 4 + last 2 characters. Never the key. */
  credentialHints: Record<string, string | null>;
  /** False when the row can't be decrypted with the current SECRET_BOX_KEY — the keys must be entered again. */
  readable: boolean;
  active: boolean;
  activatedAt: string | null;
  verified: boolean;
  lastTest: SmsProviderDoc["lastTest"];
  updatedAt: string;
}

export interface SmsProvidersPayload {
  providers: SmsProviderView[];
  catalog: SmsCatalogPayload;
  /** What sends when no provider is live. */
  fallback: "environment" | "demo" | "none";
  limits: { maxProviders: number };
}

const hint = (v: string | undefined) => (!v ? null : v.length <= 8 ? "••••" : `${v.slice(0, 4)}••••${v.slice(-2)}`);

function view(row: ProviderRow<SmsProviderDoc>): SmsProviderView {
  const d = row.doc;
  const driver: SmsDriver = d && isSmsDriver(d.driver) ? d.driver : "msg91";
  return {
    id: row.id,
    name: d?.name ?? "Unreadable provider",
    driver,
    driverLabel: SMS_DRIVERS[driver].label,
    senderId: d?.senderId ?? null,
    otpTemplate: d?.otpTemplate ?? null,
    templates: d?.templates ?? {},
    credentialHints: Object.fromEntries(Object.keys(SMS_DRIVERS[driver].credentials).map((k) => [k, hint(d?.credentials[k])])),
    readable: d !== null,
    active: row.active,
    activatedAt: d?.activatedAt ?? null,
    verified: d?.lastTest?.ok === true,
    lastTest: d?.lastTest ?? null,
    updatedAt: row.updatedAt,
  };
}

export async function smsProvidersPayload(store: ProviderStore, env: Record<string, string | undefined> = process.env): Promise<SmsProvidersPayload> {
  const rows = await store.list<SmsProviderDoc>("sms");
  return {
    providers: rows.map(view).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)),
    catalog: smsCatalogPayload(),
    fallback: env.SMS_PROVIDER ? "environment" : env.NODE_ENV !== "production" || env.ALLOW_MOCK_PAYMENTS === "true" ? "demo" : "none",
    limits: { maxProviders: MAX_SMS_PROVIDERS },
  };
}

// ── Validation ───────────────────────────────────────────────────────────────

const LINE = /^[^\r\n\u0000-\u001f]{1,80}$/;

/** Parses the form. `existing` = the row being edited: a blank key then means "keep what is stored". */
function parse(body: unknown, existing: SmsProviderDoc | null): Pick<SmsProviderDoc, "name" | "driver" | "credentials" | "senderId" | "otpTemplate" | "templates"> {
  const input = asObject(body);
  rejectUnknownFields(input, ["name", "driver", "credentials", "senderId", "otpTemplate", "templates", "code", "testTo"]);
  const errors: Record<string, string> = {};
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!LINE.test(name)) errors.name = "Enter a name (up to 80 characters).";
  if (!isSmsDriver(input.driver)) throw new ProviderError(422, "invalid_input", "Choose a provider.", { driver: "Choose a provider." });
  const driver = input.driver;
  const spec = SMS_DRIVERS[driver];

  const credsIn = input.credentials === undefined ? {} : asObject(input.credentials);
  rejectUnknownFields(credsIn, Object.keys(spec.credentials));
  const kept = existing && existing.driver === driver ? existing.credentials : {};
  const credentials: Record<string, string> = {};
  for (const [key, c] of Object.entries(spec.credentials)) {
    const raw = typeof credsIn[key] === "string" ? (credsIn[key] as string).trim() : "";
    if (raw === "") {
      if (kept[key]) credentials[key] = kept[key];
      else errors[`credentials.${key}`] = `Enter the ${c.label.toLowerCase()}.`;
    } else if (!c.pattern.test(raw)) errors[`credentials.${key}`] = `That doesn't look like a valid ${c.label.toLowerCase()}.`;
    else credentials[key] = raw;
  }

  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  let senderId: string | null = null;
  if (spec.sender) {
    const v = text(input.senderId);
    if (v === "") {
      if (spec.sender.required) errors.senderId = "Enter the sender ID.";
    } else if (!spec.sender.pattern.test(v)) errors.senderId = "Six capital letters, as approved for DLT.";
    else senderId = v;
  } else if (text(input.senderId) !== "") errors.senderId = "This provider has no sender ID.";

  let otpTemplate: string | null = null;
  const otp = text(input.otpTemplate);
  if (otp === "") {
    if (spec.otpTemplate.required) errors.otpTemplate = "Enter the template for sign-in codes.";
  } else if (!spec.otpTemplate.pattern.test(otp)) errors.otpTemplate = "That doesn't look like a valid template ID.";
  else otpTemplate = otp;

  const templates: Partial<Record<SmsTemplate, string>> = {};
  const tIn = input.templates === undefined ? {} : asObject(input.templates);
  rejectUnknownFields(tIn, MESSAGE_TEMPLATES);
  for (const key of MESSAGE_TEMPLATES) {
    const v = text(tIn[key]);
    if (v === "") continue;
    if (!spec.messageTemplates) errors[`templates.${key}`] = "This provider sends sign-in codes only.";
    else if (!spec.messageTemplates.pattern.test(v)) errors[`templates.${key}`] = "That doesn't look like a valid template ID.";
    else templates[key] = v;
  }

  if (Object.keys(errors).length) throw new ProviderError(422, "invalid_input", "Check the highlighted fields.", errors);
  return { name, driver, credentials, senderId, otpTemplate, templates };
}

/** What decides whether sign-in codes arrive. A change here needs a fresh test. */
const connection = (d: Pick<SmsProviderDoc, "driver" | "credentials" | "senderId" | "otpTemplate">) => JSON.stringify([d.driver, Object.entries(d.credentials).sort(), d.senderId, d.otpTemplate]);

async function mustGet(store: ProviderStore, id: string): Promise<ProviderRow<SmsProviderDoc>> {
  const row = /^prv_[a-f0-9]{20}$/.test(id) ? await store.get<SmsProviderDoc>("sms", id) : null;
  if (!row) throw new ProviderError(404, "not_found", "This SMS provider no longer exists.");
  return row;
}

function testNumber(to: unknown): string {
  const phone = normaliseIndianMobile(to);
  if (!phone) throw new ProviderError(422, "invalid_input", "Enter a 10-digit Indian mobile number for the test SMS.", { to: "Enter a 10-digit Indian mobile number." });
  return phone;
}

/** Sends a random code through the provider's sign-in route. Returns the text shown to the admin (no secrets). */
async function probe(doc: SmsProviderDoc, phone: string, fetcher?: Fetcher): Promise<void> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await gatewaySendOtp(doc, phone, code, fetcher);
}

export interface Deps {
  fetcher?: Fetcher;
  now?: Date;
}
export interface Change {
  provider: SmsProviderView;
  /** True when the provider that sends sign-in codes changed (activate, deactivate, live edit) — owners are alerted. */
  liveChanged: boolean;
  summary: string;
}

// ── Writes ───────────────────────────────────────────────────────────────────

export async function createSmsProvider(store: ProviderStore, body: unknown, by: string, deps: Deps = {}): Promise<Change> {
  if ((await store.list("sms")).length >= MAX_SMS_PROVIDERS) throw new ProviderError(409, "limit", `You can add up to ${MAX_SMS_PROVIDERS} SMS providers. Delete one you no longer use first.`);
  const now = deps.now ?? new Date();
  const doc: SmsProviderDoc = { ...parse(body, null), lastTest: null, activatedAt: null, createdAt: now.toISOString(), updatedBy: by };
  const id = `prv_${randomBytes(10).toString("hex")}`;
  await store.put("sms", id, doc, now);
  return { provider: view((await store.get<SmsProviderDoc>("sms", id))!), liveChanged: false, summary: `Added the SMS provider "${doc.name}".` };
}

export async function updateSmsProvider(store: ProviderStore, id: string, body: unknown, by: string, deps: Deps = {}): Promise<Change> {
  const row = await mustGet(store, id);
  const now = deps.now ?? new Date();
  const parsed = parse(body, row.doc);
  const before = row.doc;
  const changed = !before || connection(before) !== connection(parsed);
  let lastTest = before?.lastTest ?? null;
  if (changed && row.active) {
    // The live provider must keep delivering sign-in codes: prove the new settings first.
    const phone = testNumber(asObject(body).testTo);
    try {
      await probe({ ...(before as SmsProviderDoc), ...parsed }, phone, deps.fetcher);
    } catch (e) {
      throw new ProviderError(422, "test_failed", `Not saved: the live provider could not send with these settings. ${e instanceof SmsError ? e.message : "Sending failed."}`);
    }
    lastTest = { ok: true, at: now.toISOString(), message: `Test SMS sent to ${maskContact(phone)} while saving.` };
  } else if (changed) lastTest = null; // must be tested again before it can go live
  const doc: SmsProviderDoc = { ...parsed, lastTest, activatedAt: before?.activatedAt ?? null, createdAt: before?.createdAt ?? now.toISOString(), updatedBy: by };
  await store.put("sms", id, doc, now);
  if (row.active) await refreshActiveSms(store);
  return { provider: view((await store.get<SmsProviderDoc>("sms", id))!), liveChanged: changed && row.active, summary: `Updated the SMS provider "${doc.name}".` };
}

export async function testSmsProvider(store: ProviderStore, id: string, to: unknown, by: string, deps: Deps = {}): Promise<{ ok: boolean; message: string; provider: SmsProviderView }> {
  const row = await mustGet(store, id);
  if (!row.doc) throw new ProviderError(409, "unreadable", "This provider's keys can't be read. Edit it and enter them again.");
  const phone = testNumber(to);
  const now = deps.now ?? new Date();
  let result: { ok: boolean; message: string };
  try {
    await probe(row.doc, phone, deps.fetcher);
    result = { ok: true, message: `Test SMS sent to ${maskContact(phone)}. Check that it arrived.` };
  } catch (e) {
    result = { ok: false, message: `Sending failed: ${e instanceof SmsError ? e.message : "unexpected error."}` };
  }
  // A failed test on the live provider doesn't switch it off — it only records the result.
  await store.put("sms", id, { ...row.doc, lastTest: { ...result, at: now.toISOString() }, updatedBy: by }, now);
  return { ...result, provider: view((await store.get<SmsProviderDoc>("sms", id))!) };
}

export async function activateSmsProvider(store: ProviderStore, id: string, by: string, deps: Deps = {}): Promise<Change> {
  const row = await mustGet(store, id);
  if (!row.doc) throw new ProviderError(409, "unreadable", "This provider's keys can't be read. Edit it and enter them again.");
  if (row.doc.lastTest?.ok !== true) throw new ProviderError(409, "not_verified", "Send a successful test SMS with this provider before activating it.");
  if (row.active) return { provider: view(row), liveChanged: false, summary: "Already live." };
  const now = deps.now ?? new Date();
  const previous = (await store.list<SmsProviderDoc>("sms")).find((r) => r.active);
  await store.put("sms", id, { ...row.doc, activatedAt: now.toISOString(), updatedBy: by }, now);
  if (!(await store.setActive("sms", id, now))) throw new ProviderError(404, "not_found", "This SMS provider no longer exists.");
  await refreshActiveSms(store);
  return {
    provider: view((await store.get<SmsProviderDoc>("sms", id))!),
    liveChanged: true,
    summary: `Activated the SMS provider "${row.doc.name}"${previous?.doc ? ` (replacing "${previous.doc.name}")` : ""}.`,
  };
}

export async function deactivateSmsProvider(store: ProviderStore, id: string): Promise<Change> {
  const row = await mustGet(store, id);
  if (!row.active) return { provider: view(row), liveChanged: false, summary: "Already off." };
  await store.setActive("sms", null);
  await refreshActiveSms(store);
  return { provider: view((await store.get<SmsProviderDoc>("sms", id))!), liveChanged: true, summary: `Deactivated the SMS provider "${row.doc?.name ?? id}".` };
}

export async function deleteSmsProvider(store: ProviderStore, id: string): Promise<{ summary: string }> {
  const row = await mustGet(store, id);
  if (row.active || !(await store.remove("sms", id))) throw new ProviderError(409, "live", "This provider is live. Activate another one or deactivate it before deleting it.");
  return { summary: `Deleted the SMS provider "${row.doc?.name ?? id}".` };
}

export { ValidationError };
