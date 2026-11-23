import { requireStaff } from "@/lib/admin/auth";
import { adminError, privateJson } from "@/lib/admin/http";
import { resolveAudit } from "@/lib/admin/audit";

/** ADM-08 audit log (owner). GET ?target= */
export async function GET(request: Request) {
  const auth = await requireStaff(request, "audit.read");
  if (!auth.ok) return auth.response;
  const target = (new URL(request.url).searchParams.get("target") ?? "").slice(0, 80) || undefined;
  try {
    return privateJson({ rows: await resolveAudit().list({ target, limit: 300 }) });
  } catch (error) {
    return adminError(error);
  }
}
