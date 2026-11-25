import { audit, requireStaff } from "@/lib/admin/auth";
import { adminError } from "@/lib/admin/http";
import { jsonError } from "@/lib/http/guard";
import { rateLimiter } from "@/lib/http/rate-limit";
import { resolveNewsletterStore, subscribersCsv } from "@/lib/newsletter/service";

/**
 * GET `?channel&status&q` → CSV with FULL contacts, for sending campaigns. Personal data leaving the system, so:
 * `subscribers.read` only, 10 exports per hour per staff member, audited with the filter and row count,
 * formula cells neutralised. Unsubscribed people are excluded unless the status filter asks for them.
 */
export async function GET(request: Request) {
  const auth = await requireStaff(request, "subscribers.read");
  if (!auth.ok) return auth.response;
  if (!(await rateLimiter.hit(`admin-subscribers-export:${auth.staff.id}`, 10, 60 * 60_000)).ok) return jsonError(429, "rate_limited", "Too many exports. Try again later.");
  try {
    const params = new URL(request.url).searchParams;
    const { csv, count } = await subscribersCsv(resolveNewsletterStore(), params);
    await audit(auth, "subscribers.export_csv", "newsletter", { channel: params.get("channel"), status: params.get("status"), count });
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="subscribers-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return adminError(error);
  }
}
