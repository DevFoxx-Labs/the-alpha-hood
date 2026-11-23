import type { Env } from "@/lib/mock-guard";

/**
 * CHK-08 optional one-click checkout (GoKwik / Razorpay Magic Checkout / Shiprocket Checkout) behind a feature
 * flag. Fail closed: off unless ONE_CLICK_ENABLED is exactly "true" AND a known provider + merchant id are set.
 * No provider SDK is integrated yet (owner decision); while `clientReady` is false the button never renders,
 * so turning the flag on alone can't expose a half-built payment path. Any provider must still send the order
 * through our server pricing + webhook verification (never trust its client-side totals).
 */
export const ONE_CLICK_PROVIDERS = ["gokwik", "razorpay_magic", "shiprocket"] as const;

export function readOneClick(env: Env = process.env) {
  const provider = env.ONE_CLICK_PROVIDER?.trim();
  const merchant = env.ONE_CLICK_MERCHANT_ID?.trim() ?? "";
  if (env.ONE_CLICK_ENABLED !== "true") return null;
  if (!provider || !(ONE_CLICK_PROVIDERS as readonly string[]).includes(provider) || !/^[A-Za-z0-9_-]{6,64}$/.test(merchant)) return null;
  return { provider, clientReady: false as const };
}

/** What the checkout page may show. */
export function oneClickAvailable(env: Env = process.env): boolean {
  const cfg = readOneClick(env);
  return !!cfg && cfg.clientReady;
}
