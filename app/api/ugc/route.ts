import { clientIp, jsonError } from "@/lib/http/guard";
import { commerceErrorResponse } from "@/lib/http/commerce-http";
import { rateLimiter } from "@/lib/http/rate-limit";
import { publicUgc, resolveUgc } from "@/lib/ugc/service";

/** GET /api/ugc — approved #WearTheHood posts (first name, caption, tagged products). Public, rate-limited. */
export async function GET(request: Request) {
  if (!(await rateLimiter.hit(`ugc-list:ip:${clientIp(request)}`, 60, 60_000)).ok) return jsonError(429, "rate_limited", "Too many requests.");
  try {
    return Response.json({ posts: await publicUgc(resolveUgc()) }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
