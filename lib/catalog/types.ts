import type { Paise } from "@/lib/format";
import type { Product } from "@/lib/commerce/types";

/** What a listing page shows before filters (PLP-01, SRCH-02). */
export type CatalogScope =
  | { kind: "all" }
  | { kind: "category"; category: string; subcategory?: string }
  | { kind: "collection"; collection: string }
  | { kind: "search"; q: string };

export const MULTI_FILTERS = ["size", "fit", "colour", "fabric", "sleeve", "pattern", "occasion"] as const;
export type MultiFilter = (typeof MULTI_FILTERS)[number];

export const SORTS = ["relevance", "popularity", "new", "price-asc", "price-desc", "discount", "rating"] as const;
export type SortKey = (typeof SORTS)[number];

export const DISCOUNT_STEPS = [10, 20, 30, 40, 50] as const;

/** Filters, sort and page — everything kept in the URL (PLP-02). Prices in whole rupees. */
export interface CatalogQuery {
  filters: Record<MultiFilter, string[]>;
  price: { min: number; max: number } | null;
  /** Minimum % off. */
  discount: number | null;
  inStockOnly: boolean;
  sort: SortKey;
  /** 1-based; the listing shows pages 1…page (Load more keeps earlier items). */
  page: number;
}

export interface FacetValue {
  value: string;
  label: string;
  count: number;
  hex?: string;
}

export interface Facet {
  key: MultiFilter;
  label: string;
  values: FacetValue[];
}

export interface CatalogResult {
  products: Product[];
  /** Matches after filters. */
  total: number;
  /** Styles in the scope before filters (the "248 styles" next to the H1). */
  scopeTotal: number;
  facets: Facet[];
  /** Price bounds in the scope (rupees), for the slider. */
  priceRange: { min: number; max: number } | null;
  discountCounts: Record<number, number>;
  pageSize: number;
}

export interface SearchSuggestions {
  products: { handle: string; title: string; price: Paise; mrp: Paise; image: Product["images"][number] }[];
  categories: { title: string; href: string }[];
}
