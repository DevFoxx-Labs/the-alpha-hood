import { adminError, adminWrite, privateJson } from "@/lib/admin/http";
import { CatalogAdminError } from "@/lib/catalog/admin";
import { catalogAdminDeps } from "@/lib/catalog/admin-deps";
import { previewCollection } from "@/lib/catalog/taxonomy";

/** Live preview of a collection rule while editing (nothing saved). Rate-limited like every admin write. */
export async function POST(request: Request) {
  const w = await adminWrite(request, "catalog.read", "collection-preview", 16_384);
  if (!w.ok) return w.response;
  try {
    const deps = catalogAdminDeps();
    if (!deps) throw new CatalogAdminError("catalog_readonly", "Collections are managed in the commerce platform for this store.", 409);
    return privateJson(await previewCollection(deps, w.body));
  } catch (error) {
    return adminError(error);
  }
}
