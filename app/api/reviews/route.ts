import { clientIp, errorResponse, jsonError } from "@/lib/http/guard";
import { rateLimiter } from "@/lib/http/rate-limit";
import { reviews } from "@/lib/reviews";
import { parseReviewQuery } from "@/lib/reviews/summary";

const STYLE_RE = /^style_[0-9]{1,6}$/;
const HANDLE_RE = /^[a-z0-9-]{1,120}$/;

/** PDP-08 GET /api/reviews?style=style_06 (or ?category=shirts) &rating=&photos=1&size=&sort=&page= */
export async function GET(request: Request) {
  const rl = await rateLimiter.hit(`reviews:ip:${clientIp(request)}`, 60, 60_000);
  if (!rl.ok) return jsonError(429, "rate_limited", "Too many requests.", { "Retry-After": String(rl.retryAfterSeconds) });

  const params = new URL(request.url).searchParams;
  const style = params.get("style");
  const category = params.get("category");
  const target = style && STYLE_RE.test(style) ? { styleId: style } : category && HANDLE_RE.test(category) ? { category } : null;
  if (!target) return jsonError(400, "invalid_input", "Unknown product.");
  try {
    const page = await reviews.list(target, parseReviewQuery(params));
    return Response.json(page, { headers: { "Cache-Control": "public, max-age=60" } });
  } catch (error) {
    return errorResponse(error);
  }
}
