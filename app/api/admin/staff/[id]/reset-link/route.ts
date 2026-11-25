import { audit, createPasswordReset } from "@/lib/admin/auth";
import { adminError, adminWrite, privateJson } from "@/lib/admin/http";
import { resolveStaffStore } from "@/lib/admin/staff";
import { jsonError } from "@/lib/http/guard";
import { asObject, rejectUnknownFields } from "@/lib/validation";

/**
 * POST `{}` (owner only, `staff.manage`) → a one-time password-reset link for another active staff member,
 * valid 1 hour. Shown once to the owner to send privately; only its hash is stored. Two-step verification is
 * untouched (use "Reset 2-step" for a lost phone). You can't issue one for yourself — ask another owner, or run
 * `pnpm admin:reset-link` on the server if you're the only owner.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/admin/staff/[id]/reset-link">) {
  const w = await adminWrite(request, "staff.manage", "staff-reset-link", 64);
  if (!w.ok) return w.response;
  const { id } = await params;
  try {
    rejectUnknownFields(asObject(w.body ?? {}), []);
    if (!/^stf_[a-f0-9]{18}$/.test(id)) return jsonError(404, "not_found", "Staff member not found.");
    if (id === w.staff.id) return jsonError(409, "self", "Ask another owner to send you a reset link.");
    const store = resolveStaffStore();
    const target = await store.get(id);
    if (!target) return jsonError(404, "not_found", "Staff member not found.");
    const token = await createPasswordReset(store, target, w.staff.id);
    await audit(w, "staff.password_reset_link", id, {});
    return privateJson({ resetPath: `/admin/reset/${token}` }, { status: 201 });
  } catch (error) {
    return adminError(error);
  }
}
