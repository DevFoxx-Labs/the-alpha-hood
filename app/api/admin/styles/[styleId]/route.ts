import { audit, requireStaff } from "@/lib/admin/auth";
import { adminError, adminWrite, privateJson } from "@/lib/admin/http";
import { can } from "@/lib/admin/permissions";
import { resolveAlerts } from "@/lib/alerts/service";
import { CatalogAdminError } from "@/lib/catalog/admin";
import { demandFor } from "@/lib/catalog/hold";
import { catalogAdminDeps } from "@/lib/catalog/admin-deps";
import { getStyle, saveStyle, STYLE_ID_RE } from "@/lib/catalog/style";
import { jsonError } from "@/lib/http/guard";

/**
 * ADM-01 one product (style): GET → shared fields + every colour with its sizes, live stock and versions
 * (`catalog.read`; cost price only for staff who can edit the catalogue). PUT → saves the whole style in one
 * transaction, every colour version-checked (`catalog.write`, audited; stale → 409).
 */
const readonly = () => new CatalogAdminError("catalog_readonly", "Products are managed in the commerce platform for this store.", 409);

export async function GET(request: Request, ctx: RouteContext<"/api/admin/styles/[styleId]">) {
  const auth = await requireStaff(request, "catalog.read");
  if (!auth.ok) return auth.response;
  try {
    const { styleId } = await ctx.params;
    const deps = catalogAdminDeps();
    if (!deps) throw readonly();
    if (!STYLE_ID_RE.test(styleId)) return jsonError(404, "not_found", "Product not found.");
    const style = await getStyle(deps, styleId, can(auth.staff.role, "catalog.write"));
    if (!style) return jsonError(404, "not_found", "Product not found.");
    // "Notify me" sign-ups per colour (counts only) for the "Show as sold out" card.
    const demand = await demandFor(resolveAlerts(), style.variants.map((v) => v.id)).catch(() => null);
    return privateJson({ style, demand });
  } catch (error) {
    return adminError(error);
  }
}

export async function PUT(request: Request, ctx: RouteContext<"/api/admin/styles/[styleId]">) {
  const w = await adminWrite(request, "catalog.write", "styles", 196_608);
  if (!w.ok) return w.response;
  try {
    const { styleId } = await ctx.params;
    const deps = catalogAdminDeps();
    if (!deps) throw readonly();
    if (!STYLE_ID_RE.test(styleId)) return jsonError(404, "not_found", "Product not found.");
    const r = await saveStyle(deps, styleId, w.body);
    await audit(w, "catalog.style.save", r.styleId, { created: r.created.length, updated: r.updated.length, live: r.records.filter((x) => x.status === "active").length });
    return privateJson({ styleId: r.styleId });
  } catch (error) {
    return adminError(error);
  }
}
