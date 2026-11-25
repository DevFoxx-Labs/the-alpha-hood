import { audit } from "@/lib/admin/auth";
import { adminError, adminWrite, privateJson } from "@/lib/admin/http";
import { CatalogAdminError } from "@/lib/catalog/admin";
import { catalogAdminDeps } from "@/lib/catalog/admin-deps";
import { saveStyle } from "@/lib/catalog/style";

/** ADM-01 create a product (style) with its colours and sizes in one transaction (`catalog.write`, audited). */
export async function POST(request: Request) {
  const w = await adminWrite(request, "catalog.write", "styles", 196_608);
  if (!w.ok) return w.response;
  try {
    const deps = catalogAdminDeps();
    if (!deps) throw new CatalogAdminError("catalog_readonly", "Products are managed in the commerce platform for this store.", 409);
    const r = await saveStyle(deps, null, w.body);
    await audit(w, "catalog.style.create", r.styleId, { colours: r.created.length, live: r.records.filter((x) => x.status === "active").length });
    return privateJson({ styleId: r.styleId }, { status: 201 });
  } catch (error) {
    return adminError(error);
  }
}
