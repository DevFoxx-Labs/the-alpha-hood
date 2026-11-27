import { passwordSignIn } from "@/lib/auth/email-auth";
import { sha256 } from "@/lib/auth/secrets";
import { completeSignIn } from "@/lib/auth/sign-in";
import { signInEnabled } from "@/lib/checkout/flags";
import { commerceErrorResponse, privateJson } from "@/lib/http/commerce-http";
import { guardPublicWrite, jsonError } from "@/lib/http/guard";
import { rateLimiter } from "@/lib/http/rate-limit";
import { securityEvent } from "@/lib/security/log";
import { checkHuman } from "@/lib/security/turnstile";
import { asObject, normaliseEmail, rejectUnknownFields } from "@/lib/validation";

/**
 * POST /api/auth/password `{ email, password, turnstile? }` — email + password sign-in (ACC-01).
 * Brute force / credential stuffing: 10 tries per 10 min per IP, 8 per 15 min per address (whether or not it has
 * an account, so the limit itself reveals nothing), 300 per 10 min across the store, plus the bot check when on.
 * One message for every failure; the scrypt check costs the same time for unknown addresses.
 */
const FAILED = "Email or password is incorrect.";

export async function POST(request: Request) {
  if (!signInEnabled()) return jsonError(503, "sign_in_disabled", "Sign-in is temporarily unavailable.");
  const guard = await guardPublicWrite(request, { name: "password-login", limit: 10, windowMs: 10 * 60_000, maxBytes: 1_024 });
  if (!guard.ok) return guard.response;
  try {
    const input = asObject(guard.body);
    rejectUnknownFields(input, ["email", "password", "turnstile"]);
    const human = await checkHuman(input.turnstile, guard.ip);
    if (human === "failed") return jsonError(403, "human_check_failed", "We couldn't confirm you're not a robot. Reload the page and try again.");
    const email = normaliseEmail(input.email);
    if (!email || typeof input.password !== "string" || input.password.length === 0) return jsonError(401, "invalid_credentials", FAILED);

    const [perAddress, global] = await Promise.all([
      rateLimiter.hit(`password-login:acct:${sha256(email)}`, 8, 15 * 60_000),
      rateLimiter.hit("password-login:all", 300, 10 * 60_000),
    ]);
    if (!perAddress.ok || !global.ok) {
      securityEvent("login_limited", { kind: "password", scope: perAddress.ok ? "global" : "address" });
      const wait = Math.max(perAddress.retryAfterSeconds, global.retryAfterSeconds);
      return jsonError(429, "rate_limited", "Too many sign-in attempts. Wait a few minutes, or sign in with a code sent to your email.", { "Retry-After": String(wait) });
    }

    const customerId = await passwordSignIn(email, input.password);
    if (!customerId) return jsonError(401, "invalid_credentials", FAILED);
    const response = privateJson({ ok: true });
    await completeSignIn(request, response, { customerId, created: false, method: "password", ip: guard.ip });
    return response;
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
