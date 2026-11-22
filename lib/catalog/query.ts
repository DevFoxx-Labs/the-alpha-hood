import { DISCOUNT_STEPS, MULTI_FILTERS, type CatalogQuery, type MultiFilter, SORTS, type SortKey } from "./types";

/**
 * Listing URL state (PLP-02/03/04). Strict allow-list parse: unknown keys/values are dropped, lengths are
 * bounded, so a crafted URL can't blow up cache keys or the engine. Serialisation is canonical
 * (fixed key order, sorted values) so equal filters share one URL and one cache entry.
 *
 * `?size=m,l&fit=regular&colour=black&price=500-2000&discount=30&instock=1&sort=price-asc&page=2`
 */
export const PAGE_SIZE = 24;
export const MAX_PAGE = 20;
const MAX_VALUES = 20;
const VALUE_RE = /^[a-z0-9-]{1,30}$/;
export const MAX_QUERY_LENGTH = 80;

export const DEFAULT_SORT: SortKey = "popularity";

export function emptyQuery(sort: SortKey = DEFAULT_SORT): CatalogQuery {
  return {
    filters: { size: [], fit: [], colour: [], fabric: [], sleeve: [], pattern: [], occasion: [] },
    price: null,
    discount: null,
    inStockOnly: false,
    sort,
    page: 1,
  };
}

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

function get(params: Params, key: string): string | undefined {
  if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
  const v = params[key];
  return Array.isArray(v) ? v[0] : v;
}

export function parseQuery(params: Params, { search = false }: { search?: boolean } = {}): CatalogQuery {
  const q = emptyQuery(search ? "relevance" : DEFAULT_SORT);

  for (const key of MULTI_FILTERS) {
    const raw = get(params, key);
    if (!raw) continue;
    const values = [...new Set(raw.slice(0, 600).toLowerCase().split(","))].filter((v) => VALUE_RE.test(v));
    q.filters[key] = values.slice(0, MAX_VALUES).sort();
  }

  const price = /^(\d{1,6})-(\d{1,6})$/.exec(get(params, "price") ?? "");
  if (price) {
    const min = Number(price[1]);
    const max = Number(price[2]);
    if (min <= max) q.price = { min, max };
  }

  const discount = Number(get(params, "discount"));
  if ((DISCOUNT_STEPS as readonly number[]).includes(discount)) q.discount = discount;

  q.inStockOnly = get(params, "instock") === "1";

  const sort = get(params, "sort") as SortKey | undefined;
  if (sort && SORTS.includes(sort) && (sort !== "relevance" || search)) q.sort = sort;

  const page = Number(get(params, "page"));
  if (Number.isInteger(page) && page > 1) q.page = Math.min(page, MAX_PAGE);

  return q;
}

/** Canonical query string (no leading "?"). Defaults are omitted. */
export function serializeQuery(q: CatalogQuery, { search = false }: { search?: boolean } = {}): string {
  const out = new URLSearchParams();
  for (const key of MULTI_FILTERS) {
    if (q.filters[key].length) out.set(key, [...q.filters[key]].sort().join(","));
  }
  if (q.price) out.set("price", `${q.price.min}-${q.price.max}`);
  if (q.discount) out.set("discount", String(q.discount));
  if (q.inStockOnly) out.set("instock", "1");
  if (q.sort !== (search ? "relevance" : DEFAULT_SORT)) out.set("sort", q.sort);
  if (q.page > 1) out.set("page", String(q.page));
  // Keep commas readable in the URL.
  return out.toString().replace(/%2C/g, ",");
}

export function activeFilterCount(q: CatalogQuery): number {
  let n = 0;
  for (const key of MULTI_FILTERS) n += q.filters[key].length;
  if (q.price) n++;
  if (q.discount) n++;
  if (q.inStockOnly) n++;
  return n;
}

/** Any filter change resets to page 1. */
export function toggleValue(q: CatalogQuery, key: MultiFilter, value: string): CatalogQuery {
  const current = q.filters[key];
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value].sort();
  return { ...q, filters: { ...q.filters, [key]: next }, page: 1 };
}

export function clearFilters(q: CatalogQuery): CatalogQuery {
  return { ...emptyQuery(q.sort), sort: q.sort };
}

export function normaliseSearchTerm(raw: string | undefined | null): string {
  return (raw ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
}
