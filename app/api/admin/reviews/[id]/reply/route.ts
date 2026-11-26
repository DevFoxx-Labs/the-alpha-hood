import { audit } from "@/lib/admin/auth";
import { adminWrite, privateJson } from "@/lib/admin/http";
import { submissionError } from "@/lib/submissions/http";
import { replyToReview } from "@/lib/submissions/reviews";
import { asObject, rejectUnknownFields } from "@/lib/validation";

/** POST /api/admin/reviews/{id}/reply `{ text }` — the store's public reply under a published review ("" removes it). */
export async function POST(request: Request, { params }: RouteContext<"/api/admin/reviews/[id]/reply">) {
  const w = await adminWrite(request, "ugc.moderate", "review-reply", 2_048);
  if (!w.ok) return w.response;
  const { id } = await params;
  try {
    const input = asObject(w.body);
    rejectUnknownFields(input, ["text"]);
    const s = await replyToReview(id, input.text, w.staff.id);
    await audit(w, s.doc.reply ? "review.reply" : "review.reply_removed", id, {});
    return privateJson({ ok: true, reply: s.doc.reply ? { text: s.doc.reply.text, at: s.doc.reply.at } : null });
  } catch (error) {
    return submissionError(error);
  }
}
