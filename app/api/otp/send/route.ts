import { sendOtp } from "@/lib/auth/otp";
import { signInEnabled } from "@/lib/checkout/flags";
import { guardPublicWrite, jsonError } from "@/lib/http/guard";
import { commerceErrorResponse, privateJson } from "@/lib/http/commerce-http";
import { rateLimiter } from "@/lib/http/rate-limit";
import { checkHuman } from "@/lib/security/turnstile";
import { asObject, normaliseIndianMobile, rejectUnknownFields } from "@/lib/validation";

/**
 * POST /api/otp/send `{ phone }` → `{ challengeId }`. SMS costs money: per-IP limits here, per-phone
 * cooldown/hourly/daily caps in lib/auth/otp.ts. Same response whether or not the phone has an account.
 * With Turnstile on (Admin → Settings → Bot Protection) the request must carry a valid `turnstile` token.
 * The demo SMS provider returns `demoCode` (development / protected previews only — never the live store).
 */
export async function POST(request: Request) {
  if (!signInEnabled()) return jsonError(503, "sign_in_disabled", "Sign-in is temporarily unavailable.");
  const guard = await guardPublicWrite(request, { name: "otp-send", limit: 5, windowMs: 10 * 60_000, maxBytes: 2_560 });
  if (!guard.ok) return guard.response;
  const daily = await rateLimiter.hit(`otp-send-day:ip:${guard.ip}`, 20, 86_400_000);
  if (!daily.ok) return jsonError(429, "rate_limited", "Too many codes requested today.");
  try {
    const input = asObject(guard.body);
    rejectUnknownFields(input, ["phone", "turnstile"]);
    // Bot protection (when switched on): checked before any SMS is paid for.
    const human = await checkHuman(input.turnstile, guard.ip);
    if (human === "failed") return jsonError(403, "human_check_failed", "We couldn't confirm you're not a robot. Reload the page and try again.");
    const phone = normaliseIndianMobile(input.phone);
    if (!phone) return jsonError(422, "invalid_input", "Enter a valid 10-digit mobile number.");
    const sent = await sendOtp(phone);
    return privateJson(sent);
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
