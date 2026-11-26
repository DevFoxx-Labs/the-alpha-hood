import { revalidateTag } from "next/cache";
import { audit } from "@/lib/admin/auth";
import { adminWrite, privateJson } from "@/lib/admin/http";
import { CATALOG_TAG } from "@/lib/catalog/cache-tag";
import { submissionError } from "@/lib/submissions/http";
import { decideReview } from "@/lib/submissions/reviews";
import { asObject, rejectUnknownFields } from "@/lib/validation";

/** POST /api/admin/reviews/{id} `{ decision: "approve" | "reject", reason? }` — publish or reject a pending review. */
export async function POST(request: Request, { params }: RouteContext<"/api/admin/reviews/[id]">) {
  const w = await adminWrite(request, "ugc.moderate", "review-moderate", 512);
  if (!w.ok) return w.response;
  const { id } = await params;
  try {
    const input = asObject(w.body);
    rejectUnknownFields(input, ["decision", "reason"]);
    const s = await decideReview(id, input.decision, w.staff.id, input.reason);
    await audit(w, `review.${s.status === "published" ? "approve" : "reject"}`, id, { product: s.doc.productId });
    if (s.status === "published") {
      try {
        revalidateTag(CATALOG_TAG, "max"); // product cards show the new rating
      } catch {
        // outside a Next.js request there is nothing to refresh
      }
    }
    return privateJson({ ok: true, status: s.status });
  } catch (error) {
    return submissionError(error);
  }
}
