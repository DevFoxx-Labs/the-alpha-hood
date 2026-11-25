import { NextResponse } from "next/server";
import { notifyPasswordChanged, resetWithCode } from "@/lib/admin/auth";
import { resolveAudit } from "@/lib/admin/audit";
import { adminError } from "@/lib/admin/http";
import { guardPublicWrite, jsonError, PRIVATE_NO_STORE } from "@/lib/http/guard";
import { rateLimiter } from "@/lib/http/rate-limit";
import { securityEvent } from "@/lib/security/log";
import { asObject, rejectUnknownFields } from "@/lib/validation";

/**
 * POST `{ email, challengeId, code, password }` — "Forgot password?" step 2 (public). The code is single use with
 * 5 tries (OTP service); 10 tries per 15 min per IP on top. Success: new password, all sessions revoked, an email
 * notice to the account, an audit row. No session is created — the person signs in with the new password AND their
 * authenticator code.
 */
export async function POST(request: Request) {
  const guard = await guardPublicWrite(request, { name: "admin-reset", limit: 10, windowMs: 15 * 60_000, maxBytes: 600 });
  if (!guard.ok) return guard.response;
  if (!(await rateLimiter.hit("admin-reset:global", 300, 60_000)).ok) return jsonError(429, "rate_limited", "Too many requests. Try again in a minute.");
  try {
    const input = asObject(guard.body);
    rejectUnknownFields(input, ["email", "challengeId", "code", "password"]);
    const staff = await resetWithCode({ email: input.email, challengeId: input.challengeId, code: input.code, password: input.password });
    await resolveAudit().append({ actorId: staff.id, actorEmail: staff.email, action: "staff.password_reset", target: staff.id, details: { via: "email_code" }, ip: guard.ip });
    securityEvent("admin_password_reset", { staff: staff.id });
    await notifyPasswordChanged(staff, "email_code");
    return NextResponse.json({ ok: true }, { headers: PRIVATE_NO_STORE });
  } catch (error) {
    return adminError(error);
  }
}
