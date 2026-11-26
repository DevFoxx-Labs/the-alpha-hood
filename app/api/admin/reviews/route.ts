import { requireStaff } from "@/lib/admin/auth";
import { adminError, privateJson } from "@/lib/admin/http";
import type { ReviewDoc } from "@/lib/submissions/reviews";
import { resolveSubmissions } from "@/lib/submissions/store";

/** GET /api/admin/reviews?status=pending|published|rejected — customer reviews to moderate (ugc.moderate). */
export async function GET(request: Request) {
  const auth = await requireStaff(request, "ugc.moderate");
  if (!auth.ok) return auth.response;
  try {
    const raw = new URL(request.url).searchParams.get("status");
    const status = raw === "published" || raw === "rejected" ? raw : "pending";
    const rows = await resolveSubmissions().listByStatus<ReviewDoc>("review", status, 200);
    return privateJson({
      status,
      reviews: rows.map((s) => ({ id: s.id, status: s.status, createdAt: s.createdAt, author: s.doc.author, productTitle: s.doc.productTitle, productHandle: s.doc.productHandle, size: s.doc.size, rating: s.doc.rating, title: s.doc.title, body: s.doc.body, fit: s.doc.fit, orderNumber: s.doc.orderNumber, rejectReason: s.doc.rejectReason ?? null, photoIds: s.doc.photoIds ?? [], mediaIds: s.doc.mediaIds ?? [], reply: s.doc.reply ? { text: s.doc.reply.text, at: s.doc.reply.at } : null })),
    });
  } catch (error) {
    return adminError(error);
  }
}
