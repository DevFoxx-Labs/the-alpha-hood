import { requestResetCode } from "@/lib/admin/auth";
import { adminError, privateJson } from "@/lib/admin/http";
import { guardPublicWrite, jsonError } from "@/lib/http/guard";
import { rateLimiter } from "@/lib/http/rate-limit";
import { securityEvent } from "@/lib/security/log";
import { asObject, rejectUnknownFields } from "@/lib/validation";

/**
 * POST `{ email }` → `{ challengeId, expiresInSeconds }` — "Forgot password?" step 1 (public).
 * Same answer whether or not the email is a staff account (no enumeration). Email costs money and can be used to
 * spam a mailbox, so: 5 per 15 min and 20 per day per IP, 300/min across all IPs, plus the per-email cooldown and
 * hourly / daily caps in the OTP service. Fails closed (503) when no email provider is configured.
 */
export async function POST(request: Request) {
  const guard = await guardPublicWrite(request, { name: "admin-forgot", limit: 5, windowMs: 15 * 60_000, maxBytes: 300 });
  if (!guard.ok) return guard.response;
  if (!(await rateLimiter.hit(`admin-forgot-day:ip:${guard.ip}`, 20, 86_400_000)).ok) return jsonError(429, "rate_limited", "Too many requests today. Try again tomorrow.");
  if (!(await rateLimiter.hit("admin-forgot:global", 300, 60_000)).ok) return jsonError(429, "rate_limited", "Too many requests. Try again in a minute.");
  try {
    const input = asObject(guard.body);
    rejectUnknownFields(input, ["email"]);
    const sent = await requestResetCode(input.email);
    // Security log only (not the audit log): anyone can call this, and the email may not be a staff address.
    securityEvent("admin_reset_code_requested", { ip: guard.ip });
    return privateJson(sent);
  } catch (error) {
    return adminError(error);
  }
}
