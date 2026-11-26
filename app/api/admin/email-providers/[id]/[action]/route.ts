import { audit } from "@/lib/admin/auth";
import { adminWrite, privateJson } from "@/lib/admin/http";
import { locks } from "@/lib/concurrency/lock";
import { jsonError } from "@/lib/http/guard";
import { rateLimiter } from "@/lib/http/rate-limit";
import { resolveEmail } from "@/lib/notify/email";
import { activateEmailProvider, deactivateEmailProvider, testEmailProvider } from "@/lib/providers/email-service";
import { providerError, recordChange, stepUp } from "@/lib/providers/http";
import { resolveProviderStore } from "@/lib/providers/store";
import { securityEvent } from "@/lib/security/log";
import { asObject, rejectUnknownFields } from "@/lib/validation";

/**
 * POST /api/admin/email-providers/<id>/test        `{ to? }`  → one test email (default: your own address; 5 per 10 min)
 * POST /api/admin/email-providers/<id>/activate    `{ code }` → makes it the live provider (needs a passed test + TOTP)
 * POST /api/admin/email-providers/<id>/deactivate  `{ code }` → no provider live: back to the environment's email settings
 */
export async function POST(request: Request, { params }: RouteContext<"/api/admin/email-providers/[id]/[action]">) {
  const w = await adminWrite(request, "settings.manage", "email-provider-action", 512);
  if (!w.ok) return w.response;
  const { id, action } = await params;
  try {
    const input = asObject(w.body);
    const store = resolveProviderStore();
    if (action === "test") {
      rejectUnknownFields(input, ["to"]);
      const rl = await rateLimiter.hit(`admin:email-test:${w.staff.id}`, 5, 10 * 60_000);
      if (!rl.ok) return jsonError(429, "rate_limited", "Too many test emails. Try again in a few minutes.", { "Retry-After": String(rl.retryAfterSeconds) });
      const result = await testEmailProvider(store, id, input.to, w.staff.id, w.staff.email);
      securityEvent("email_provider_test", { staff: w.staff.id, provider: id, ok: result.ok });
      await audit(w, "email_provider.test", `email_provider:${id}`, { ok: result.ok });
      return privateJson(result);
    }
    if (action !== "activate" && action !== "deactivate") return jsonError(404, "not_found", "Unknown action.");
    rejectUnknownFields(input, ["code"]);
    await stepUp(w.staff, input.code);
    const before = resolveEmail(); // the route that was live before the change carries the warning
    const change = await locks.run("admin:email-providers", () => (action === "activate" ? activateEmailProvider(store, id, w.staff.id) : deactivateEmailProvider(store, id)));
    await recordChange(w, id, action, change, "email", before);
    return privateJson(change);
  } catch (error) {
    return providerError(error);
  }
}
