import { audit, requireStaff } from "@/lib/admin/auth";
import { adminError, adminWrite, privateJson } from "@/lib/admin/http";
import { CatalogAdminError } from "@/lib/catalog/admin";
import { catalogAdminDeps } from "@/lib/catalog/admin-deps";
import { saveCategories, taxonomyView } from "@/lib/catalog/taxonomy";

/**
 * Category tree + homepage category rail (own backend). GET: `catalog.read`. PUT replaces the tree and rail with the
 * revision the editor loaded (`catalog.write`, audited; stale → 409; categories still in use → 422).
 */
const readonly = () => new CatalogAdminError("catalog_readonly", "Categories are managed in the commerce platform for this store.", 409);

export async function GET(request: Request) {
  const auth = await requireStaff(request, "catalog.read");
  if (!auth.ok) return auth.response;
  try {
    const deps = catalogAdminDeps();
    if (!deps) throw readonly();
    const v = await taxonomyView(deps);
    return privateJson({ revision: v.revision, tree: v.tree, featured: v.featured, shopAll: v.shopAll, usage: v.usage });
  } catch (error) {
    return adminError(error);
  }
}

export async function PUT(request: Request) {
  const w = await adminWrite(request, "catalog.write", "categories", 131_072);
  if (!w.ok) return w.response;
  try {
    const deps = catalogAdminDeps();
    if (!deps) throw readonly();
    const r = await saveCategories(deps, w.body);
    await audit(w, "catalog.categories", "catalog", { revision: r.revision, ...r.summary });
    return privateJson({ revision: r.revision });
  } catch (error) {
    return adminError(error);
  }
}
