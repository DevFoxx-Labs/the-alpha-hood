import { audit } from "@/lib/admin/auth";
import { adminError, adminWrite, privateJson } from "@/lib/admin/http";
import { resolveAlerts, sweepAlerts } from "@/lib/alerts/service";
import { CatalogAdminError } from "@/lib/catalog/admin";
import { catalogAdminDeps } from "@/lib/catalog/admin-deps";
import { setStyleHold } from "@/lib/catalog/hold";
import { commerce } from "@/lib/commerce";

/**
 * "Show as sold out" (lib/catalog/hold.ts). POST `{ on: boolean, ids?: string[] }` — `ids` = colours of this style
 * (absent = all). `catalog.write`, same-origin, rate-limited, audited; stale product → 409.
 * Switching off puts the real stock back on sale and sends the waiting "back in stock" alerts at once (the cron sweep
 * retries anything that fails here).
 */
export async function POST(request: Request, ctx: RouteContext<"/api/admin/styles/[styleId]/sold-out">) {
  const w = await adminWrite(request, "catalog.write", "styles-hold", 2_048);
  if (!w.ok) return w.response;
  try {
    const { styleId } = await ctx.params;
    const deps = catalogAdminDeps();
    if (!deps) throw new CatalogAdminError("catalog_readonly", "Products are managed in the commerce platform for this store.", 409);
    const r = await setStyleHold(deps, styleId, w.body);
    let notified = 0;
    if (!r.on) {
      for (const id of r.changed) notified += await sweepAlerts({ commerce, alerts: resolveAlerts() }, id).catch(() => 0);
    }
    await audit(w, r.on ? "catalog.style.sold_out_on" : "catalog.style.sold_out_off", r.styleId, { colours: r.changed.length, notified });
    return privateJson({ on: r.on, changed: r.changed, notified });
  } catch (error) {
    return adminError(error);
  }
}
