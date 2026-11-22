import type { Env } from "@/lib/mock-guard";

/**
 * Kill switches for the high-risk flows (global rule: fail closed — on only when the variable is exactly
 * "true"). Read at call time so they can be flipped without a rebuild on hosts that support it.
 * Local development sets them in `.env.development`.
 */
export function checkoutEnabled(env: Env = process.env): boolean {
  return env.CHECKOUT_ENABLED === "true";
}

export function codEnabled(env: Env = process.env): boolean {
  return checkoutEnabled(env) && env.COD_ENABLED === "true";
}

/**
 * The demo payment gateway and demo SMS (which shows the OTP on screen) are development tools. They run in
 * `next dev` / tests, and in a production build only when ALLOW_MOCK_PAYMENTS is exactly "true"
 * (a protected preview). Never set it on the live store.
 */
export function mockPaymentsAllowed(env: Env = process.env): boolean {
  if (env.NODE_ENV !== "production") return true;
  return env.ALLOW_MOCK_PAYMENTS === "true";
}
