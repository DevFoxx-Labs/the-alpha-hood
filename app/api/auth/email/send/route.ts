import { sendEmailCode } from "@/lib/auth/email-auth";
import { signInEnabled } from "@/lib/checkout/flags";
import { commerceErrorResponse, privateJson } from "@/lib/http/commerce-http";
import { guardPublicWrite, jsonError } from "@/lib/http/guard";
import { rateLimiter } from "@/lib/http/rate-limit";
import { checkHuman } from "@/lib/security/turnstile";
import { asObject, rejectUnknownFields } from "@/lib/validation";

/**
 * POST /api/auth/email/send `{ email, turnstile? }` → `{ challengeId, expiresInSeconds }` (ACC-01 email code).
 * Same response for every address (no account enumeration). Email costs money and can be used to spam someone:
 * per-IP 5 per 10 min and 20 per day here, per-address cooldown / hourly / daily caps in lib/auth/otp.ts, and the
 * bot check when switched on. The demo email provider returns `demoCode` (development / protected previews only).
 */
export async function POST(request: Request) {
  if (!signInEnabled()) return jsonError(503, "sign_in_disabled", "Sign-in is temporarily unavailable.");
  const guard = await guardPublicWrite(request, { name: "email-code-send", limit: 5, windowMs: 10 * 60_000, maxBytes: 2_560 });
  if (!guard.ok) return guard.response;
  const daily = await rateLimiter.hit(`email-code-send-day:ip:${guard.ip}`, 20, 86_400_000);
  if (!daily.ok) return jsonError(429, "rate_limited", "Too many codes requested today.");
  try {
    const input = asObject(guard.body);
    rejectUnknownFields(input, ["email", "turnstile"]);
    const human = await checkHuman(input.turnstile, guard.ip);
    if (human === "failed") return jsonError(403, "human_check_failed", "We couldn't confirm you're not a robot. Reload the page and try again.");
    return privateJson(await sendEmailCode(input.email));
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
