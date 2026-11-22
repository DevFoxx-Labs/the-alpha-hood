import { audit, requireStaff } from "@/lib/admin/auth";
import { adminError } from "@/lib/admin/http";
import { ordersCsv } from "@/lib/admin/ops";
import { jsonError } from "@/lib/http/guard";
import { rateLimiter } from "@/lib/http/rate-limit";

/** ADM-07 CSV export of orders (GST columns) — no customer contact details; formula cells neutralised. */
export async function GET(request: Request) {
  const auth = requireStaff(request, "reports.read");
  if (!auth.ok) return auth.response;
  if (!rateLimiter.hit(`admin-export:${auth.staff.id}`, 10, 60 * 60_000).ok) return jsonError(429, "rate_limited", "Too many exports.");
  const d = Number(new URL(request.url).searchParams.get("days"));
  try {
    const days = [7, 14, 30, 90].includes(d) ? d : 30;
    const csv = await ordersCsv(days);
    await audit(auth, "report.orders_csv", "orders", { days });
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="orders-last-${days}-days.csv"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return adminError(error);
  }
}
