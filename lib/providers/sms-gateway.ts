import { type SmsAdapter, SmsError, SMS_PHONE_RE, SMS_VARIABLES, type SmsTemplate, templateVars } from "@/lib/notify/sms";
import { type SmsDriver, SMS_DRIVERS } from "./sms-catalog";

/**
 * Sends one SMS through one provider's fixed HTTPS API. Every driver has its own host here, so an admin can't
 * point the server at an internal address (no SSRF); redirects are refused; every call has a timeout; and errors
 * are scrubbed of the provider's keys before anyone sees them.
 *
 * Request shapes follow the working gateway of the owner's AstroGaon app (app/Support/Sms/SmsGateway.php).
 * The first real send must be confirmed with "Send test SMS" before a provider can go live.
 */
export interface SmsProviderDoc {
  name: string;
  driver: SmsDriver;
  credentials: Record<string, string>;
  senderId: string | null;
  otpTemplate: string | null;
  /** Provider template id per message type; a type without one is simply not sent by SMS. */
  templates: Partial<Record<SmsTemplate, string>>;
  lastTest: { ok: boolean; at: string; message: string } | null;
  activatedAt: string | null;
  createdAt: string;
  updatedBy: string;
}

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

const TIMEOUT_MS = 10_000;
/** `+91XXXXXXXXXX` → `91XXXXXXXXXX` / `XXXXXXXXXX`. */
const digits = (phone: string) => phone.slice(1);
const local = (phone: string) => phone.slice(3);

function scrub(message: string, doc: SmsProviderDoc): string {
  let out = message;
  for (const secret of Object.values(doc.credentials)) {
    if (secret) out = out.split(secret).join("••••").split(encodeURIComponent(secret)).join("••••");
  }
  return out.replace(/[\r\n]+/g, " ").slice(0, 300);
}

async function call(doc: SmsProviderDoc, fetcher: Fetcher, url: string, init: RequestInit): Promise<string> {
  const label = SMS_DRIVERS[doc.driver].label;
  let res: Response;
  try {
    res = await fetcher(url, { ...init, redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: "application/json", ...(init.headers as Record<string, string> | undefined) } });
  } catch {
    throw new SmsError("unavailable", `Could not reach ${label}. Check the connection and try again.`, true);
  }
  const text = (await res.text().catch(() => "")).slice(0, 2_000);
  let json: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) json = parsed as Record<string, unknown>;
  } catch {
    // some error bodies are plain text
  }
  // Some providers answer 200 with an error body.
  const failed = !res.ok || (json !== null && (json.type === "error" || json.return === false || json.Status === "Error"));
  if (!failed) return String(json?.request_id ?? json?.Details ?? json?.message ?? "sent").slice(0, 80);
  const raw = json?.message ?? json?.Details ?? json?.error ?? "";
  const detail = Array.isArray(raw) ? raw.map(String).join(" ") : typeof raw === "string" ? raw : "";
  const retryable = res.status >= 500 || res.status === 429;
  throw new SmsError(retryable ? "unavailable" : "rejected", scrub(`${label} refused the message (HTTP ${res.status})${detail ? `: ${detail}` : "."}`, doc), retryable);
}

const json = (body: unknown, headers: Record<string, string>): RequestInit => ({ method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

export async function gatewaySendOtp(doc: SmsProviderDoc, phone: string, code: string, fetcher: Fetcher = fetch): Promise<string> {
  if (!SMS_PHONE_RE.test(phone) || !/^\d{4,8}$/.test(code)) throw new SmsError("invalid", "Bad phone or code", false);
  switch (doc.driver) {
    case "msg91": {
      const q = new URLSearchParams({ template_id: doc.otpTemplate ?? "", mobile: digits(phone), otp: code });
      return call(doc, fetcher, `https://control.msg91.com/api/v5/otp?${q}`, { method: "POST", headers: { authkey: doc.credentials.auth_key ?? "" } });
    }
    case "fast2sms":
      return fast2sms(doc, fetcher, phone, doc.otpTemplate ?? "", [code]);
    case "twofactor": {
      const path = [doc.credentials.api_key ?? "", "SMS", digits(phone), code, ...(doc.otpTemplate ? [doc.otpTemplate] : [])].map(encodeURIComponent).join("/");
      return call(doc, fetcher, `https://2factor.in/API/V1/${path}`, { method: "GET" });
    }
  }
}

export async function gatewaySend(doc: SmsProviderDoc, phone: string, template: SmsTemplate, vars: Record<string, string>, fetcher: Fetcher = fetch): Promise<string> {
  if (!SMS_PHONE_RE.test(phone)) throw new SmsError("invalid", "Bad phone", false);
  const id = template === "otp" ? undefined : doc.templates[template];
  if (!id) throw new SmsError("not_configured", `No template is set for ${template}.`, false);
  const safe = templateVars(template, vars); // only the allowed variables, short safe values
  switch (doc.driver) {
    case "msg91":
      return call(doc, fetcher, "https://control.msg91.com/api/v5/flow", json({ template_id: id, short_url: "0", recipients: [{ mobiles: digits(phone), ...safe }] }, { authkey: doc.credentials.auth_key ?? "" }));
    case "fast2sms":
      return fast2sms(doc, fetcher, phone, id, SMS_VARIABLES[template].map((k) => safe[k] ?? ""));
    case "twofactor":
      throw new SmsError("not_configured", "This provider sends sign-in codes only.", false);
  }
}

function fast2sms(doc: SmsProviderDoc, fetcher: Fetcher, phone: string, messageId: string, values: string[]): Promise<string> {
  return call(
    doc,
    fetcher,
    "https://www.fast2sms.com/dev/bulkV2",
    json({ route: "dlt", sender_id: doc.senderId, message: messageId, variables_values: `${values.map((v) => v.replace(/\|/g, " ")).join("|")}|`, numbers: local(phone), flash: 0 }, { authorization: doc.credentials.api_key ?? "" }),
  );
}

/** The live provider as the adapter the rest of the store already uses (lib/notify/sms.ts). */
export function smsAdapterFor(doc: SmsProviderDoc, fetcher: Fetcher = fetch): SmsAdapter {
  return {
    name: doc.driver,
    async sendOtp(phone, code) {
      await gatewaySendOtp(doc, phone, code, fetcher);
      return {};
    },
    supports: (template) => template !== "otp" && !!doc.templates[template] && SMS_DRIVERS[doc.driver].messageTemplates !== null,
    async send(phone, template, vars) {
      return { providerId: await gatewaySend(doc, phone, template, vars, fetcher) };
    },
  };
}
