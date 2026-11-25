import { audit, requireStaff } from "@/lib/admin/auth";
import { adminError } from "@/lib/admin/http";
import { can } from "@/lib/admin/permissions";
import { CatalogAdminError } from "@/lib/catalog/admin";
import { catalogAdminDeps } from "@/lib/catalog/admin-deps";
import { exportCatalogCsv } from "@/lib/catalog/csv";
import { jsonError } from "@/lib/http/guard";
import { rateLimiter } from "@/lib/http/rate-limit";

/**
 * ADM-01 catalogue CSV export (one row per size). `catalog.read`; the cost price column only for staff who can edit
 * the catalogue. Formula cells neutralised. Rate-limited and audited (it is a bulk data download).
 */
export async function GET(request: Request) {
  const auth = await requireStaff(request, "catalog.read");
  if (!auth.ok) return auth.response;
  if (!(await rateLimiter.hit(`admin-catalog-export:${auth.staff.id}`, 20, 60 * 60_000)).ok) return jsonError(429, "rate_limited", "Too many exports. Try again later.");
  try {
    const deps = catalogAdminDeps();
    if (!deps) throw new CatalogAdminError("catalog_readonly", "Products are managed in the commerce platform for this store.", 409);
    const withCost = can(auth.staff.role, "catalog.write");
    const { csv, rows } = await exportCatalogCsv(deps, withCost);
    await audit(auth, "catalog.export_csv", "catalog", { rows, withCost });
    const day = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="products-${day}.csv"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return adminError(error);
  }
}
