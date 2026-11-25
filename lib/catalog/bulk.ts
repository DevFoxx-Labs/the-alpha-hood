import { ValidationError } from "@/lib/http/guard";
import { asObject, rejectUnknownFields } from "@/lib/validation";
import { type CatalogAdminDeps, CatalogAdminError } from "./admin";
import { CatalogConflictError, type ProductRecord } from "./store";
import { STYLE_ID_RE } from "./style";

/**
 * Bulk actions on the products list (ADM-01): publish, unpublish, archive, change category, add / remove a tag — on up
 * to 100 products (styles) at once, every colour of each.
 *
 * One transaction for the whole selection (`writeMany`, every version checked): either all selected products change
 * or none does; a product edited meanwhile makes the action fail with 409 and nothing changes.
 * Threat model: `catalog.write` only (route); style ids must exist; category / sub-category must be in the tree;
 * tags allow-listed; audited by the route.
 */
export const BULK_ACTIONS = ["publish", "unpublish", "archive", "category", "add_tag", "remove_tag"] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];
export const MAX_BULK = 100;
const TAG_RE = /^[a-z0-9][a-z0-9 -]{0,29}$/;

export interface BulkResult {
  action: BulkAction;
  products: number;
  colours: number;
}

export async function bulkUpdate(deps: CatalogAdminDeps, body: unknown, now = new Date()): Promise<BulkResult> {
  const b = asObject(body);
  rejectUnknownFields(b, ["action", "styleIds", "category", "subcategory", "tag"]);
  if (typeof b.action !== "string" || !BULK_ACTIONS.includes(b.action as BulkAction)) throw new ValidationError("Choose an action.");
  const action = b.action as BulkAction;
  if (!Array.isArray(b.styleIds) || b.styleIds.length < 1 || b.styleIds.length > MAX_BULK) throw new ValidationError(`Select 1–${MAX_BULK} products.`);
  const ids = [...new Set(b.styleIds)];
  if (ids.some((x) => typeof x !== "string" || !STYLE_ID_RE.test(x))) throw new ValidationError("Unknown product.");

  const [records, docs] = await Promise.all([deps.store.listRecords(), deps.store.getDocs()]);
  const byStyle = new Map<string, ProductRecord[]>();
  for (const r of records) if (ids.includes(r.styleId)) byStyle.set(r.styleId, [...(byStyle.get(r.styleId) ?? []), r]);
  if (byStyle.size !== ids.length) throw new CatalogAdminError("not_found", "One of the selected products no longer exists. Reload the list.", 404);

  let change: (r: ProductRecord) => ProductRecord | null;
  switch (action) {
    case "publish":
      change = (r) => (r.status === "draft" ? { ...r, status: "active" } : null);
      break;
    case "unpublish":
      change = (r) => (r.status === "active" ? { ...r, status: "draft" } : null);
      break;
    case "archive":
      change = (r) => (r.status !== "archived" ? { ...r, status: "archived" } : null);
      break;
    case "category": {
      const cat = docs?.tree.find((c) => c.handle === b.category);
      if (!cat) throw new ValidationError("Choose a category.");
      let sub: string | undefined;
      if (b.subcategory !== undefined && b.subcategory !== null && b.subcategory !== "") {
        if (!cat.subcategories.some((s) => s.handle === b.subcategory)) throw new ValidationError("Choose a sub-category of this category.");
        sub = b.subcategory as string;
      }
      change = (r) => {
        if (r.category === cat.handle && r.subcategory === sub) return null;
        const next: ProductRecord = { ...r, category: cat.handle };
        if (sub) next.subcategory = sub;
        else delete next.subcategory;
        return next;
      };
      break;
    }
    case "add_tag":
    case "remove_tag": {
      const tag = typeof b.tag === "string" ? b.tag.trim().toLowerCase() : "";
      if (!TAG_RE.test(tag)) throw new ValidationError("Tag: letters, digits, spaces and dashes (max 30 characters).");
      change =
        action === "add_tag"
          ? (r) => {
              if (r.tags.includes(tag)) return null;
              if (r.tags.length >= 12) throw new ValidationError(`“${r.title}” already has 12 tags.`);
              return { ...r, tags: [...r.tags, tag] };
            }
          : (r) => (r.tags.includes(tag) ? { ...r, tags: r.tags.filter((t) => t !== tag) } : null);
      break;
    }
  }

  const replaces: { record: ProductRecord; expectedVersion: number }[] = [];
  const touched = new Set<string>();
  for (const rs of byStyle.values()) {
    for (const r of rs) {
      const next = change(r);
      if (!next) continue;
      replaces.push({ record: { ...next, version: r.version + 1, updatedAt: now.toISOString() }, expectedVersion: r.version });
      touched.add(r.styleId);
    }
  }
  if (replaces.length === 0) return { action, products: 0, colours: 0 };

  let ok: boolean;
  try {
    ok = await deps.store.writeMany([], replaces);
  } catch (e) {
    if (e instanceof CatalogConflictError) throw new CatalogAdminError("conflict", e.message, 409);
    throw e;
  }
  if (!ok) throw new CatalogAdminError("version_conflict", "A selected product was changed meanwhile. Reload the list and try again.", 409);
  deps.invalidate();
  return { action, products: touched.size, colours: replaces.length };
}
