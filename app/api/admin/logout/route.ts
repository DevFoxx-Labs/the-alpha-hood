import { NextResponse } from "next/server";
import { adminTokenFrom, clearAdminCookie } from "@/lib/admin/auth";
import { resolveStaffStore } from "@/lib/admin/staff";
import { sha256 } from "@/lib/auth/secrets";
import { guardPublicWrite, PRIVATE_NO_STORE } from "@/lib/http/guard";

/** POST `{}` — ends this admin session. */
export async function POST(request: Request) {
  const guard = await guardPublicWrite(request, { name: "admin-logout", limit: 30, windowMs: 10 * 60_000, maxBytes: 64 });
  if (!guard.ok) return guard.response;
  const token = adminTokenFrom(request);
  try {
    if (token) resolveStaffStore().sessions.delete(sha256(token));
  } catch {
    // store unavailable — clearing the cookie is still right
  }
  const response = NextResponse.json({ ok: true }, { headers: PRIVATE_NO_STORE });
  clearAdminCookie(response);
  return response;
}
