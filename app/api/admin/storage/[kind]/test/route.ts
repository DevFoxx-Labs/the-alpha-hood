import { audit } from "@/lib/admin/auth";
import { adminWrite, privateJson } from "@/lib/admin/http";
import { jsonError } from "@/lib/http/guard";
import { rateLimiter } from "@/lib/http/rate-limit";
import { providerError } from "@/lib/providers/http";
import { resolveProviderStore } from "@/lib/providers/store";
import { testBackend } from "@/lib/storage/service";

/** POST /api/admin/storage/<local|s3|r2>/test — write, read back and delete a small probe file (10 per 10 min). */
export async function POST(request: Request, { params }: RouteContext<"/api/admin/storage/[kind]/test">) {
  const w = await adminWrite(request, "settings.manage", "storage-test", 64);
  if (!w.ok) return w.response;
  const { kind } = await params;
  try {
    const rl = await rateLimiter.hit(`admin:storage-test:${w.staff.id}`, 10, 10 * 60_000);
    if (!rl.ok) return jsonError(429, "rate_limited", "Too many tests. Try again in a few minutes.", { "Retry-After": String(rl.retryAfterSeconds) });
    const result = await testBackend(resolveProviderStore(), kind, w.staff.id);
    await audit(w, "storage_provider.test", `storage_provider:${kind}`, { ok: result.ok });
    return privateJson(result);
  } catch (error) {
    return providerError(error);
  }
}
