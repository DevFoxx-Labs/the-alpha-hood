import type { CatalogAdminDeps } from "@/lib/catalog/admin";
import { revisionOf, write } from "@/lib/catalog/taxonomy";
import { skuKey } from "@/lib/catalog/store";
import { ValidationError } from "@/lib/http/guard";
import { asObject } from "@/lib/validation";
import { BUILTIN_IMAGES, builtInContent, envLandingLayout, type HomepageContent, landingLayout, HOMEPAGE_LIMITS, mediaIdsOf, parseHomepage, productIdsOf } from "./homepage";
import { MOCK_DROP_HOMEPAGE, MOCK_HOMEPAGE } from "./mock-home";

/**
 * Admin → Homepage, server side (one service for the API). Reads and saves `homepage` in the catalogue documents
 * with the same optimistic revision as categories / collections (a stale save → 409, nothing lost).
 */
export async function homepageView(deps: CatalogAdminDeps) {
  const [docs, records, onHand] = await Promise.all([deps.store.getDocs(), deps.store.listRecords(), deps.store.onHand()]);
  const content = docs?.homepage ?? {};
  const picked = new Set(productIdsOf(content));
  // Every colour of each picked style with its live stock per size — the drop's stock at a glance in the editor.
  const byId = new Map(records.map((r) => [r.id, r]));
  const styles: Record<string, { styleId: string; colours: { id: string; colour: string; sku: string; status: string; sizes: { label: string; stock: number }[] }[] }> = {};
  for (const id of picked) {
    const r = byId.get(id);
    if (!r) continue;
    const variants = records.filter((x) => x.styleId === r.styleId);
    styles[id] = {
      styleId: r.styleId,
      colours: variants.map((v) => ({
        id: v.id,
        colour: v.colour.name,
        sku: v.sku,
        status: v.status,
        sizes: v.sizes.map((s) => ({ label: s.label, stock: Math.max(0, onHand.get(skuKey(v.id, s.label)) ?? s.stock) })),
      })),
    };
  }
  return {
    /** Live stock of every colour of each picked product's style (admin-only view). */
    stock: styles,
    /** Titles of the picked products, for the editor's lists. */
    productTitles: Object.fromEntries(records.filter((r) => picked.has(r.id)).map((r) => [r.id, r.title])),
    revision: docs?.revision ?? 0,
    /** `LANDING_LAYOUT` on the server (used while the admin hasn't chosen); null = not set. */
    envLayout: envLandingLayout(),
    /** What the store shows right now (admin choice, else env, else full store). */
    liveLayout: landingLayout(content),
    /** What is saved (a missing part = the built-in content is shown). */
    content,
    /** What the store shows when a part isn't customised — the editor's starting point. */
    builtIn: builtInContent(MOCK_HOMEPAGE, MOCK_DROP_HOMEPAGE),
    builtInImages: BUILTIN_IMAGES,
    limits: HOMEPAGE_LIMITS,
  };
}

export async function saveHomepage(deps: CatalogAdminDeps, body: unknown): Promise<{ revision: number; summary: Record<string, number | boolean> }> {
  const b = asObject(body);
  const expected = revisionOf(b.revision);
  const current = await deps.store.getDocs();
  const homepage: HomepageContent = parseHomepage(b, current?.homepage);
  const ids = mediaIdsOf(homepage);
  if (ids.length) {
    const found = deps.media ? await deps.media.existing(ids) : new Set<string>();
    if (ids.some((id) => !found.has(id))) throw new ValidationError("A photo wasn't found — upload it again.");
  }
  const picked = productIdsOf(homepage);
  if (picked.length) {
    const known = new Set((await deps.store.listRecords()).map((r) => r.id));
    if (picked.some((id) => !known.has(id))) throw new ValidationError("A picked product isn't in the catalogue any more. Pick it again.");
  }
  const revision = await write(deps, current, { homepage }, expected);
  return {
    revision,
    summary: {
      layoutDrop: homepage.layout === "drop",
      dropSpotlights: homepage.drop?.spotlights?.length ?? -1,
      heroSlides: homepage.hero?.length ?? -1,
      campaign: homepage.campaign ? (homepage.campaign.enabled ? 1 : 0) : -1,
      seoLinks: homepage.seo ? homepage.seo.groups.reduce((n, g) => n + g.links.length, 0) : -1,
      ambassador: homepage.ambassador ? (homepage.ambassador.enabled ? homepage.ambassador.productIds.length : 0) : -1,
      limited: homepage.limited ? (homepage.limited.enabled ? homepage.limited.productIds.length : 0) : -1,
    },
  };
}
