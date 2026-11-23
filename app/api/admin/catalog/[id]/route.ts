import { audit, requireStaff } from "@/lib/admin/auth";
import { adminError, adminWrite, privateJson } from "@/lib/admin/http";
import { CatalogAdminError, updateProduct } from "@/lib/catalog/admin";
import { catalogAdminDeps } from "@/lib/catalog/admin-deps";
import { PRODUCT_ID_RE } from "@/lib/catalog/reader";
import { jsonError } from "@/lib/http/guard";

/**
 * ADM-01 one product (own backend). GET → the full editable record (incl. its version). PATCH → the full form +
 * the `version` that was loaded; a stale version is refused with 409 (no lost edits). Archiving is a status change
 * — products are never hard-deleted (orders and returns point at them). Audited.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/admin/catalog/[id]">) {
  const auth = await requireStaff(request, "catalog.read");
  if (!auth.ok) return auth.response;
  try {
    const { id } = await ctx.params;
    const deps = catalogAdminDeps();
    if (!deps) throw new CatalogAdminError("catalog_readonly", "Products are managed in the commerce platform for this store.", 409);
    if (!PRODUCT_ID_RE.test(id)) return jsonError(404, "not_found", "Product not found.");
    const product = await deps.store.getRecord(id);
    if (!product) return jsonError(404, "not_found", "Product not found.");
    return privateJson({ product });
  } catch (error) {
    return adminError(error);
  }
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/catalog/[id]">) {
  const w = await adminWrite(request, "catalog.write", "catalog", 16_384);
  if (!w.ok) return w.response;
  try {
    const { id } = await ctx.params;
    const deps = catalogAdminDeps();
    if (!deps) throw new CatalogAdminError("catalog_readonly", "Products are managed in the commerce platform for this store.", 409);
    if (!PRODUCT_ID_RE.test(id)) return jsonError(404, "not_found", "Product not found.");
    const before = await deps.store.getRecord(id);
    const product = await updateProduct(deps, id, w.body);
    await audit(w, "catalog.update", id, {
      sku: product.sku,
      status: product.status,
      price: product.price,
      priceBefore: before?.price ?? null,
      statusBefore: before?.status ?? null,
    });
    return privateJson({ product });
  } catch (error) {
    return adminError(error);
  }
}
