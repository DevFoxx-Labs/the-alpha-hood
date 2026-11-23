import { resolveAlerts } from "@/lib/alerts/service";
import { guardPublicWrite, jsonError } from "@/lib/http/guard";
import { commerceErrorResponse, privateJson, requireAccount } from "@/lib/http/commerce-http";

/** DELETE /api/account/alerts/[id] — own alerts only (others' ids look missing). */
export async function DELETE(request: Request, ctx: RouteContext<"/api/account/alerts/[id]">) {
  const guard = await guardPublicWrite(request, { name: "alerts-delete", limit: 30, windowMs: 10 * 60_000, maxBytes: 64 });
  if (!guard.ok) return guard.response;
  const auth = requireAccount(request);
  if (!auth.ok) return auth.response;
  try {
    const { id } = await ctx.params;
    if (!(await resolveAlerts().remove(auth.customerId, id))) return jsonError(404, "not_found", "Alert not found.");
    return privateJson({ removed: true });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
