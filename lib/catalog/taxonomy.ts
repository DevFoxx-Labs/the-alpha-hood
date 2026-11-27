import { ANNOUNCEMENTS, HEADER_LINKS, MENU } from "@/lib/cms/mock";
import { MOCK_HOMEPAGE, MOCK_LISTING_TILE } from "@/lib/cms/mock-home";
import type { CategoryNode, Category, GarmentKind, ProductImage } from "@/lib/commerce/types";
import { ValidationError } from "@/lib/http/guard";
import { COMBOS } from "@/lib/promotions/combos";
import { asObject, cleanText, rejectUnknownFields } from "@/lib/validation";
import { type CatalogAdminDeps, CatalogAdminError, MAX_PRICE } from "./admin";
import { ATTRIBUTE_VALUES, SIZE_ORDER } from "./attributes";
import { type CollectionRule, matchesRule } from "./collection-rules";
import { MEDIA_ID_RE, mediaUrl } from "./media";
import { GARMENT_KINDS } from "./product-options";
import { HANDLE_RE } from "./reader";
import { buildSnapshot, type CatalogDocs, type ProductRecord } from "./store";

/**
 * Category tree, homepage category rail and collections — edited in /admin on the own backend.
 *
 * Threat model (catalog.write staff, or a stolen staff session):
 * - every field is allow-listed and length-capped on the server; handles are slugs; images are either a fixed
 *   placeholder drawing or a photo that was uploaded to our own media store (no URLs from the client, no SSRF);
 * - a category, sub-category or collection that products, combos or storefront links still use can't be removed
 *   (it would orphan products and break pages);
 * - saves carry the revision the editor loaded; a stale save is refused with 409 (no lost updates);
 * - collection rules are built from a fixed list of conditions with validated values, never stored as free JSON.
 * Every save is audited by the route.
 */

export const LIMITS = { categories: 60, subcategories: 30, featured: 12, collections: 100, conditions: 12, products: 200 } as const;

// ── View ─────────────────────────────────────────────────────────────────────────────────────────

export type ConditionType =
  | "category"
  | "subcategory"
  | "attribute"
  | "badge"
  | "newWithinDays"
  | "minPopularity"
  | "minPercentOff"
  | "maxPrice"
  | "sizeInStock"
  | "productIds";
export const CONDITION_TYPES: readonly ConditionType[] = ["category", "subcategory", "attribute", "badge", "newWithinDays", "minPopularity", "minPercentOff", "maxPrice", "sizeInStock", "productIds"];

/** One row of the collection rule builder. */
export interface Condition {
  type: ConditionType;
  /** category / subcategory handles, attribute values or product ids. */
  values?: string[];
  /** attribute key (fit, fabric…). */
  key?: string;
  /** badge or size label. */
  value?: string;
  /** number of days, percent, popularity or price in paise. */
  amount?: number;
  /** true = products matching this condition are left OUT. */
  exclude?: boolean;
}

export interface RuleBuilder {
  match: "all" | "any";
  conditions: Condition[];
}

export interface CollectionView {
  handle: string;
  title: string;
  description?: string;
  /** null = a rule shape the builder can't show (imported); it is kept as it is unless replaced. */
  builder: RuleBuilder | null;
  /** Combos / storefront links that point at this collection (it can't be removed while used). */
  usedBy: string[];
}

export interface TaxonomyView {
  revision: number;
  tree: CategoryNode[];
  featured: Category[];
  /** Shop all page categories in order; null = every category. */
  shopAll: string[] | null;
  collections: CollectionView[];
  /** Products (any status) per category and per `category/subcategory`. */
  usage: Record<string, number>;
}

const key = (category: string, sub?: string) => (sub ? `${category}/${sub}` : category);

function usageOf(records: ProductRecord[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of records) {
    out[r.category] = (out[r.category] ?? 0) + 1;
    if (r.subcategory) out[key(r.category, r.subcategory)] = (out[key(r.category, r.subcategory)] ?? 0) + 1;
  }
  return out;
}

/** Collections that combos and the storefront content link to (until the CMS moves to the database). */
export function collectionReferences(): Map<string, string[]> {
  const refs = new Map<string, string[]>();
  const add = (handle: string, by: string) => refs.set(handle, [...new Set([...(refs.get(handle) ?? []), by])]);
  for (const c of COMBOS) add(c.collection, `Combo “${c.title}”`);
  const content: [string, unknown][] = [
    ["Homepage", MOCK_HOMEPAGE],
    ["Menu", MENU],
    ["Header links", HEADER_LINKS],
    ["Announcement bar", ANNOUNCEMENTS],
    ["Listing tile", MOCK_LISTING_TILE],
  ];
  for (const [by, data] of content) for (const m of JSON.stringify(data).matchAll(/\/collections\/([a-z0-9-]+)/g)) add(m[1], by);
  return refs;
}

const isCondition = (r: Record<string, unknown>) => Object.keys(r).length > 0 && !("any" in r) && !("all" in r);

function conditionFromRule(rule: CollectionRule): Condition | null {
  const r = rule as Record<string, unknown>;
  if ("not" in r) {
    const inner = r.not as Record<string, unknown>;
    if (!inner || typeof inner !== "object" || !isCondition(inner) || "not" in inner) return null;
    const c = conditionFromRule(inner as CollectionRule);
    return c ? { ...c, exclude: true } : null;
  }
  if (Array.isArray(r.category)) return { type: "category", values: r.category as string[] };
  if (Array.isArray(r.subcategory)) return { type: "subcategory", values: r.subcategory as string[] };
  if (Array.isArray(r.productIds)) return { type: "productIds", values: r.productIds as string[] };
  if (typeof r.attribute === "string" && Array.isArray(r.values)) return { type: "attribute", key: r.attribute, values: r.values as string[] };
  if (typeof r.badge === "string") return { type: "badge", value: r.badge };
  if (typeof r.sizeInStock === "string") return { type: "sizeInStock", value: r.sizeInStock };
  for (const t of ["newWithinDays", "minPopularity", "minPercentOff", "maxPrice"] as const) if (typeof r[t] === "number") return { type: t, amount: r[t] as number };
  return null;
}

/** Stored rule → builder rows, or null when the shape is deeper than the builder can show. */
export function builderFromRule(rule: CollectionRule): RuleBuilder | null {
  const r = rule as Record<string, unknown>;
  const group = Array.isArray(r.all) ? "all" : Array.isArray(r.any) ? "any" : null;
  const list = group ? (r[group] as CollectionRule[]) : [rule];
  const conditions = list.map(conditionFromRule);
  if (conditions.some((c) => c === null)) return null;
  return { match: group ?? "all", conditions: conditions as Condition[] };
}

function conditionToRule(c: Condition): CollectionRule {
  let rule: CollectionRule;
  switch (c.type) {
    case "category":
      rule = { category: c.values! };
      break;
    case "subcategory":
      rule = { subcategory: c.values! };
      break;
    case "productIds":
      rule = { productIds: c.values! };
      break;
    case "attribute":
      rule = { attribute: c.key as "fit", values: c.values! };
      break;
    case "badge":
      rule = { badge: c.value as "NEW" };
      break;
    case "sizeInStock":
      rule = { sizeInStock: c.value! };
      break;
    default:
      rule = { [c.type]: c.amount! } as CollectionRule;
  }
  return c.exclude ? { not: rule } : rule;
}

/** Builder rows → the stored rule. One plain condition is stored on its own (same shape as the demo data). */
export function ruleFromBuilder(b: RuleBuilder): CollectionRule {
  const rules = b.conditions.map(conditionToRule);
  if (rules.length === 1 && !b.conditions[0].exclude) return rules[0];
  return b.match === "any" ? { any: rules } : { all: rules };
}

export async function taxonomyView(deps: CatalogAdminDeps): Promise<TaxonomyView> {
  const [docs, records] = await Promise.all([deps.store.getDocs(), deps.store.listRecords()]);
  const refs = collectionReferences();
  return {
    revision: docs?.revision ?? 0,
    tree: docs?.tree ?? [],
    featured: docs?.featured ?? [],
    shopAll: docs?.shopAll ?? null,
    collections: (docs?.collections ?? []).map((c) => ({
      handle: c.handle,
      title: c.title,
      ...(c.description ? { description: c.description } : {}),
      builder: builderFromRule(c.rule),
      usedBy: refs.get(c.handle) ?? [],
    })),
    usage: usageOf(records),
  };
}

// ── Parsing ──────────────────────────────────────────────────────────────────────────────────────

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function handleOf(v: unknown, where: string): string {
  if (typeof v !== "string" || !HANDLE_RE.test(v) || v.length > 60 || v.startsWith("-") || v.endsWith("-")) {
    throw new ValidationError(`${where}: URL handle must be 1–60 lower-case letters, digits and dashes.`);
  }
  return v;
}

export function revisionOf(v: unknown): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) throw new ValidationError("Missing revision — reload the page.");
  return v;
}

/** Image: a placeholder drawing (art + colour) and optionally an uploaded photo (media id). */
function parseImage(raw: unknown, where: string, photos: Set<string>): ProductImage {
  const o = asObject(raw);
  rejectUnknownFields(o, ["art", "colour", "alt", "photo"]);
  if (typeof o.art !== "string" || !GARMENT_KINDS.includes(o.art as GarmentKind)) throw new ValidationError(`${where}: choose a valid placeholder drawing.`);
  if (typeof o.colour !== "string" || !HEX_RE.test(o.colour)) throw new ValidationError(`${where}: colour must be a hex value like #1b1b1b.`);
  const alt = cleanText(o.alt, `${where}: image description`, { min: 2, max: 80 });
  const image: ProductImage = { art: o.art as GarmentKind, colour: o.colour.toLowerCase(), alt };
  if (o.photo !== undefined && o.photo !== null && o.photo !== "") {
    if (typeof o.photo !== "string" || !MEDIA_ID_RE.test(o.photo)) throw new ValidationError(`${where}: unknown photo.`);
    photos.add(o.photo);
    image.url = mediaUrl(o.photo);
  }
  return image;
}

async function checkPhotos(deps: CatalogAdminDeps, photos: Set<string>) {
  if (photos.size === 0) return;
  const found = deps.media ? await deps.media.existing([...photos]) : new Set<string>();
  if ([...photos].some((p) => !found.has(p))) throw new ValidationError("A photo wasn't found — upload it again.");
}

export function parseTree(raw: unknown, photos: Set<string>): CategoryNode[] {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > LIMITS.categories) throw new ValidationError(`Add 1–${LIMITS.categories} categories.`);
  const seen = new Set<string>();
  return raw.map((c, i) => {
    const o = asObject(c);
    rejectUnknownFields(o, ["handle", "title", "image", "subcategories"]);
    const handle = handleOf(o.handle, `Category ${i + 1}`);
    if (seen.has(handle)) throw new ValidationError(`Two categories use the handle “${handle}”.`);
    seen.add(handle);
    const title = cleanText(o.title, `Category ${i + 1} name`, { min: 2, max: 60 });
    const subsIn = o.subcategories === undefined ? [] : o.subcategories;
    if (!Array.isArray(subsIn) || subsIn.length > LIMITS.subcategories) throw new ValidationError(`${title}: at most ${LIMITS.subcategories} sub-categories.`);
    const subSeen = new Set<string>();
    const subcategories = subsIn.map((s, j) => {
      const so = asObject(s);
      rejectUnknownFields(so, ["handle", "title", "image"]);
      const sh = handleOf(so.handle, `${title} › sub-category ${j + 1}`);
      if (subSeen.has(sh)) throw new ValidationError(`${title}: two sub-categories use the handle “${sh}”.`);
      subSeen.add(sh);
      const st = cleanText(so.title, `${title} › sub-category ${j + 1} name`, { min: 2, max: 60 });
      return { handle: sh, title: st, image: parseImage(so.image, `${title} › ${st}`, photos) };
    });
    return { handle, title, image: parseImage(o.image, title, photos), subcategories };
  });
}

export function parseFeatured(raw: unknown, tree: CategoryNode[], photos: Set<string>): Category[] {
  const list = raw === undefined ? [] : raw;
  if (!Array.isArray(list) || list.length > LIMITS.featured) throw new ValidationError(`The homepage rail holds at most ${LIMITS.featured} tiles.`);
  return list.map((f, i) => {
    const o = asObject(f);
    rejectUnknownFields(o, ["handle", "title", "image", "subcategory"]);
    const cat = tree.find((c) => c.handle === o.handle);
    if (!cat) throw new ValidationError(`Rail tile ${i + 1}: choose a category from the tree.`);
    let href: string | undefined;
    if (o.subcategory !== undefined && o.subcategory !== null && o.subcategory !== "") {
      const sub = cat.subcategories.find((s) => s.handle === o.subcategory);
      if (!sub) throw new ValidationError(`Rail tile ${i + 1}: choose a sub-category of ${cat.title}.`);
      href = `/men/${cat.handle}/${sub.handle}`;
    }
    const title = cleanText(o.title, `Rail tile ${i + 1} label`, { min: 2, max: 60 });
    return { handle: cat.handle, title, image: parseImage(o.image, `Rail tile “${title}”`, photos), ...(href ? { href } : {}) };
  });
}

function stringList(v: unknown, where: string, allowed: (s: string) => boolean, max: number): string[] {
  if (!Array.isArray(v) || v.length < 1 || v.length > max) throw new ValidationError(`${where}: choose 1–${max} values.`);
  const out = [...new Set(v.map((x) => (typeof x === "string" ? x : "")))];
  if (out.some((x) => !allowed(x))) throw new ValidationError(`${where}: one of the chosen values doesn't exist.`);
  return out;
}

function amountOf(v: unknown, where: string, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min || v > max) throw new ValidationError(`${where}: enter a whole number between ${min} and ${max}.`);
  return v;
}

export function parseBuilder(raw: unknown, ctx: { tree: CategoryNode[]; productIds: Set<string> }, where: string): RuleBuilder {
  const o = asObject(raw);
  rejectUnknownFields(o, ["match", "conditions"]);
  if (o.match !== "all" && o.match !== "any") throw new ValidationError(`${where}: choose “all conditions” or “any condition”.`);
  if (!Array.isArray(o.conditions) || o.conditions.length < 1 || o.conditions.length > LIMITS.conditions) {
    throw new ValidationError(`${where}: add 1–${LIMITS.conditions} conditions.`);
  }
  const categories = new Set(ctx.tree.map((c) => c.handle));
  const subcategories = new Set(ctx.tree.flatMap((c) => c.subcategories.map((s) => s.handle)));
  const conditions = o.conditions.map((c, i): Condition => {
    const x = asObject(c);
    rejectUnknownFields(x, ["type", "values", "key", "value", "amount", "exclude"]);
    const at = `${where}, condition ${i + 1}`;
    if (typeof x.type !== "string" || !CONDITION_TYPES.includes(x.type as ConditionType)) throw new ValidationError(`${at}: choose a condition.`);
    if (x.exclude !== undefined && typeof x.exclude !== "boolean") throw new ValidationError(`${at}: invalid include / exclude.`);
    const exclude = x.exclude === true ? { exclude: true } : {};
    const type = x.type as ConditionType;
    switch (type) {
      case "category":
        return { type, values: stringList(x.values, at, (s) => categories.has(s), LIMITS.categories), ...exclude };
      case "subcategory":
        return { type, values: stringList(x.values, at, (s) => subcategories.has(s), 60), ...exclude };
      case "productIds":
        return { type, values: stringList(x.values, at, (s) => ctx.productIds.has(s), LIMITS.products), ...exclude };
      case "attribute": {
        if (typeof x.key !== "string" || !Object.hasOwn(ATTRIBUTE_VALUES, x.key)) throw new ValidationError(`${at}: choose an attribute.`);
        const values = ATTRIBUTE_VALUES[x.key as keyof typeof ATTRIBUTE_VALUES];
        return { type, key: x.key, values: stringList(x.values, at, (s) => Object.hasOwn(values, s), 20), ...exclude };
      }
      case "badge":
        if (x.value !== "NEW" && x.value !== "BESTSELLER") throw new ValidationError(`${at}: choose a badge.`);
        return { type, value: x.value, ...exclude };
      case "sizeInStock":
        if (typeof x.value !== "string" || !SIZE_ORDER.includes(x.value)) throw new ValidationError(`${at}: choose a size.`);
        return { type, value: x.value, ...exclude };
      case "newWithinDays":
        return { type, amount: amountOf(x.amount, at, 1, 365), ...exclude };
      case "minPopularity":
        return { type, amount: amountOf(x.amount, at, 0, 1_000_000), ...exclude };
      case "minPercentOff":
        return { type, amount: amountOf(x.amount, at, 1, 90), ...exclude };
      case "maxPrice":
        return { type, amount: amountOf(x.amount, at, 100, MAX_PRICE), ...exclude };
    }
  });
  if (conditions.every((c) => c.exclude)) throw new ValidationError(`${where}: add at least one condition that includes products.`);
  return { match: o.match, conditions };
}

// ── Saves ────────────────────────────────────────────────────────────────────────────────────────

/** Saves the documents. Fields a save doesn't set (homepage content, Shop all list…) are kept as they are. */
export async function write(deps: CatalogAdminDeps, current: CatalogDocs | null, next: Partial<Omit<CatalogDocs, "revision">>, expected: number) {
  if ((current?.revision ?? 0) !== expected) throw stale();
  const merged: Omit<CatalogDocs, "revision"> = { tree: [], featured: [], collections: [], ...current, ...next };
  const ok = await deps.store.replaceDocs({ ...merged, revision: expected + 1 }, expected);
  if (!ok) throw stale();
  deps.invalidate();
  return expected + 1;
}
const stale = () => new CatalogAdminError("version_conflict", "Someone else changed the categories or collections. Reload to see their changes.", 409);

export interface SaveResult {
  revision: number;
  /** Counts for the audit log. */
  summary: Record<string, number>;
}

/**
 * Which top-level categories the "Shop all" page (/men) shows, in order. Handles must be in the tree, no repeats.
 * `undefined` in the body = leave as it is; `null` = show every category (the default).
 */
export function parseShopAll(raw: unknown, tree: CategoryNode[]): string[] | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (!Array.isArray(raw) || raw.length > LIMITS.categories) throw new ValidationError("Choose the categories for the Shop all page.");
  const known = new Set(tree.map((c) => c.handle));
  const seen = new Set<string>();
  for (const h of raw) {
    if (typeof h !== "string" || !known.has(h)) throw new ValidationError("A Shop all category isn't in the category list any more. Reload and try again.");
    if (seen.has(h)) throw new ValidationError("A category is listed twice on the Shop all page.");
    seen.add(h);
  }
  return raw as string[];
}

/** Top-level categories for the Shop all page: the admin's list in its order, or every category when none is set. */
export function shopAllCategories<T extends { handle: string }>(tree: T[], shopAll: string[] | null | undefined): T[] {
  if (!shopAll) return tree;
  const byHandle = new Map(tree.map((c) => [c.handle, c]));
  return shopAll.map((h) => byHandle.get(h)).filter((c): c is T => !!c);
}

/** Replaces the category tree and the homepage rail. Categories products still use can't be removed. */
export async function saveCategories(deps: CatalogAdminDeps, body: unknown): Promise<SaveResult> {
  const b = asObject(body);
  rejectUnknownFields(b, ["revision", "tree", "featured", "shopAll"]);
  const expected = revisionOf(b.revision);
  const photos = new Set<string>();
  const tree = parseTree(b.tree, photos);
  const featured = parseFeatured(b.featured, tree, photos);
  const shopAllIn = parseShopAll(b.shopAll, tree);
  await checkPhotos(deps, photos);

  const [current, records] = await Promise.all([deps.store.getDocs(), deps.store.listRecords()]);
  const usage = usageOf(records);
  const kept = new Set(tree.flatMap((c) => [c.handle, ...c.subcategories.map((s) => key(c.handle, s.handle))]));
  for (const [k, n] of Object.entries(usage)) {
    if (kept.has(k)) continue;
    const label = k.includes("/") ? `Sub-category “${k}”` : `Category “${k}”`;
    throw new ValidationError(`${label} is used by ${n} product${n === 1 ? "" : "s"} (drafts and archived included). Move them to another category first.`);
  }
  // Collection rules pointing at a removed category would silently stop matching: refuse instead.
  const subs = new Set(tree.flatMap((c) => c.subcategories.map((s) => s.handle)));
  const cats = new Set(tree.map((c) => c.handle));
  for (const c of current?.collections ?? []) {
    const bld = builderFromRule(c.rule);
    for (const cond of bld?.conditions ?? []) {
      const missing = cond.type === "category" ? cond.values?.find((v) => !cats.has(v)) : cond.type === "subcategory" ? cond.values?.find((v) => !subs.has(v)) : undefined;
      if (missing) throw new ValidationError(`Collection “${c.title}” uses “${missing}”. Change that collection first.`);
    }
  }
  // Shop all list: the new one, or the stored one minus categories that were just removed.
  const kept2 = new Set(tree.map((c) => c.handle));
  const shopAll = shopAllIn !== undefined ? shopAllIn : current?.shopAll ? current.shopAll.filter((h) => kept2.has(h)) : null;
  const revision = await write(deps, current, { tree, featured, shopAll }, expected);
  return { revision, summary: { categories: tree.length, subcategories: tree.reduce((n, c) => n + c.subcategories.length, 0), railTiles: featured.length, shopAll: shopAll?.length ?? -1 } };
}

/**
 * Replaces the collection list. Each entry either carries a `builder` (validated → stored rule) or
 * `keepRule: true` for an existing collection whose imported rule the builder can't show.
 */
export async function saveCollections(deps: CatalogAdminDeps, body: unknown): Promise<SaveResult> {
  const b = asObject(body);
  rejectUnknownFields(b, ["revision", "collections"]);
  const expected = revisionOf(b.revision);
  const [current, records] = await Promise.all([deps.store.getDocs(), deps.store.listRecords()]);
  const tree = current?.tree ?? [];
  const ctx = { tree, productIds: new Set(records.map((r) => r.id)) };
  const before = new Map((current?.collections ?? []).map((c) => [c.handle, c]));

  if (!Array.isArray(b.collections) || b.collections.length > LIMITS.collections) throw new ValidationError(`At most ${LIMITS.collections} collections.`);
  const seen = new Set<string>();
  const collections = b.collections.map((raw, i) => {
    const o = asObject(raw);
    rejectUnknownFields(o, ["handle", "title", "description", "builder", "keepRule"]);
    const handle = handleOf(o.handle, `Collection ${i + 1}`);
    if (seen.has(handle)) throw new ValidationError(`Two collections use the handle “${handle}”.`);
    seen.add(handle);
    const title = cleanText(o.title, `Collection ${i + 1} name`, { min: 2, max: 60 });
    const description = o.description === undefined || o.description === null || o.description === "" ? undefined : cleanText(o.description, `${title}: description`, { max: 200 });
    let rule: CollectionRule;
    if (o.keepRule === true) {
      const prev = before.get(handle);
      if (!prev) throw new ValidationError(`${title}: add at least one condition.`);
      rule = prev.rule;
    } else {
      rule = ruleFromBuilder(parseBuilder(o.builder, ctx, title));
    }
    return { handle, title, ...(description ? { description } : {}), rule };
  });

  const refs = collectionReferences();
  for (const h of before.keys()) {
    if (seen.has(h) || !refs.has(h)) continue;
    throw new ValidationError(`Collection “${h}” is used by ${refs.get(h)!.join(", ")}. Remove those links first.`);
  }
  const revision = await write(deps, current, { collections }, expected);
  return { revision, summary: { collections: collections.length } };
}

/** How many live products a draft rule matches (and a few of them) — nothing is saved. */
export async function previewCollection(deps: CatalogAdminDeps, body: unknown, now = Date.now()) {
  const b = asObject(body);
  rejectUnknownFields(b, ["builder"]);
  const [docs, records, onHand] = await Promise.all([deps.store.getDocs(), deps.store.listRecords(), deps.store.onHand()]);
  const rule = ruleFromBuilder(parseBuilder(b.builder, { tree: docs?.tree ?? [], productIds: new Set(records.map((r) => r.id)) }, "Collection"));
  const products = buildSnapshot(records, docs, onHand, new Map(), now).products.filter((p) => matchesRule(p, rule, now));
  return { count: products.length, sample: products.slice(0, 8).map((p) => ({ id: p.id, title: p.title, handle: p.handle, image: p.images[0] })) };
}

/** Product picker for "hand-picked products" (any status, so drafts can be prepared before launch). */
export async function productChoices(deps: CatalogAdminDeps, q: string) {
  const needle = q.toLowerCase().slice(0, 60);
  return (await deps.store.listRecords())
    .filter((r) => !needle || r.title.toLowerCase().includes(needle) || r.sku.toLowerCase().includes(needle))
    .slice(0, 30)
    .map((r) => ({ id: r.id, title: r.title, sku: r.sku, status: r.status }));
}
