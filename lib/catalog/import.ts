import { ValidationError } from "@/lib/http/guard";
import { type CatalogAdminDeps, CatalogAdminError, createProduct, parseProductInput, updateProduct } from "./admin";
import { matchesRule, type CollectionRule } from "./collection-rules";
import { HANDLE_RE } from "./reader";
import type { CatalogDocs } from "./store";

/**
 * Real-catalogue import (phase 6 switch-over). Every product goes through the SAME validation as the admin form
 * (`parseProductInput` → `createProduct` / `updateProduct`), so a file can't put anything into the store that the
 * admin couldn't. Upsert by SKU: a new SKU is created, a known SKU is updated (version-checked). Dry run first:
 * `plan` validates everything and reports what would change without writing.
 *
 * Category tree / homepage rail / collections can be imported too (the admin has no editor for them yet).
 */
export interface ImportFile {
  categories?: CatalogDocs;
  products?: unknown[];
}

export interface ImportReport {
  categories: "unchanged" | "replace";
  create: string[];
  update: string[];
  errors: { index: number; sku: string; message: string }[];
}

const MAX_PRODUCTS = 5000;

/** Validates the category document strictly (handles, titles, rules that evaluate). */
export function parseCategories(raw: unknown): CatalogDocs {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ValidationError("categories must be an object.");
  const r = raw as Record<string, unknown>;
  const allowed = new Set(["tree", "featured", "collections"]);
  for (const k of Object.keys(r)) if (!allowed.has(k)) throw new ValidationError(`categories: unknown field "${k}".`);
  const title = (v: unknown, where: string) => {
    if (typeof v !== "string" || v.trim().length < 2 || v.length > 60) throw new ValidationError(`${where}: title 2–60 characters.`);
    return v.trim();
  };
  const handle = (v: unknown, where: string) => {
    if (typeof v !== "string" || !HANDLE_RE.test(v)) throw new ValidationError(`${where}: handle must be lower-case letters, digits and dashes.`);
    return v;
  };
  const image = (v: unknown, fallbackAlt: string) => {
    const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
    const colour = typeof o.colour === "string" && /^#[0-9a-fA-F]{6}$/.test(o.colour) ? o.colour : "#1b1b1b";
    const art = typeof o.art === "string" && /^[a-z]{2,12}$/.test(o.art) ? o.art : "tee";
    return { art, colour, alt: typeof o.alt === "string" ? o.alt.slice(0, 80) : fallbackAlt } as CatalogDocs["tree"][number]["image"];
  };
  if (!Array.isArray(r.tree) || r.tree.length === 0 || r.tree.length > 60) throw new ValidationError("categories.tree: 1–60 categories.");
  const seen = new Set<string>();
  const tree = r.tree.map((c, i) => {
    const o = (c ?? {}) as Record<string, unknown>;
    const h = handle(o.handle, `tree[${i}]`);
    if (seen.has(h)) throw new ValidationError(`tree[${i}]: duplicate handle "${h}".`);
    seen.add(h);
    const t = title(o.title, `tree[${i}]`);
    const subs = Array.isArray(o.subcategories) ? o.subcategories : [];
    if (subs.length > 30) throw new ValidationError(`tree[${i}]: at most 30 sub-categories.`);
    const subSeen = new Set<string>();
    return {
      handle: h,
      title: t,
      image: image(o.image, t),
      subcategories: subs.map((s, j) => {
        const so = (s ?? {}) as Record<string, unknown>;
        const sh = handle(so.handle, `tree[${i}].subcategories[${j}]`);
        if (subSeen.has(sh)) throw new ValidationError(`tree[${i}]: duplicate sub-category "${sh}".`);
        subSeen.add(sh);
        const st = title(so.title, `tree[${i}].subcategories[${j}]`);
        return { handle: sh, title: st, image: image(so.image, st) };
      }),
    };
  });
  const featured = (Array.isArray(r.featured) ? r.featured : []).slice(0, 12).map((f, i) => {
    const o = (f ?? {}) as Record<string, unknown>;
    const h = handle(o.handle, `featured[${i}]`);
    if (!seen.has(h)) throw new ValidationError(`featured[${i}]: "${h}" isn't in the tree.`);
    const href = typeof o.href === "string" && /^\/men\/[a-z0-9-]+(\/[a-z0-9-]+)?$/.test(o.href) ? o.href : undefined;
    const t = title(o.title, `featured[${i}]`);
    return { handle: h, title: t, image: image(o.image, t), ...(href ? { href } : {}) };
  });
  const probe = { id: "x", handle: "x", title: "x", category: "x", price: 100, mrp: 100, colour: { name: "x", hex: "#000000" }, colours: [], sizes: [], images: [], attributes: {}, colourFamily: "x", createdAt: new Date(0).toISOString(), popularity: 0, tags: [], styleId: "x", sku: "x", description: "", specs: [], sizeChart: "none", legal: { manufacturer: "", countryOfOrigin: "", netQuantity: "" } } as const;
  const collections = (Array.isArray(r.collections) ? r.collections : []).slice(0, 100).map((c, i) => {
    const o = (c ?? {}) as Record<string, unknown>;
    const h = handle(o.handle, `collections[${i}]`);
    const t = title(o.title, `collections[${i}]`);
    const description = typeof o.description === "string" ? o.description.slice(0, 200) : undefined;
    const rule = o.rule as CollectionRule;
    // A rule must at least be a structure the evaluator understands (unknown shapes never match — reject them here).
    try {
      matchesRule(probe as never, rule, 0);
    } catch {
      throw new ValidationError(`collections[${i}]: invalid rule.`);
    }
    if (!rule || typeof rule !== "object" || JSON.stringify(rule).length > 2000) throw new ValidationError(`collections[${i}]: invalid rule.`);
    return { handle: h, title: t, ...(description ? { description } : {}), rule };
  });
  return { tree, featured, collections };
}

/** Validates the whole file against the current store (dry run). Nothing is written. */
export async function planImport(deps: CatalogAdminDeps, file: ImportFile): Promise<ImportReport> {
  const report: ImportReport = { categories: "unchanged", create: [], update: [], errors: [] };
  let docs = await deps.store.getDocs();
  if (file.categories !== undefined) {
    docs = parseCategories(file.categories);
    report.categories = "replace";
  }
  const products = file.products ?? [];
  if (!Array.isArray(products) || products.length > MAX_PRODUCTS) throw new ValidationError(`products: an array of at most ${MAX_PRODUCTS}.`);
  const bySku = new Map((await deps.store.listRecords()).map((r) => [r.sku, r]));
  const seenSku = new Set<string>();
  products.forEach((p, index) => {
    const sku = typeof (p as { sku?: unknown })?.sku === "string" ? String((p as { sku: string }).sku).toUpperCase() : "?";
    try {
      const input = parseProductInput(p, docs);
      if (seenSku.has(input.sku)) throw new ValidationError("SKU appears twice in the file.");
      seenSku.add(input.sku);
      (bySku.has(input.sku) ? report.update : report.create).push(input.sku);
    } catch (e) {
      report.errors.push({ index, sku, message: e instanceof Error ? e.message : "invalid" });
    }
  });
  return report;
}

/**
 * Applies a file that planned without errors. Categories first (products are validated against them), then
 * products one by one: each write is its own version-checked operation, so a stopped import can simply be re-run.
 */
export async function applyImport(deps: CatalogAdminDeps, file: ImportFile, now = new Date()): Promise<ImportReport> {
  const plan = await planImport(deps, file);
  if (plan.errors.length) return plan;
  if (file.categories !== undefined) {
    // The file replaces the categories / rail / collections only: homepage content and the Shop all list stay.
    const current = await deps.store.getDocs();
    const next = parseCategories(file.categories);
    await deps.store.putDocs({ ...next, ...(current?.homepage ? { homepage: current.homepage } : {}), ...(current?.shopAll ? { shopAll: current.shopAll.filter((h) => next.tree.some((c) => c.handle === h)) } : {}) });
  }
  const bySku = new Map((await deps.store.listRecords()).map((r) => [r.sku, r]));
  for (const [index, p] of (file.products ?? []).entries()) {
    const sku = String((p as { sku: string }).sku).toUpperCase();
    const current = bySku.get(sku);
    try {
      if (current) await updateProduct(deps, current.id, { ...(p as object), version: current.version }, now);
      else await createProduct(deps, p, now);
    } catch (e) {
      plan.errors.push({ index, sku, message: e instanceof CatalogAdminError || e instanceof Error ? e.message : "failed" });
    }
  }
  deps.invalidate();
  return plan;
}
