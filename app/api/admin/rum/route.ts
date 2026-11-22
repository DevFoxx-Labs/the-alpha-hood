import { requireStaff } from "@/lib/admin/auth";
import { privateJson } from "@/lib/admin/http";
import { RUM_TARGETS, rumSummary } from "@/lib/rum/store";

/** GET /api/admin/rum — p75 Core Web Vitals per route template for the last 7 days (reports.read). */
export async function GET(request: Request) {
  const auth = requireStaff(request, "reports.read");
  if (!auth.ok) return auth.response;
  return privateJson({ rows: rumSummary(), targets: RUM_TARGETS });
}
