import { audit } from "@/lib/admin/auth";
import { adminError, adminWrite, privateJson } from "@/lib/admin/http";
import { CatalogAdminError } from "@/lib/catalog/admin";
import { catalogAdminDeps } from "@/lib/catalog/admin-deps";
import { importCatalogCsv, MAX_CSV_BYTES } from "@/lib/catalog/csv";
import { jsonError } from "@/lib/http/guard";
import { rateLimiter } from "@/lib/http/rate-limit";
import { asObject, rejectUnknownFields } from "@/lib/validation";

/**
 * ADM-01 catalogue CSV import. Body `{ csv, apply }`: `apply: false` = plan (dry run, nothing written);
 * `apply: true` = write, only when the plan has no errors (one transaction per product). `catalog.write`, size-capped,
 * rate-limited per staff member (expensive), applied imports audited.
 */
export async function POST(request: Request) {
  const w = await adminWrite(request, "catalog.write", "catalog-import", MAX_CSV_BYTES + 1024);
  if (!w.ok) return w.response;
  if (!(await rateLimiter.hit(`admin-catalog-import:${w.staff.id}`, 60, 60 * 60_000)).ok) return jsonError(429, "rate_limited", "Too many imports. Try again later.");
  try {
    const deps = catalogAdminDeps();
    if (!deps) throw new CatalogAdminError("catalog_readonly", "Products are managed in the commerce platform for this store.", 409);
    const b = asObject(w.body);
    rejectUnknownFields(b, ["csv", "apply"]);
    if (typeof b.apply !== "boolean") return jsonError(422, "invalid_input", "Say whether to apply the import.");
    const report = await importCatalogCsv(deps, b.csv as string, b.apply);
    if (report.applied) {
      await audit(w, "catalog.import_csv", "catalog", { rows: report.totals.rows, created: report.totals.create, updated: report.totals.update, errors: report.totals.errors });
    }
    return privateJson({ report });
  } catch (error) {
    return adminError(error);
  }
}
