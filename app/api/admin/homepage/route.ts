import { audit, requireStaff } from "@/lib/admin/auth";
import { resolveAlerts } from "@/lib/alerts/service";
import { adminError, adminWrite, privateJson } from "@/lib/admin/http";
import { CatalogAdminError } from "@/lib/catalog/admin";
import { catalogAdminDeps } from "@/lib/catalog/admin-deps";
import { homepageView, saveHomepage } from "@/lib/cms/homepage-admin";

/**
 * Admin → Homepage (own backend): hero slides, campaign band, SEO block.
 * GET: `catalog.read`. PUT `{ revision, hero?, campaign?, seo? }` (each part: content, or null = built-in):
 * `catalog.write`, same-origin, rate-limited, size-capped, validated on the server, audited; stale → 409.
 */
const readonly = () => new CatalogAdminError("catalog_readonly", "The homepage is managed in the commerce platform for this store.", 409);

export async function GET(request: Request) {
  const auth = await requireStaff(request, "catalog.read");
  if (!auth.ok) return auth.response;
  try {
    const deps = catalogAdminDeps();
    if (!deps) throw readonly();
    return privateJson(await homepageView(deps, resolveAlerts()));
  } catch (error) {
    return adminError(error);
  }
}

export async function PUT(request: Request) {
  const w = await adminWrite(request, "catalog.write", "homepage", 65_536);
  if (!w.ok) return w.response;
  try {
    const deps = catalogAdminDeps();
    if (!deps) throw readonly();
    const r = await saveHomepage(deps, w.body);
    await audit(w, "content.homepage", "homepage", { revision: r.revision, ...r.summary });
    return privateJson({ revision: r.revision });
  } catch (error) {
    return adminError(error);
  }
}
