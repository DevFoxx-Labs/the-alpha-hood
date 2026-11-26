/**
 * Security event log (secure-development §12). Structured, one line per event, never secrets, OTPs, tokens
 * or full phone numbers — identifiers are masked. Ships to the log drain / Sentry once configured.
 */
export type SecurityEvent =
  | "otp_sent"
  | "otp_send_limited"
  | "otp_verify_failed"
  | "otp_locked"
  | "login"
  | "payment_signature_invalid"
  | "payment_amount_mismatch"
  | "payment_late_success"
  | "order_placed"
  | "cod_blocked"
  | "referral_refused"
  | "rate_limit_store_error"
  | "admin_reset_code_requested"
  | "admin_password_reset"
  | "human_check_failed"
  | "human_check_unavailable"
  | "sms_provider_changed"
  | "sms_provider_test";

export function maskPhone(phone: string): string {
  return phone.length > 4 ? `${"*".repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}` : "****";
}

export function securityEvent(event: SecurityEvent, data: Record<string, string | number | boolean | null | undefined> = {}) {
  if (process.env.NODE_ENV === "test") return;
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    safe[k] = typeof v === "string" ? v.replace(/[\r\n]/g, " ").slice(0, 120) : v;
  }
  console.warn(JSON.stringify({ type: "security", event, at: new Date().toISOString(), ...safe }));
}
