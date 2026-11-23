import { audit, parseRole, requireStaff } from "@/lib/admin/auth";
import { adminError, adminWrite, privateJson } from "@/lib/admin/http";
import { createInvite, findByEmail, publicStaff, resolveStaffStore } from "@/lib/admin/staff";
import { jsonError } from "@/lib/http/guard";
import { asObject, normaliseEmail, rejectUnknownFields } from "@/lib/validation";

/** ADM-08 staff (owner only). GET → staff + open invites. POST `{ email, name, role }` → one-time invite link. */
export async function GET(request: Request) {
  const auth = await requireStaff(request, "staff.manage");
  if (!auth.ok) return auth.response;
  try {
    const store = resolveStaffStore();
    return privateJson({
      staff: (await store.list()).map(publicStaff),
      invites: (await store.listInvites(Date.now())).map((i) => ({ email: i.email, role: i.role, expiresAt: new Date(i.expiresAt).toISOString() })),
    });
  } catch (error) {
    return adminError(error);
  }
}

export async function POST(request: Request) {
  const w = await adminWrite(request, "staff.manage", "staff-invite", 512);
  if (!w.ok) return w.response;
  try {
    const input = asObject(w.body);
    rejectUnknownFields(input, ["email", "name", "role"]);
    const email = normaliseEmail(input.email);
    if (!email) return jsonError(422, "invalid_input", "Enter a valid email.");
    const name = typeof input.name === "string" ? input.name.trim().slice(0, 80) : "";
    if (name.length < 2) return jsonError(422, "invalid_input", "Enter a name.");
    const role = parseRole(input.role);
    const store = resolveStaffStore();
    if (await findByEmail(store, email)) return jsonError(409, "exists", "Someone with this email is already on the team.");
    const token = await createInvite(store, { email, name, role, invitedBy: w.staff.id });
    await audit(w, "staff.invite", email, { role });
    // Shown once to the owner to send privately; only its hash is stored.
    return privateJson({ invitePath: `/admin/invite/${token}` }, { status: 201 });
  } catch (error) {
    return adminError(error);
  }
}
