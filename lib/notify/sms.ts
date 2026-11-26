import { mockPaymentsAllowed } from "@/lib/checkout/flags";
import { BackendUnavailableError, type Env } from "@/lib/mock-guard";
import type { Template } from "./outbox";

/**
 * SMS (OTP + order updates). India: every SMS must use a DLT-registered sender ID and a DLT-approved template, and the
 * text must match the approved template with only its variables filled in (TRAI TCCCPR). So we never send free text:
 * each message is a template id + a fixed list of variables, and a template is only sent if the owner configured its
 * provider template id (`SMS_TEMPLATES`).
 *
 * Providers implement `SmsAdapter`. The demo provider sends nothing: it hands the OTP back so the developer can see it
 * on screen, and records order messages in memory. It is refused on the live store (same rule as the demo payment
 * gateway). A real provider adapter is added once its API contract is confirmed (docs/known-gaps.md).
 */
export type SmsTemplate = "otp" | Exclude<Template, "abandoned_checkout_1h" | "abandoned_checkout_24h" | "new_device_sign_in" | "review_published" | "review_rejected" | "review_replied" | "feedback_answered">;

/** Variables each template may carry — the only values that ever leave our servers in an SMS. No names / addresses. */
export const SMS_VARIABLES: Record<SmsTemplate, readonly string[]> = {
  otp: ["otp"],
  order_confirmed: ["orderNumber"],
  order_packed: ["orderNumber"],
  order_shipped: ["orderNumber"],
  order_out_for_delivery: ["orderNumber"],
  order_delivered: ["orderNumber"],
  order_cancelled: ["orderNumber"],
  refund_initiated: ["orderNumber"],
  return_requested: ["orderNumber", "returnNumber"],
  return_pickup_scheduled: ["orderNumber", "returnNumber"],
  return_completed: ["orderNumber", "returnNumber"],
  return_rejected: ["orderNumber", "returnNumber"],
  review_request: ["orderNumber"],
  back_in_stock: ["handle", "size"],
  price_drop: ["handle"],
};

const VALUE_RE = /^[A-Za-z0-9 ._/-]{1,30}$/;

export class SmsError extends Error {
  constructor(
    public readonly code: "not_configured" | "invalid" | "rejected" | "unavailable",
    message: string,
    /** True when retrying later can help (timeouts, 5xx, rate limits). */
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "SmsError";
  }
}

export interface SmsAdapter {
  readonly name: string;
  sendOtp(phone: string, code: string): Promise<{ demoCode?: string }>;
  /** Whether a DLT template is configured for this message type (unconfigured types are skipped, not failed). */
  supports(template: SmsTemplate): boolean;
  /** Sends one templated SMS. Throws SmsError. Returns the provider's message / request id. */
  send(phone: string, template: SmsTemplate, vars: Record<string, string>): Promise<{ providerId: string }>;
}

/** `+91XXXXXXXXXX` only (customers sign in with an Indian mobile). */
export const SMS_PHONE_RE = /^\+91[6-9]\d{9}$/;

/** Builds the variable list for a template: only allowed keys, short safe values; throws SmsError("invalid"). */
export function templateVars(template: SmsTemplate, refs: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of SMS_VARIABLES[template]) {
    const v = refs[key];
    if (v === undefined) {
      if (key === "size") continue; // optional
      throw new SmsError("invalid", `Missing ${key}`, false);
    }
    if (!VALUE_RE.test(v)) throw new SmsError("invalid", `Bad ${key}`, false);
    out[key] = v;
  }
  return out;
}

/** `SMS_TEMPLATES` = JSON `{ "otp": "<provider template id>", "order_shipped": "…" }` (ids from the provider panel). */
export function readTemplateIds(env: Env): Partial<Record<SmsTemplate, string>> {
  try {
    const raw = JSON.parse(env.SMS_TEMPLATES ?? "{}") as Record<string, unknown>;
    const out: Partial<Record<SmsTemplate, string>> = {};
    for (const [k, v] of Object.entries(raw)) if (k in SMS_VARIABLES && typeof v === "string" && /^[A-Za-z0-9_-]{4,64}$/.test(v)) out[k as SmsTemplate] = v;
    return out;
  } catch {
    return {};
  }
}

/** Demo provider (dev / previews): records messages, never sends. */
export interface DemoSms extends SmsAdapter {
  sent: { phone: string; template: SmsTemplate; vars: Record<string, string> }[];
}

export function createDemoSms(): DemoSms {
  const sent: DemoSms["sent"] = [];
  let n = 0;
  return {
    name: "demo",
    sent,
    sendOtp: async (_phone, code) => ({ demoCode: code }),
    supports: (t) => t !== "otp",
    async send(phone, template, vars) {
      if (!SMS_PHONE_RE.test(phone)) throw new SmsError("invalid", "Bad phone", false);
      sent.push({ phone, template, vars });
      return { providerId: `demo_${++n}` };
    },
  };
}

const g = globalThis as unknown as { __alpha_hood_demo_sms?: DemoSms };

/**
 * Real providers, by `SMS_PROVIDER`. Each factory returns null when its configuration is incomplete (fail closed).
 * Empty until a provider's API contract is confirmed from first-party docs (docs/known-gaps.md → SMS).
 */
export const SMS_PROVIDERS: Record<string, (env: Env) => SmsAdapter | null> = {};

/**
 * The provider made live in Admin → SMS providers (lib/providers/sms-runtime.ts installs it). It wins over the
 * environment's SMS_PROVIDER. Kept on globalThis so every route bundle of this process sees the same one.
 */
const live = globalThis as unknown as { __alpha_hood_active_sms?: SmsAdapter | null };
export function setActiveSms(adapter: SmsAdapter | null): void {
  live.__alpha_hood_active_sms = adapter;
}
export const activeSms = (): SmsAdapter | null => live.__alpha_hood_active_sms ?? null;

export function resolveSms(env: Env = process.env): SmsAdapter {
  // Only for the real process environment: tests and scripts that pass their own `env` get exactly what it says.
  if (env === process.env && live.__alpha_hood_active_sms) return live.__alpha_hood_active_sms;
  const factory = env.SMS_PROVIDER ? SMS_PROVIDERS[env.SMS_PROVIDER] : undefined;
  const real = factory?.(env);
  if (real) return real;
  if (!env.SMS_PROVIDER && mockPaymentsAllowed(env)) return (g.__alpha_hood_demo_sms ??= createDemoSms());
  const fail = async (): Promise<never> => {
    throw new BackendUnavailableError("SMS");
  };
  return { name: "disabled", sendOtp: fail, supports: () => false, send: fail };
}
