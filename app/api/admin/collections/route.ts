import { audit, requireStaff } from "@/lib/admin/auth";
import { adminError, adminWrite, privateJson } from "@/lib/admin/http";
import { CatalogAdminError } from "@/lib/catalog/admin";
import { catalogAdminDeps } from "@/lib/catalog/admin-deps";
import { productChoices, saveCollections, taxonomyView } from "@/lib/catalog/taxonomy";

/**
 * Collections (own backend). GET: list with rule builders (`catalog.read`); `?products=q` searches the product picker.
 * PUT replaces the list with the revision the editor loaded (`catalog.write`, audited; stale → 409).
 */
const readonly = () => new CatalogAdminError("catalog_readonly", "Collections are managed in the commerce platform for this store.", 409);

export async function GET(request: Request) {
  const auth = await requireStaff(request, "catalog.read");
  if (!auth.ok) return auth.response;
  try {
    const deps = catalogAdminDeps();
    if (!deps) throw readonly();
    const q = new URL(request.url).searchParams.get("products");
    if (q !== null) return privateJson({ products: await productChoices(deps, q) });
    const v = await taxonomyView(deps);
    const tree = v.tree.map((c) => ({ handle: c.handle, title: c.title, subcategories: c.subcategories.map((s) => ({ handle: s.handle, title: s.title })) }));
    const records = await deps.store.listRecords();
    const picked = new Set(v.collections.flatMap((c) => c.builder?.conditions.flatMap((x) => (x.type === "productIds" ? (x.values ?? []) : [])) ?? []));
    const productTitles = Object.fromEntries(records.filter((r) => picked.has(r.id)).map((r) => [r.id, r.title]));
    return privateJson({ revision: v.revision, collections: v.collections, tree, productTitles });
  } catch (error) {
    return adminError(error);
  }
}

export async function PUT(request: Request) {
  const w = await adminWrite(request, "catalog.write", "collections", 262_144);
  if (!w.ok) return w.response;
  try {
    const deps = catalogAdminDeps();
    if (!deps) throw readonly();
    const r = await saveCollections(deps, w.body);
    await audit(w, "catalog.collections", "catalog", { revision: r.revision, ...r.summary });
    return privateJson({ revision: r.revision });
  } catch (error) {
    return adminError(error);
  }
}
