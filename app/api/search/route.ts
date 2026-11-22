import { normaliseSearchTerm } from "@/lib/catalog/query";
import { commerce } from "@/lib/commerce";
import { clientIp, jsonError } from "@/lib/http/guard";
import { rateLimiter } from "@/lib/http/rate-limit";

/**
 * SRCH-01 instant results: GET /api/search?q= → up to 6 products + 4 categories. Public catalogue data only.
 * Rate-limited per IP (each keystroke after the 150 ms debounce is one request). Not logged.
 */
export async function GET(request: Request) {
  const rl = rateLimiter.hit(`search:ip:${clientIp(request)}`, 120, 60_000);
  if (!rl.ok) return jsonError(429, "rate_limited", "Too many requests.", { "Retry-After": String(rl.retryAfterSeconds) });

  const q = normaliseSearchTerm(new URL(request.url).searchParams.get("q"));
  if (q.length < 2) return Response.json({ products: [], categories: [] });
  try {
    const suggestions = await commerce.suggest(q, 6);
    return Response.json(suggestions, { headers: { "Cache-Control": "public, max-age=60" } });
  } catch {
    return jsonError(503, "unavailable", "Search is temporarily unavailable.");
  }
}
