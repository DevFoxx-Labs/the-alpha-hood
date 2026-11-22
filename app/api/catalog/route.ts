import { parseQuery } from "@/lib/catalog/query";
import { parseScope } from "@/lib/catalog/scope";
import { commerce } from "@/lib/commerce";
import { CommerceError } from "@/lib/commerce/types";
import { clientIp, jsonError } from "@/lib/http/guard";
import { rateLimiter } from "@/lib/http/rate-limit";

/**
 * GET /api/catalog?scope=category&category=shirts&sub=checks&size=m… → `{ total }`.
 * Powers "Apply (n results)" in the mobile filter sheet. Same allow-list parsing as the pages.
 */
export async function GET(request: Request) {
  const rl = rateLimiter.hit(`catalog:ip:${clientIp(request)}`, 90, 60_000);
  if (!rl.ok) return jsonError(429, "rate_limited", "Too many requests.", { "Retry-After": String(rl.retryAfterSeconds) });

  const params = new URL(request.url).searchParams;
  const scope = parseScope(params);
  if (!scope) return jsonError(400, "invalid_scope", "Unknown listing.");

  try {
    const result = await commerce.searchCatalog(scope, parseQuery(params, { search: scope.kind === "search" }));
    return Response.json({ total: result.total }, { headers: { "Cache-Control": "public, max-age=60" } });
  } catch (error) {
    if (error instanceof CommerceError) return jsonError(400, "invalid_scope", "Unknown listing.");
    return jsonError(503, "unavailable", "Temporarily unavailable.");
  }
}
