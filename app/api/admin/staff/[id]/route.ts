import { audit } from "@/lib/admin/auth";
import { adminError, adminWrite, privateJson } from "@/lib/admin/http";
import { parseRole } from "@/lib/admin/auth";
import { resolveStaffStore, revokeStaffSessions } from "@/lib/admin/staff";
import { jsonError } from "@/lib/http/guard";
import { asObject, rejectUnknownFields } from "@/lib/validation";

/**
 * PATCH `{ role? , disabled? , resetMfa? }` (owner only). You can't change yourself, and the last active owner
 * can't be demoted or disabled. Any change signs the person out everywhere.
 */
export async function PATCH(request: Request, { params }: RouteContext<"/api/admin/staff/[id]">) {
  const w = await adminWrite(request, "staff.manage", "staff-update", 256);
  if (!w.ok) return w.response;
  const { id } = await params;
  try {
    const store = resolveStaffStore();
    const target = /^stf_[a-f0-9]{18}$/.test(id) ? store.staff.get(id) : undefined;
    if (!target) return jsonError(404, "not_found", "Staff member not found.");
    if (target.id === w.staff.id) return jsonError(409, "self", "Ask another owner to change your own access.");
    const input = asObject(w.body);
    rejectUnknownFields(input, ["role", "disabled", "resetMfa"]);
    const role = input.role === undefined ? target.role : parseRole(input.role);
    const disabled = input.disabled === undefined ? target.disabled : input.disabled === true;
    const activeOwners = [...store.staff.values()].filter((s) => s.role === "owner" && !s.disabled);
    if (target.role === "owner" && (role !== "owner" || disabled) && activeOwners.length <= 1) {
      return jsonError(409, "last_owner", "Keep at least one active owner.");
    }
    target.role = role;
    target.disabled = disabled;
    if (input.resetMfa === true) {
      target.totpEnabled = false;
      target.totpSecret = null;
      target.lastTotpStep = -1;
    }
    const revoked = revokeStaffSessions(store, target.id);
    await audit(w, "staff.update", target.id, { role, disabled, resetMfa: input.resetMfa === true, revoked });
    return privateJson({ ok: true });
  } catch (error) {
    return adminError(error);
  }
}
