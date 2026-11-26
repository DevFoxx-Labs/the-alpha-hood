import { cookies, headers } from "next/headers";
import { connection } from "next/server";
import { staffFromRequest } from "./auth";
import { type Permission, ROLE_PERMISSIONS, type Role } from "./permissions";
import { publicStaff } from "./staff";

/**
 * The signed-in staff member for a server-rendered admin page or layout — the same session check as
 * `requireStaff` (cookie → session → idle timeout → MFA enrolled → not disabled), read from the incoming request.
 * Lets the shell and screens arrive in the first HTML instead of after a client round trip.
 * Returns null when not signed in; pages still call the APIs, which enforce every permission again.
 */
export interface ServerMe {
  staff: { id: string; email: string; name: string; role: Role; mfa: boolean };
  permissions: Permission[];
}

export async function currentStaff() {
  const cookie = (await headers()).get("cookie") ?? "";
  if (!cookie) return null;
  // The session check compares expiry times with the clock: request time only, never a prerender.
  await connection();
  try {
    return await staffFromRequest(new Request("http://admin.internal/", { headers: { cookie } }));
  } catch {
    return null; // backend unavailable: the client falls back to /api/admin/me and its error handling
  }
}

export async function currentMe(): Promise<ServerMe | null> {
  const staff = await currentStaff();
  return staff ? { staff: publicStaff(staff) as ServerMe["staff"], permissions: [...ROLE_PERMISSIONS[staff.role]] } : null;
}

/** Sidebar collapse remembered in a cookie so the server renders the right width (no jump after load). */
export const SIDEBAR_COOKIE = "ah_admin_sidebar";
export async function sidebarCollapsed(): Promise<boolean> {
  return (await cookies()).get(SIDEBAR_COOKIE)?.value === "1";
}
