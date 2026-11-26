import { SMS_VARIABLES, type SmsTemplate } from "@/lib/notify/sms";

/**
 * What the owner can choose in Admin → SMS providers. Each driver talks to ONE fixed HTTPS API
 * (lib/providers/sms-gateway.ts), so no admin-typed URL is ever fetched. The specs drive both the server
 * validation and the form.
 *
 * India needs DLT: the sender ID and every template must be registered with the operator (through the provider)
 * before a message is delivered, and the text sent must be exactly the approved template with its variables
 * filled in. So this store never sends free text — a message type is sent only when its template ID is entered.
 */
export type SmsDriver = "msg91" | "fast2sms" | "twofactor";

/** Characters allowed in keys and template ids (some go into an API URL path). */
const TOKEN = /^[A-Za-z0-9_-]{1,64}$/;

export interface SmsDriverSpec {
  label: string;
  help: string;
  credentials: Record<string, { label: string; pattern: RegExp }>;
  sender: { label: string; pattern: RegExp; required: boolean } | null;
  otpTemplate: { label: string; pattern: RegExp; required: boolean; hint: string };
  /** null = this provider sends sign-in codes only. */
  messageTemplates: { pattern: RegExp; hint: string } | null;
}

export const SMS_DRIVERS: Record<SmsDriver, SmsDriverSpec> = {
  msg91: {
    label: "MSG91",
    help: "Use the Auth Key from MSG91 → API. The OTP template must contain the ##OTP## variable. Each order message needs its own approved Flow template whose variables are named exactly as listed below.",
    credentials: { auth_key: { label: "Auth key", pattern: /^[A-Za-z0-9]{10,64}$/ } },
    sender: { label: "Sender ID (6 letters, DLT approved)", pattern: /^[A-Z]{6}$/, required: true },
    otpTemplate: { label: "OTP template ID", pattern: TOKEN, required: true, hint: "From MSG91 → OTP → Templates." },
    messageTemplates: { pattern: TOKEN, hint: "Flow template ID from MSG91 → SMS → Templates." },
  },
  fast2sms: {
    label: "Fast2SMS",
    help: "Use the API key from Fast2SMS → Dev API, and the DLT sender ID and message IDs approved in Fast2SMS → DLT. Each template's {#var#} placeholders must be in the order listed below.",
    credentials: { api_key: { label: "API key", pattern: /^[A-Za-z0-9]{10,128}$/ } },
    sender: { label: "DLT sender ID (6 letters)", pattern: /^[A-Z]{6}$/, required: true },
    otpTemplate: { label: "DLT message ID for sign-in codes", pattern: /^\d{1,12}$/, required: true, hint: "The template text must have one {#var#} for the code." },
    messageTemplates: { pattern: /^\d{1,12}$/, hint: "DLT message ID." },
  },
  twofactor: {
    label: "2Factor.in",
    help: "Use the API key from 2Factor.in. Sends sign-in codes only — order updates need MSG91 or Fast2SMS.",
    credentials: { api_key: { label: "API key", pattern: /^[A-Za-z0-9-]{20,64}$/ } },
    sender: null,
    otpTemplate: { label: "OTP template name (optional)", pattern: TOKEN, required: false, hint: "Your DLT-approved template name in 2Factor. Blank = the default template." },
    messageTemplates: null,
  },
};

export const isSmsDriver = (v: unknown): v is SmsDriver => typeof v === "string" && Object.hasOwn(SMS_DRIVERS, v);

/** Every message type other than the sign-in code, with the variables its template must carry (in this order). */
export const MESSAGE_TEMPLATES = (Object.keys(SMS_VARIABLES) as SmsTemplate[]).filter((t) => t !== "otp");

const LABELS: Partial<Record<SmsTemplate, string>> = {
  order_confirmed: "Order confirmed",
  order_packed: "Order packed",
  order_shipped: "Order shipped",
  order_out_for_delivery: "Out for delivery",
  order_delivered: "Order delivered",
  order_cancelled: "Order cancelled",
  refund_initiated: "Refund started",
  return_requested: "Return requested",
  return_pickup_scheduled: "Return pickup scheduled",
  return_completed: "Return completed",
  return_rejected: "Return rejected",
  review_request: "Review request",
  back_in_stock: "Back in stock",
  price_drop: "Price drop",
};

/** Client-safe description of the catalogue (no regexes). */
export function smsCatalogPayload() {
  return {
    drivers: (Object.entries(SMS_DRIVERS) as [SmsDriver, SmsDriverSpec][]).map(([value, d]) => ({
      value,
      label: d.label,
      help: d.help,
      credentials: Object.entries(d.credentials).map(([key, c]) => ({ key, label: c.label })),
      sender: d.sender ? { label: d.sender.label, required: d.sender.required } : null,
      otpTemplate: { label: d.otpTemplate.label, required: d.otpTemplate.required, hint: d.otpTemplate.hint },
      messageTemplates: d.messageTemplates ? { hint: d.messageTemplates.hint } : null,
    })),
    templates: MESSAGE_TEMPLATES.map((key) => ({ key, label: LABELS[key] ?? key, variables: [...SMS_VARIABLES[key]] })),
  };
}
export type SmsCatalogPayload = ReturnType<typeof smsCatalogPayload>;
