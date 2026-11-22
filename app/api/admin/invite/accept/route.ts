import { NextResponse } from "next/server";
import { hashPassword, passwordProblem } from "@/lib/admin/crypto";
import { adminError } from "@/lib/admin/http";
import { findByEmail, newStaff, resolveStaffStore } from "@/lib/admin/staff";
import { resolveAudit } from "@/lib/admin/audit";
import { sha256 } from "@/lib/auth/secrets";
import { guardPublicWrite, jsonError, PRIVATE_NO_STORE } from "@/lib/http/guard";
import { asObject, rejectUnknownFields } from "@/lib/validation";

/** POST `{ token, password }` — accept a one-time invite and set your own password (TOTP is set up at first sign-in). */
export async function POST(request: Request) {
  const guard = await guardPublicWrite(request, { name: "admin-invite", limit: 10, windowMs: 60 * 60_000, maxBytes: 512 });
  if (!guard.ok) return guard.response;
  try {
    const input = asObject(guard.body);
    rejectUnknownFields(input, ["token", "password"]);
    const token = typeof input.token === "string" && /^[A-Za-z0-9_-]{40,60}$/.test(input.token) ? input.token : null;
    const store = resolveStaffStore();
    const invite = token ? store.invites.get(sha256(token)) : undefined;
    if (!invite || invite.used || invite.expiresAt <= Date.now()) return jsonError(410, "invite_invalid", "This invite link is invalid or has expired.");
    const problem = passwordProblem(input.password);
    if (problem) return jsonError(422, "weak_password", problem);
    if (findByEmail(store, invite.email)) return jsonError(409, "exists", "This invite was already used.");
    invite.used = true;
    const staff = newStaff({ email: invite.email, name: invite.name, role: invite.role, passwordHash: await hashPassword(input.password as string) });
    store.staff.set(staff.id, staff);
    await resolveAudit().append({ actorId: staff.id, actorEmail: staff.email, action: "staff.invite_accepted", target: staff.id, details: { role: staff.role, invitedBy: invite.invitedBy }, ip: guard.ip });
    return NextResponse.json({ ok: true }, { status: 201, headers: PRIVATE_NO_STORE });
  } catch (error) {
    return adminError(error);
  }
}
