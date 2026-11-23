import { CatalogAdminError } from "@/lib/catalog/admin";
import { commerceErrorResponse, privateJson } from "@/lib/http/commerce-http";
import { guardPublicWrite, jsonError } from "@/lib/http/guard";
import { AdminAuthError, requireStaff } from "./auth";
import { OpsError } from "./ops";
import type { Permission } from "./permissions";
import type { Staff } from "./staff";

/** Admin write: same-origin + per-IP limit + JSON cap (guardPublicWrite), then staff + permission. */
export async function adminWrite(
  request: Request,
  permission: Permission,
  name: string,
  maxBytes = 2_048,
): Promise<{ ok: true; staff: Staff; ip: string; body: unknown } | { ok: false; response: Response }> {
  const guard = await guardPublicWrite(request, { name: `admin-${name}`, limit: 120, windowMs: 60_000, maxBytes });
  if (!guard.ok) return guard;
  const auth = requireStaff(request, permission);
  if (!auth.ok) return auth;
  return { ok: true, staff: auth.staff, ip: auth.ip, body: guard.body };
}

export function adminError(error: unknown): Response {
  if (error instanceof AdminAuthError || error instanceof OpsError || error instanceof CatalogAdminError) return jsonError(error.status, error.code, error.message);
  return commerceErrorResponse(error);
}

export { privateJson };
