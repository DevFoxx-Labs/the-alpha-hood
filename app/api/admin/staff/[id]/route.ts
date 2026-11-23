import { audit } from "@/lib/admin/auth";
import { adminError, adminWrite, privateJson } from "@/lib/admin/http";
import { parseRole } from "@/lib/admin/auth";
import { resolveStaffStore, revokeStaffSessions } from "@/lib/admin/staff";
import { locks } from "@/lib/concurrency/lock";
import { jsonError } from "@/lib/http/guard";
import { asObject, rejectUnknownFields } from "@/lib/validation";

/**
 * PATCH `{ role? , disabled? , resetMfa? }` (owner only). You can't change yourself, and the last active owner
 * can't be demoted or disabled. Any change signs the person out everywhere. Staff changes run under one lock, so
 * two owners demoting each other at the same moment can't leave the store with no owner.
 */
export async function PATCH(request: Request, { params }: RouteContext<"/api/admin/staff/[id]">) {
  const w = await adminWrite(request, "staff.manage", "staff-update", 256);
  if (!w.ok) return w.response;
  const { id } = await params;
  try {
    const input = asObject(w.body);
    rejectUnknownFields(input, ["role", "disabled", "resetMfa"]);
    if (!/^stf_[a-f0-9]{18}$/.test(id)) return jsonError(404, "not_found", "Staff member not found.");
    if (id === w.staff.id) return jsonError(409, "self", "Ask another owner to change your own access.");
    const store = resolveStaffStore();
    return await locks.run("admin:staff", async () => {
      const target = await store.get(id);
      if (!target) return jsonError(404, "not_found", "Staff member not found.");
      const role = input.role === undefined ? target.role : parseRole(input.role);
      const disabled = input.disabled === undefined ? target.disabled : input.disabled === true;
      const activeOwners = (await store.list()).filter((s) => s.role === "owner" && !s.disabled);
      if (target.role === "owner" && (role !== "owner" || disabled) && activeOwners.length <= 1) {
        return jsonError(409, "last_owner", "Keep at least one active owner.");
      }
      await store.update(id, (s) => {
        s.role = role;
        s.disabled = disabled;
        if (input.resetMfa === true) {
          s.totpEnabled = false;
          s.totpSecret = null;
          s.lastTotpStep = -1;
        }
      });
      const revoked = await revokeStaffSessions(store, id);
      await audit(w, "staff.update", id, { role, disabled, resetMfa: input.resetMfa === true, revoked });
      return privateJson({ ok: true });
    });
  } catch (error) {
    return adminError(error);
  }
}
