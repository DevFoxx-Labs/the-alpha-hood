import { clientIp, jsonError } from "@/lib/http/guard";
import { commerceErrorResponse } from "@/lib/http/commerce-http";
import { rateLimiter } from "@/lib/http/rate-limit";
import { resolvePhotos } from "@/lib/returns/photos";
import { resolveUgc } from "@/lib/ugc/service";

/**
 * GET /api/ugc/{id}/photo — an APPROVED post's photo only (pending, rejected and withdrawn posts look missing).
 * Metadata was stripped at upload; served with nosniff + sandbox CSP so it can never execute.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/ugc/[id]/photo">) {
  if (!(await rateLimiter.hit(`ugc-photo:ip:${clientIp(request)}`, 240, 60_000)).ok) return jsonError(429, "rate_limited", "Too many requests.");
  try {
    const { id } = await ctx.params;
    const post = await resolveUgc().get(id);
    if (!post || post.status !== "approved") return jsonError(404, "not_found", "Not found.");
    const photo = await resolvePhotos().get(post.customerId, post.photoId);
    if (!photo) return jsonError(404, "not_found", "Not found.");
    return new Response(photo.bytes.slice().buffer, {
      headers: {
        "Content-Type": photo.type,
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        // Short cache: a withdrawn post must disappear quickly.
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
