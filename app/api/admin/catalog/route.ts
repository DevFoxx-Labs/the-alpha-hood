import { requireStaff } from "@/lib/admin/auth";
import { adminError, privateJson } from "@/lib/admin/http";
import { commerce } from "@/lib/commerce";

/**
 * ADM-01 catalogue (read-only here). Products are created and edited in the commerce platform's own admin
 * (Shopify / Medusa — PRD §4 decision pending), which this panel links to once chosen.
 */
export async function GET(request: Request) {
  const auth = requireStaff(request, "catalog.read");
  if (!auth.ok) return auth.response;
  const q = (new URL(request.url).searchParams.get("q") ?? "").toLowerCase().slice(0, 60);
  try {
    const [a, b] = await Promise.all([commerce.listProducts({ limit: 60 }), commerce.listProducts({ limit: 60, offset: 60 })]);
    const rows = [...a.products, ...b.products]
      .filter((p) => !q || p.title.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      .map((p) => ({ id: p.id, handle: p.handle, title: p.title, sku: p.sku, category: p.category, price: p.price, mrp: p.mrp, stock: p.sizes.reduce((n, s) => n + s.stock, 0), image: p.images[0] }));
    return privateJson({ rows, total: rows.length });
  } catch (error) {
    return adminError(error);
  }
}
