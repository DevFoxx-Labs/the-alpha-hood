import { requireStaff } from "@/lib/admin/auth";
import { adminError, privateJson } from "@/lib/admin/http";
import { listReturns } from "@/lib/admin/ops";

const STATUSES = ["pickup_scheduled", "picked_up", "qc_failed", "completed", "cancelled"];

/** ADM-04 returns queue — GET ?status= */
export async function GET(request: Request) {
  const auth = requireStaff(request, "returns.read");
  if (!auth.ok) return auth.response;
  const s = new URL(request.url).searchParams.get("status") ?? "";
  try {
    return privateJson({ rows: await listReturns(STATUSES.includes(s) ? s : undefined) });
  } catch (error) {
    return adminError(error);
  }
}
