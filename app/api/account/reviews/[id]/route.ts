import { privateJson, requireAccount } from "@/lib/http/commerce-http";
import { guardPublicWrite, jsonError } from "@/lib/http/guard";
import { submissionError } from "@/lib/submissions/http";
import { deleteReview, editReview, publicReview } from "@/lib/submissions/reviews";

/** PATCH → edit your own review (it goes back to moderation). DELETE → remove it (also from the product page). */
export async function PATCH(request: Request, { params }: RouteContext<"/api/account/reviews/[id]">) {
  const guard = await guardPublicWrite(request, { name: "review-edit", limit: 20, windowMs: 10 * 60_000, maxBytes: 4_096 });
  if (!guard.ok) return guard.response;
  const auth = await requireAccount(request);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  try {
    return privateJson({ review: publicReview(await editReview(auth.customerId, id, guard.body)) });
  } catch (error) {
    return submissionError(error);
  }
}

export async function DELETE(request: Request, { params }: RouteContext<"/api/account/reviews/[id]">) {
  const guard = await guardPublicWrite(request, { name: "review-delete", limit: 20, windowMs: 10 * 60_000, maxBytes: 64 });
  if (!guard.ok) return guard.response;
  const auth = await requireAccount(request);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  try {
    if (!(await deleteReview(auth.customerId, id))) return jsonError(404, "not_found", "Review not found.");
    return privateJson({ ok: true });
  } catch (error) {
    return submissionError(error);
  }
}
