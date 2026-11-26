import { NextResponse } from "next/server";
import { setAdminCookie, totpStep } from "@/lib/admin/auth";
import { adminError } from "@/lib/admin/http";
import { resolveStaffStore } from "@/lib/admin/staff";
import { resolveAudit } from "@/lib/admin/audit";
import { guardPublicWrite, PRIVATE_NO_STORE } from "@/lib/http/guard";
import { asObject, rejectUnknownFields } from "@/lib/validation";
import { checkDevice, setDeviceCookie } from "@/lib/security/devices";
import { alertNewStaffDevice } from "@/lib/security/sign-in-alerts";

/** Admin sign-in step 2 — POST `{ ticket, code }` → session cookie (HttpOnly, SameSite=Strict). */
export async function POST(request: Request) {
  const guard = await guardPublicWrite(request, { name: "admin-totp", limit: 20, windowMs: 10 * 60_000, maxBytes: 256 });
  if (!guard.ok) return guard.response;
  try {
    const input = asObject(guard.body);
    rejectUnknownFields(input, ["ticket", "code"]);
    const { token, staff } = await totpStep(resolveStaffStore(), String(input.ticket ?? ""), input.code);
    await resolveAudit().append({ actorId: staff.id, actorEmail: staff.email, action: "auth.sign_in", target: staff.id, details: {}, ip: guard.ip });
    const response = NextResponse.json({ ok: true }, { headers: PRIVATE_NO_STORE });
    setAdminCookie(response, token);
    const device = await checkDevice("staff", staff.id, request);
    setDeviceCookie(response, device);
    if (device.isNew) await alertNewStaffDevice(staff, request.headers.get("user-agent"), guard.ip);
    return response;
  } catch (error) {
    return adminError(error);
  }
}
