import type { CatalogAdminDeps } from "@/lib/catalog/admin";
import { revisionOf, write } from "@/lib/catalog/taxonomy";
import { ValidationError } from "@/lib/http/guard";
import { asObject } from "@/lib/validation";
import { BUILTIN_IMAGES, builtInContent, type HomepageContent, HOMEPAGE_LIMITS, mediaIdsOf, parseHomepage } from "./homepage";
import { MOCK_HOMEPAGE } from "./mock-home";

/**
 * Admin → Homepage, server side (one service for the API). Reads and saves `homepage` in the catalogue documents
 * with the same optimistic revision as categories / collections (a stale save → 409, nothing lost).
 */
export async function homepageView(deps: CatalogAdminDeps) {
  const docs = await deps.store.getDocs();
  const content = docs?.homepage ?? {};
  return {
    revision: docs?.revision ?? 0,
    /** What is saved (a missing part = the built-in content is shown). */
    content,
    /** What the store shows when a part isn't customised — the editor's starting point. */
    builtIn: builtInContent(MOCK_HOMEPAGE),
    builtInImages: BUILTIN_IMAGES,
    limits: HOMEPAGE_LIMITS,
  };
}

export async function saveHomepage(deps: CatalogAdminDeps, body: unknown): Promise<{ revision: number; summary: Record<string, number> }> {
  const b = asObject(body);
  const expected = revisionOf(b.revision);
  const current = await deps.store.getDocs();
  const homepage: HomepageContent = parseHomepage(b, current?.homepage);
  const ids = mediaIdsOf(homepage);
  if (ids.length) {
    const found = deps.media ? await deps.media.existing(ids) : new Set<string>();
    if (ids.some((id) => !found.has(id))) throw new ValidationError("A photo wasn't found — upload it again.");
  }
  const revision = await write(deps, current, { homepage }, expected);
  return {
    revision,
    summary: {
      heroSlides: homepage.hero?.length ?? -1,
      campaign: homepage.campaign ? (homepage.campaign.enabled ? 1 : 0) : -1,
      seoLinks: homepage.seo ? homepage.seo.groups.reduce((n, g) => n + g.links.length, 0) : -1,
    },
  };
}
