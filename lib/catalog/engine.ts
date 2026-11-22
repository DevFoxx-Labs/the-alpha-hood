import type { Product } from "@/lib/commerce/types";
import { percentOff } from "@/lib/format";
import { ATTRIBUTE_VALUES, COLOUR_FAMILIES, FILTER_LABELS, sizeRank, sizeSlug } from "./attributes";
import { PAGE_SIZE } from "./query";
import { DISCOUNT_STEPS, type CatalogQuery, type CatalogResult, type Facet, MULTI_FILTERS, type MultiFilter } from "./types";

/**
 * Pure listing engine (PLP-02…04): filters, disjunctive facet counts, sorting and paging over a scoped
 * product set. Used by the mock adapter; a hosted search engine does the same server-side.
 */

const isSoldOut = (p: Product) => p.sizes.every((s) => s.stock === 0);
const rupeesOf = (paise: number) => Math.round(paise / 100);

/** Values a product has for a filter key (size = sizes in stock). */
export function valuesOf(p: Product, key: MultiFilter): string[] {
  switch (key) {
    case "size":
      return p.sizes.filter((s) => s.stock > 0).map((s) => sizeSlug(s.label));
    case "colour":
      return [p.colourFamily];
    default: {
      const v = p.attributes[key];
      return v ? [v] : [];
    }
  }
}

function matches(p: Product, q: CatalogQuery, except?: MultiFilter | "price" | "discount"): boolean {
  for (const key of MULTI_FILTERS) {
    if (key === except) continue;
    const wanted = q.filters[key];
    if (wanted.length && !valuesOf(p, key).some((v) => wanted.includes(v))) return false;
  }
  if (except !== "price" && q.price) {
    const r = rupeesOf(p.price);
    if (r < q.price.min || r > q.price.max) return false;
  }
  if (except !== "discount" && q.discount && percentOff(p.price, p.mrp) < q.discount) return false;
  if (q.inStockOnly && isSoldOut(p)) return false;
  return true;
}

export function applyFilters(products: Product[], q: CatalogQuery): Product[] {
  return products.filter((p) => matches(p, q));
}

/**
 * Facet counts are disjunctive: a facet's counts ignore its own selection (so you can pick a second
 * size) but respect every other filter. Values with no products in the scope are hidden; selected values
 * are always shown (even at 0) so they can be removed.
 */
export function buildFacets(scoped: Product[], q: CatalogQuery): Facet[] {
  const facets: Facet[] = [];
  for (const key of MULTI_FILTERS) {
    const counts = new Map<string, number>();
    const present = new Set<string>();
    for (const p of scoped) {
      const vals = valuesOf(p, key);
      for (const v of vals) present.add(v);
      if (!matches(p, q, key)) continue;
      for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    for (const v of q.filters[key]) present.add(v);
    if (present.size === 0) continue;

    let values = [...present].map((value) => ({
      value,
      label: labelFor(key, value, scoped),
      count: counts.get(value) ?? 0,
      ...(key === "colour" ? { hex: COLOUR_FAMILIES[value]?.hex ?? "#cccccc" } : {}),
    }));
    if (key === "size") values = values.sort((a, b) => sizeRank(a.label) - sizeRank(b.label));
    else if (key === "colour") {
      const order = Object.keys(COLOUR_FAMILIES);
      values = values.sort((a, b) => order.indexOf(a.value) - order.indexOf(b.value));
    } else {
      const order = Object.keys(ATTRIBUTE_VALUES[key]);
      values = values.sort((a, b) => order.indexOf(a.value) - order.indexOf(b.value));
    }
    facets.push({ key, label: FILTER_LABELS[key], values });
  }
  return facets;
}

function labelFor(key: MultiFilter, value: string, scoped: Product[]): string {
  if (key === "size") {
    for (const p of scoped) for (const s of p.sizes) if (sizeSlug(s.label) === value) return s.label;
    return value.toUpperCase();
  }
  if (key === "colour") return COLOUR_FAMILIES[value]?.label ?? value;
  return ATTRIBUTE_VALUES[key][value] ?? value;
}

export function sortProducts(products: Product[], q: CatalogQuery, relevance?: Map<string, number>): Product[] {
  const by: Record<CatalogQuery["sort"], (a: Product, b: Product) => number> = {
    relevance: (a, b) => (relevance?.get(b.id) ?? 0) - (relevance?.get(a.id) ?? 0) || b.popularity - a.popularity,
    popularity: (a, b) => b.popularity - a.popularity,
    new: (a, b) => b.createdAt.localeCompare(a.createdAt),
    "price-asc": (a, b) => a.price - b.price,
    "price-desc": (a, b) => b.price - a.price,
    discount: (a, b) => percentOff(b.price, b.mrp) - percentOff(a.price, a.mrp) || b.popularity - a.popularity,
    rating: (a, b) =>
      (b.rating?.average ?? 0) - (a.rating?.average ?? 0) || (b.rating?.count ?? 0) - (a.rating?.count ?? 0),
  };
  const cmp = by[q.sort];
  // CARD-02: sold-out styles always go last; stable tie-break on id keeps pages deterministic.
  return [...products].sort((a, b) => Number(isSoldOut(a)) - Number(isSoldOut(b)) || cmp(a, b) || a.id.localeCompare(b.id));
}

export function runQuery(scoped: Product[], q: CatalogQuery, relevance?: Map<string, number>): CatalogResult {
  const filtered = applyFilters(scoped, q);
  const sorted = sortProducts(filtered, q, relevance);

  const prices = scoped.map((p) => rupeesOf(p.price));
  const priceRange = prices.length
    ? { min: Math.floor(Math.min(...prices) / 100) * 100, max: Math.ceil(Math.max(...prices) / 100) * 100 }
    : null;

  const discountCounts: Record<number, number> = {};
  for (const step of DISCOUNT_STEPS) {
    discountCounts[step] = scoped.filter((p) => matches(p, q, "discount") && percentOff(p.price, p.mrp) >= step).length;
  }

  return {
    products: sorted.slice(0, q.page * PAGE_SIZE),
    total: sorted.length,
    scopeTotal: scoped.length,
    facets: buildFacets(scoped, q),
    priceRange,
    discountCounts,
    pageSize: PAGE_SIZE,
  };
}
