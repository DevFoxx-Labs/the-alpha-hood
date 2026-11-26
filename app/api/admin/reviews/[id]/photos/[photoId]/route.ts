import { requireStaff } from "@/lib/admin/auth";
import { jsonError } from "@/lib/http/guard";
import { resolvePhotos } from "@/lib/returns/photos";
import type { ReviewDoc } from "@/lib/submissions/reviews";
import { resolveSubmissions } from "@/lib/submissions/store";

/**
 * GET /api/admin/reviews/{id}/photos/{photoId} — a photo attached to a review, for the moderation check
 * (ugc.moderate). Only photos listed on that review; private, never cached, served so it can't execute.
 */
export async function GET(request: Request, { params }: RouteContext<"/api/admin/reviews/[id]/photos/[photoId]">) {
  const auth = await requireStaff(request, "ugc.moderate");
  if (!auth.ok) return auth.response;
  const { id, photoId } = await params;
  const s = /^sub_[a-f0-9]{24}$/.test(id) ? await resolveSubmissions().get<ReviewDoc>(id) : null;
  if (!s || s.kind !== "review" || !(s.doc.photoIds ?? []).includes(photoId)) return jsonError(404, "not_found", "Not found.");
  const photo = await resolvePhotos().get(s.customerId, photoId);
  if (!photo) return jsonError(404, "not_found", "Not found.");
  return new Response(photo.bytes.slice().buffer, {
    headers: { "Content-Type": photo.type, "Content-Disposition": "inline", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Cache-Control": "private, no-store" },
  });
}
