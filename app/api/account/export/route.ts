import { exportData } from "@/lib/account/service";
import { clientIp, jsonError } from "@/lib/http/guard";
import { commerceErrorResponse, requireAccount } from "@/lib/http/commerce-http";
import { rateLimiter } from "@/lib/http/rate-limit";

/** GET /api/account/export — DPDP access right: a JSON copy of the caller's own data. 5 per hour. */
export async function GET(request: Request) {
  const auth = await requireAccount(request);
  if (!auth.ok) return auth.response;
  const rl = await rateLimiter.hit(`export:customer:${auth.customerId}`, 5, 60 * 60_000);
  const ipRl = await rateLimiter.hit(`export:ip:${clientIp(request)}`, 10, 60 * 60_000);
  if (!rl.ok || !ipRl.ok) return jsonError(429, "rate_limited", "Too many downloads. Try again later.");
  try {
    const data = await exportData(auth.customerId);
    if (!data) return jsonError(401, "unauthenticated", "Please sign in again.");
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="the-alpha-hood-my-data.json"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
