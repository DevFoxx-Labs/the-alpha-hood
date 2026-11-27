import { audit } from "@/lib/admin/auth";
import { adminWrite, privateJson } from "@/lib/admin/http";
import { jsonError } from "@/lib/http/guard";
import { rateLimiter } from "@/lib/http/rate-limit";
import { providerError } from "@/lib/providers/http";
import { resolveProviderStore } from "@/lib/providers/store";
import { testShipping } from "@/lib/shipping/service";

/** POST /api/admin/shipping/test `{ pincode? }` — signs in to Shiprocket and checks one pincode (10 per 10 min). */
export async function POST(request: Request) {
  const w = await adminWrite(request, "settings.manage", "shipping-test", 128);
  if (!w.ok) return w.response;
  try {
    const rl = await rateLimiter.hit(`admin:shipping-test:${w.staff.id}`, 10, 10 * 60_000);
    if (!rl.ok) return jsonError(429, "rate_limited", "Too many tests. Try again in a few minutes.", { "Retry-After": String(rl.retryAfterSeconds) });
    const result = await testShipping(resolveProviderStore(), w.body, w.staff.id);
    await audit(w, "shipping_provider.test", "shipping_provider:shiprocket", { ok: result.ok });
    return privateJson(result);
  } catch (error) {
    return providerError(error);
  }
}
