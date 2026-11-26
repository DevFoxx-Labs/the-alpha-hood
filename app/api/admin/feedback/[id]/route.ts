import { audit } from "@/lib/admin/auth";
import { adminWrite, privateJson } from "@/lib/admin/http";
import { answerFeedback, publicFeedback } from "@/lib/submissions/feedback";
import { submissionError } from "@/lib/submissions/http";

/** POST /api/admin/feedback/{id} `{ reply?, status: "resolved" | "open" }` — answer a customer's message. */
export async function POST(request: Request, { params }: RouteContext<"/api/admin/feedback/[id]">) {
  const w = await adminWrite(request, "feedback.manage", "feedback-answer", 4_096);
  if (!w.ok) return w.response;
  const { id } = await params;
  try {
    const s = await answerFeedback(id, w.body, w.staff.id);
    await audit(w, "feedback.answer", id, { status: s.status, replied: !!s.doc.reply });
    return privateJson({ message: publicFeedback(s) });
  } catch (error) {
    return submissionError(error);
  }
}
