import { clientIp, jsonError } from "@/lib/http/guard";
import { commerceErrorResponse, requireAccount } from "@/lib/http/commerce-http";
import { rateLimiter } from "@/lib/http/rate-limit";
import { resolvePhotos } from "@/lib/returns/photos";

/** GET /api/returns/photos/{id} — the owner's own photo only, served so it can never execute or be sniffed. */
export async function GET(request: Request, { params }: RouteContext<"/api/returns/photos/[id]">) {
  const rl = rateLimiter.hit(`photo-read:ip:${clientIp(request)}`, 120, 60_000);
  if (!rl.ok) return jsonError(429, "rate_limited", "Too many requests.");
  const auth = requireAccount(request);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  try {
    const photo = await resolvePhotos().get(auth.customerId, id);
    if (!photo) return jsonError(404, "not_found", "Not found.");
    return new Response(photo.bytes.slice().buffer, {
      headers: {
        "Content-Type": photo.type,
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
