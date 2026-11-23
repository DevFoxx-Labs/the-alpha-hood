import { requireStaff } from "@/lib/admin/auth";
import { privateJson } from "@/lib/admin/http";
import { ROLE_PERMISSIONS } from "@/lib/admin/permissions";
import { publicStaff } from "@/lib/admin/staff";

/** GET — the signed-in staff member and their permissions (drives which nav items render). */
export async function GET(request: Request) {
  const auth = await requireStaff(request, "dashboard");
  if (!auth.ok) return auth.response;
  return privateJson({ staff: publicStaff(auth.staff), permissions: ROLE_PERMISSIONS[auth.staff.role] });
}
