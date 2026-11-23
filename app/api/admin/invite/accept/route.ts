import { NextResponse } from "next/server";
import { acceptInvite } from "@/lib/admin/auth";
import { adminError } from "@/lib/admin/http";
import { resolveStaffStore } from "@/lib/admin/staff";
import { resolveAudit } from "@/lib/admin/audit";
import { guardPublicWrite, PRIVATE_NO_STORE } from "@/lib/http/guard";
import { asObject, rejectUnknownFields } from "@/lib/validation";

/**
 * POST `{ token, password }` — accept a one-time invite and set your own password (TOTP is set up at first
 * sign-in). Single use even under parallel requests (atomic consume + UNIQUE email).
 */
export async function POST(request: Request) {
  const guard = await guardPublicWrite(request, { name: "admin-invite", limit: 10, windowMs: 60 * 60_000, maxBytes: 512 });
  if (!guard.ok) return guard.response;
  try {
    const input = asObject(guard.body);
    rejectUnknownFields(input, ["token", "password"]);
    const { staff, invite } = await acceptInvite(resolveStaffStore(), input.token, input.password);
    await resolveAudit().append({ actorId: staff.id, actorEmail: staff.email, action: "staff.invite_accepted", target: staff.id, details: { role: staff.role, invitedBy: invite.invitedBy }, ip: guard.ip });
    return NextResponse.json({ ok: true }, { status: 201, headers: PRIVATE_NO_STORE });
  } catch (error) {
    return adminError(error);
  }
}
