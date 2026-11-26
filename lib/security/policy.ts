import type { Env } from "@/lib/mock-guard";

/**
 * Security policy from Admin → Settings → Security (lib/settings/catalog.ts), read at call time with safe bounds.
 * A missing or out-of-range value falls back to the default, and never to something weaker than the floor:
 * a typo can't turn a 30-minute idle timeout into a week.
 *
 * Not switchable, on purpose: staff two-step verification (password + authenticator code) is always required,
 * and customers always sign in with a one-time code to their verified mobile.
 */
function int(raw: string | undefined, def: number, min: number, max: number): number {
  const n = raw === undefined || raw.trim() === "" ? NaN : Number(raw);
  return Number.isInteger(n) && n >= min && n <= max ? n : def;
}
const on = (raw: string | undefined, def: boolean) => (raw === undefined || raw === "" ? def : raw === "true");

export const POLICY_BOUNDS = {
  staffIdleMinutes: { def: 30, min: 5, max: 120 },
  staffSessionHours: { def: 12, min: 1, max: 24 },
  customerSessionDays: { def: 30, min: 1, max: 90 },
} as const;

export interface SecurityPolicy {
  staffIdleMs: number;
  staffSessionMs: number;
  customerSessionMs: number;
  /** Order and account emails go only to addresses the customer has confirmed with a code. */
  requireVerifiedEmail: boolean;
  newDeviceAlertStaff: boolean;
  newDeviceAlertCustomers: boolean;
}

export function securityPolicy(env: Env = process.env): SecurityPolicy {
  const b = POLICY_BOUNDS;
  return {
    staffIdleMs: int(env.STAFF_SESSION_IDLE_MINUTES, b.staffIdleMinutes.def, b.staffIdleMinutes.min, b.staffIdleMinutes.max) * 60_000,
    staffSessionMs: int(env.STAFF_SESSION_HOURS, b.staffSessionHours.def, b.staffSessionHours.min, b.staffSessionHours.max) * 3_600_000,
    customerSessionMs: int(env.CUSTOMER_SESSION_DAYS, b.customerSessionDays.def, b.customerSessionDays.min, b.customerSessionDays.max) * 86_400_000,
    // Safe defaults: verified-only email and both alerts are ON unless the owner switches them off.
    requireVerifiedEmail: on(env.REQUIRE_VERIFIED_EMAIL, true),
    newDeviceAlertStaff: on(env.NEW_DEVICE_ALERT_STAFF, true),
    newDeviceAlertCustomers: on(env.NEW_DEVICE_ALERT_CUSTOMERS, true),
  };
}
