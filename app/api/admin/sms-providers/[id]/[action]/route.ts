import { audit } from "@/lib/admin/auth";
import { adminWrite, privateJson } from "@/lib/admin/http";
import { locks } from "@/lib/concurrency/lock";
import { jsonError } from "@/lib/http/guard";
import { rateLimiter } from "@/lib/http/rate-limit";
import { providerError, recordChange, stepUp } from "@/lib/providers/http";
import { activateSmsProvider, deactivateSmsProvider, testSmsProvider } from "@/lib/providers/sms-service";
import { resolveProviderStore } from "@/lib/providers/store";
import { securityEvent } from "@/lib/security/log";
import { asObject, rejectUnknownFields } from "@/lib/validation";

/**
 * POST /api/admin/sms-providers/<id>/test        `{ to }`   → sends one test SMS (paid: 5 per 10 minutes per staff)
 * POST /api/admin/sms-providers/<id>/activate    `{ code }` → makes it the live provider (needs a passed test + TOTP)
 * POST /api/admin/sms-providers/<id>/deactivate  `{ code }` → no provider live: back to the environment SMS settings
 */
export async function POST(request: Request, { params }: RouteContext<"/api/admin/sms-providers/[id]/[action]">) {
  const w = await adminWrite(request, "settings.manage", "sms-provider-action", 512);
  if (!w.ok) return w.response;
  const { id, action } = await params;
  try {
    const input = asObject(w.body);
    const store = resolveProviderStore();
    if (action === "test") {
      rejectUnknownFields(input, ["to"]);
      const rl = await rateLimiter.hit(`admin:sms-test:${w.staff.id}`, 5, 10 * 60_000);
      if (!rl.ok) return jsonError(429, "rate_limited", "Too many test messages. Try again in a few minutes.", { "Retry-After": String(rl.retryAfterSeconds) });
      const result = await testSmsProvider(store, id, input.to, w.staff.id);
      securityEvent("sms_provider_test", { staff: w.staff.id, provider: id, ok: result.ok });
      await audit(w, "sms_provider.test", `sms_provider:${id}`, { ok: result.ok });
      return privateJson(result);
    }
    if (action !== "activate" && action !== "deactivate") return jsonError(404, "not_found", "Unknown action.");
    rejectUnknownFields(input, ["code"]);
    await stepUp(w.staff, input.code);
    const change = await locks.run("admin:sms-providers", () => (action === "activate" ? activateSmsProvider(store, id, w.staff.id) : deactivateSmsProvider(store, id)));
    await recordChange(w, id, action, change);
    return privateJson(change);
  } catch (error) {
    return providerError(error);
  }
}
