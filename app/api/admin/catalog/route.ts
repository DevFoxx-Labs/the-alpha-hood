import { audit, requireStaff } from "@/lib/admin/auth";
import { adminError, adminWrite, privateJson } from "@/lib/admin/http";
import { adminRow, CatalogAdminError, createProduct } from "@/lib/catalog/admin";
import { catalogAdminDeps } from "@/lib/catalog/admin-deps";
import { PRODUCT_STATUSES, type ProductStatus } from "@/lib/catalog/store";
import { styleRows } from "@/lib/catalog/style";
import { commerce } from "@/lib/commerce";

/**
 * ADM-01 catalogue. GET ?q=&status= lists products; ?view=options returns only the editor's choices. On the own backend (COMMERCE_PROVIDER=own) the list includes
 * drafts and archived products and POST creates one (`catalog.write`, audited). On any other provider the catalogue
 * is managed in that platform and this is read-only.
 */
export async function GET(request: Request) {
  const auth = await requireStaff(request, "catalog.read");
  if (!auth.ok) return auth.response;
  const p = new URL(request.url).searchParams;
  const q = (p.get("q") ?? "").toLowerCase().slice(0, 60);
  const statusParam = p.get("status");
  const status = PRODUCT_STATUSES.includes(statusParam as ProductStatus) ? (statusParam as ProductStatus) : null;
  const match = (title: string, sku: string) => !q || title.toLowerCase().includes(q) || sku.toLowerCase().includes(q);
  try {
    const deps = catalogAdminDeps();
    if (deps) {
      const [records, docs, onHand] = await Promise.all([deps.store.listRecords(), deps.store.getDocs(), deps.store.onHand()]);
      const styles = [...new Map(records.map((r) => [r.styleId, r.title.split(" — ")[0]])).entries()].map(([id, title]) => ({ id, title }));
      const options = { tree: (docs?.tree ?? []).map((c) => ({ handle: c.handle, title: c.title, subcategories: c.subcategories.map((s) => ({ handle: s.handle, title: s.title })) })), styles };
      // The editor only needs the form choices.
      if (p.get("view") === "options") return privateJson({ editable: true, options });
      // Products list: one row per style (product) with its colours.
      if (p.get("view") === "styles") {
        const rows = styleRows(records, onHand, q, status);
        return privateJson({ editable: true, rows: rows.slice(0, 500), total: rows.length });
      }
      const rows = records.filter((r) => match(r.title, r.sku) && (!status || r.status === status)).map((r) => adminRow(r, onHand));
      return privateJson({ editable: true, rows: rows.slice(0, 500), total: rows.length, options });
    }
    if (p.get("view") === "options") return privateJson({ editable: false, options: null });
    const [a, b] = await Promise.all([commerce.listProducts({ limit: 60 }), commerce.listProducts({ limit: 60, offset: 60 })]);
    const rows = [...a.products, ...b.products]
      .filter((x) => match(x.title, x.sku))
      .map((x) => ({ id: x.id, handle: x.handle, title: x.title, sku: x.sku, category: x.category, price: x.price, mrp: x.mrp, status: "active", stock: x.sizes.reduce((n, s) => n + s.stock, 0), image: x.images[0], updatedAt: x.createdAt }));
    return privateJson({ editable: false, rows, total: rows.length, options: null });
  } catch (error) {
    return adminError(error);
  }
}

export async function POST(request: Request) {
  const w = await adminWrite(request, "catalog.write", "catalog", 16_384);
  if (!w.ok) return w.response;
  try {
    const deps = catalogAdminDeps();
    if (!deps) throw new CatalogAdminError("catalog_readonly", "Products are managed in the commerce platform for this store.", 409);
    const record = await createProduct(deps, w.body);
    await audit(w, "catalog.create", record.id, { sku: record.sku, status: record.status, price: record.price });
    return privateJson({ product: record }, { status: 201 });
  } catch (error) {
    return adminError(error);
  }
}
