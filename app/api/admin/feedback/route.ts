import { requireStaff } from "@/lib/admin/auth";
import { adminError, privateJson } from "@/lib/admin/http";
import { resolveCustomers } from "@/lib/customers/store";
import { type FeedbackDoc, publicFeedback } from "@/lib/submissions/feedback";
import { resolveSubmissions } from "@/lib/submissions/store";
import { maskContact } from "@/lib/validation";

/** GET /api/admin/feedback?status=open|resolved — customers' help & feedback (feedback.manage). Contacts masked. */
export async function GET(request: Request) {
  const auth = await requireStaff(request, "feedback.manage");
  if (!auth.ok) return auth.response;
  try {
    const status = new URL(request.url).searchParams.get("status") === "resolved" ? "resolved" : "open";
    const rows = await resolveSubmissions().listByStatus<FeedbackDoc>("feedback", status, 200);
    const customers = resolveCustomers();
    const people = new Map<string, { name: string | null; phone: string }>();
    for (const id of new Set(rows.map((r) => r.customerId))) {
      const c = await customers.get(id);
      people.set(id, { name: c?.name ?? null, phone: c ? maskContact(c.phone) : "—" });
    }
    return privateJson({ status, messages: rows.map((s) => ({ ...publicFeedback(s), customerId: s.customerId, customer: people.get(s.customerId) })) });
  } catch (error) {
    return adminError(error);
  }
}
