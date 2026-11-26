import type { Env } from "@/lib/mock-guard";
import { securityEvent } from "./log";

/**
 * Cloudflare Turnstile ("verify you are human") in front of the endpoints that send a paid sign-in SMS.
 *
 * - On only when BOTH keys are configured (Admin → Settings → Bot Protection, or the environment). Otherwise
 *   the routes behave exactly as before: rate limits only.
 * - The token is checked on the server against Cloudflare's fixed verify address (never an admin-typed URL),
 *   with the secret key, a 5 s timeout and no redirects. A token is single use on Cloudflare's side.
 * - Missing or rejected token → refused. Cloudflare unreachable → allowed: sign-in must not go down with a
 *   third party, and the per-IP and per-phone limits still apply (logged as a security event).
 */
export const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const KEY_RE = /^[0-9A-Za-z_-]{10,120}$/;
const TOKEN_RE = /^[0-9A-Za-z._-]{20,2048}$/;

export interface TurnstileConfig {
  siteKey: string;
  secretKey: string;
}

export function readTurnstile(env: Env = process.env): TurnstileConfig | null {
  const siteKey = env.TURNSTILE_SITE_KEY?.trim() ?? "";
  const secretKey = env.TURNSTILE_SECRET_KEY?.trim() ?? "";
  return KEY_RE.test(siteKey) && KEY_RE.test(secretKey) ? { siteKey, secretKey } : null;
}

export type HumanCheck = "not_required" | "passed" | "unavailable" | "failed";

export async function checkHuman(token: unknown, ip: string, env: Env = process.env, fetcher: typeof fetch = fetch): Promise<HumanCheck> {
  const cfg = readTurnstile(env);
  if (!cfg) return "not_required";
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return "failed";
  let res: Response;
  try {
    res = await fetcher(TURNSTILE_VERIFY_URL, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: cfg.secretKey, response: token, ...(/^[0-9a-fA-F:.]{3,45}$/.test(ip) ? { remoteip: ip } : {}) }),
    });
  } catch {
    securityEvent("human_check_unavailable", { reason: "network" });
    return "unavailable";
  }
  if (res.status >= 500) {
    securityEvent("human_check_unavailable", { reason: `http_${res.status}` });
    return "unavailable";
  }
  const data = (await res.json().catch(() => null)) as { success?: unknown } | null;
  if (data?.success === true) return "passed";
  securityEvent("human_check_failed", {});
  return "failed";
}
