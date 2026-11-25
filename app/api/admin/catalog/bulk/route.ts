import { audit } from "@/lib/admin/auth";
import { adminError, adminWrite, privateJson } from "@/lib/admin/http";
import { CatalogAdminError } from "@/lib/catalog/admin";
import { catalogAdminDeps } from "@/lib/catalog/admin-deps";
import { bulkUpdate } from "@/lib/catalog/bulk";

/** ADM-01 bulk actions on selected products: one transaction, `catalog.write`, audited. */
export async function POST(request: Request) {
  const w = await adminWrite(request, "catalog.write", "catalog-bulk", 16_384);
  if (!w.ok) return w.response;
  try {
    const deps = catalogAdminDeps();
    if (!deps) throw new CatalogAdminError("catalog_readonly", "Products are managed in the commerce platform for this store.", 409);
    const r = await bulkUpdate(deps, w.body);
    const ids = (w.body as { styleIds: string[] }).styleIds;
    await audit(w, `catalog.bulk.${r.action}`, "catalog", { products: r.products, colours: r.colours, styles: ids.slice(0, 20).join(",") + (ids.length > 20 ? ",…" : "") });
    return privateJson(r);
  } catch (error) {
    return adminError(error);
  }
}
