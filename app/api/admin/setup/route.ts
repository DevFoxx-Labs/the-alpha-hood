import { NextResponse } from "next/server";
import { AdminAuthError, createOwner, setupAllowed } from "@/lib/admin/auth";
import { adminError } from "@/lib/admin/http";
import { resolveStaffStore } from "@/lib/admin/staff";
import { guardPublicWrite, PRIVATE_NO_STORE } from "@/lib/http/guard";
import { securityEvent } from "@/lib/security/log";
import { asObject, rejectUnknownFields } from "@/lib/validation";

/**
 * First-owner bootstrap (ADM-08). GET → `{ needed }`. POST `{ email, name, password, token? }` works only while no
 * staff exist; in production it also needs ADMIN_SETUP_TOKEN. The owner then enrols TOTP on first sign-in.
 */
export async function GET() {
  try {
    return NextResponse.json({ needed: resolveStaffStore().staff.size === 0 }, { headers: PRIVATE_NO_STORE });
  } catch (error) {
    return adminError(error);
  }
}

export async function POST(request: Request) {
  const guard = await guardPublicWrite(request, { name: "admin-setup", limit: 5, windowMs: 60 * 60_000, maxBytes: 1_024 });
  if (!guard.ok) return guard.response;
  try {
    const input = asObject(guard.body);
    rejectUnknownFields(input, ["email", "name", "password", "token"]);
    const store = resolveStaffStore();
    if (!setupAllowed(store, input.token)) throw new AdminAuthError(403, "setup_closed", "Setup is closed.");
    const owner = await createOwner(store, { email: input.email, name: input.name, password: input.password });
    securityEvent("login", { staff: owner.id, kind: "admin_bootstrap" });
    return NextResponse.json({ ok: true }, { status: 201, headers: PRIVATE_NO_STORE });
  } catch (error) {
    return adminError(error);
  }
}
