import { MEDIA_ID_RE } from "@/lib/catalog/media";
import { dbStores } from "@/lib/db";
import { clientIp, jsonError } from "@/lib/http/guard";
import { rateLimiter } from "@/lib/http/rate-limit";

/**
 * GET /api/media/<id> — a public product photo (own backend). The id is random and the bytes never change, so the
 * response is cached `immutable` for a year (CDN + Next.js image optimiser). Served with nosniff and a sandbox CSP;
 * only JPEG / PNG ever reach the store (sniffed at upload).
 */
export async function GET(request: Request, ctx: RouteContext<"/api/media/[id]">) {
  const { id } = await ctx.params;
  if (!MEDIA_ID_RE.test(id)) return jsonError(404, "not_found", "Not found.");
  const rl = await rateLimiter.hit(`media:ip:${clientIp(request)}`, 600, 60_000);
  if (!rl.ok) return jsonError(429, "rate_limited", "Too many requests.");
  try {
    const item = await dbStores()?.media.get(id);
    if (!item) return jsonError(404, "not_found", "Not found.");
    return new Response(item.bytes.slice().buffer, {
      headers: {
        "Content-Type": item.type,
        "Content-Length": String(item.bytes.length),
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return jsonError(503, "unavailable", "Temporarily unavailable.");
  }
}
