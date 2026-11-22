import { requireStaff } from "@/lib/admin/auth";
import { adminError, privateJson } from "@/lib/admin/http";
import { reports } from "@/lib/admin/ops";

/** ADM-07 GET ?days=7|14|30 */
export async function GET(request: Request) {
  const auth = requireStaff(request, "reports.read");
  if (!auth.ok) return auth.response;
  const d = Number(new URL(request.url).searchParams.get("days"));
  try {
    return privateJson(await reports([7, 14, 30].includes(d) ? d : 14));
  } catch (error) {
    return adminError(error);
  }
}
