import { ATTRIBUTE_VALUES, COLOUR_FAMILIES } from "@/lib/catalog/attributes";
import { runQuery } from "@/lib/catalog/engine";
import { buildIndex, search } from "@/lib/search/engine";
import { type Category, type CategoryNode, type Collection, CommerceError, type CommerceAdapter, type ListOptions, type Product } from "@/lib/commerce/types";
import { type CollectionRule, matchesRule } from "./collection-rules";

/**
 * The storefront's read side of the catalogue, built from a plain snapshot (products, category tree, featured
 * rail, collections). One implementation for every backend: the demo catalogue and the own-backend catalogue
 * (products in the database) both go through it, so listing, filters, collections, search and suggestions can't
 * drift between them.
 */
export interface CatalogSnapshot {
  products: Product[];
  tree: CategoryNode[];
  featured: Category[];
  collections: (Collection & { rule: CollectionRule })[];
  /** Reference time for "new" rules. */
  now: number;
  /** Ids of live products on "Show as sold out" (lib/catalog/hold.ts); absent = none. */
  held?: ReadonlySet<string>;
}

export type CatalogReader = Omit<CommerceAdapter, "name" | "cart" | "inventory">;

export const HANDLE_RE = /^[a-z0-9-]{1,120}$/;
/** Same shape the bag accepts (lib/commerce/cart-engine.ts). */
export const PRODUCT_ID_RE = /^[a-z0-9_]{1,64}$/;

function page<T>(items: T[], { limit = 24, offset = 0 }: ListOptions = {}) {
  const safeLimit = Math.min(Math.max(1, Math.trunc(limit)), 60);
  const safeOffset = Math.max(0, Math.trunc(offset));
  return items.slice(safeOffset, safeOffset + safeLimit);
}

/** Out-of-stock products go to the end of listings by default (CARD-02). */
function inStockFirst(products: Product[]) {
  const soldOut = (p: Product) => p.sizes.every((s) => s.stock === 0);
  return [...products].sort((a, b) => Number(soldOut(a)) - Number(soldOut(b)));
}

/** Search index over a snapshot + category suggestions (SRCH-01/02). */
export function buildCatalogSearch(products: Product[], tree: CategoryNode[]) {
  const index = buildIndex(
    products.map((p) => {
      const cat = tree.find((c) => c.handle === p.category);
      const sub = cat?.subcategories.find((s) => s.handle === p.subcategory);
      const attrs = Object.entries(p.attributes)
        .map(([k, v]) => (v ? ATTRIBUTE_VALUES[k as keyof typeof ATTRIBUTE_VALUES]?.[v] ?? v : ""))
        .join(" ");
      return {
        id: p.id,
        title: p.title,
        category: `${cat?.title ?? p.category} ${sub?.title ?? ""}`,
        extra: `${p.colour.name} ${COLOUR_FAMILIES[p.colourFamily]?.label ?? ""} ${attrs} ${p.tags.join(" ")}`,
      };
    }),
  );
  const catHref = new Map<string, { title: string; href: string }>();
  const catDocs = tree.flatMap((c) => {
    catHref.set(c.handle, { title: c.title, href: `/men/${c.handle}` });
    return [
      { id: c.handle, title: c.title, category: c.handle.replace(/-/g, " "), extra: "" },
      ...c.subcategories.map((s) => {
        const id = `${c.handle}/${s.handle}`;
        catHref.set(id, { title: `${s.title} ${c.title.toLowerCase()}`, href: `/men/${id}` });
        return { id, title: `${s.title} ${c.title}`, category: c.title, extra: "" };
      }),
    ];
  });
  const catIndex = buildIndex(catDocs);
  return {
    search: (q: string) => search(index, q),
    categories: (q: string) =>
      [...search(catIndex, q)]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([id]) => catHref.get(id)!),
  };
}

/** `load` is called per request; return the same snapshot object while it's unchanged (indexes are cached on it). */
export function createCatalogReader(load: () => CatalogSnapshot | Promise<CatalogSnapshot>): CatalogReader {
  const indexes = new WeakMap<CatalogSnapshot, ReturnType<typeof buildCatalogSearch>>();
  const searchOf = (s: CatalogSnapshot) => {
    let idx = indexes.get(s);
    if (!idx) indexes.set(s, (idx = buildCatalogSearch(s.products, s.tree)));
    return idx;
  };
  return {
    async getProduct(handle) {
      if (typeof handle !== "string" || !HANDLE_RE.test(handle)) return null;
      return (await load()).products.find((p) => p.handle === handle) ?? null;
    },
    async getProductById(id) {
      if (typeof id !== "string" || !PRODUCT_ID_RE.test(id)) return null;
      return (await load()).products.find((p) => p.id === id) ?? null;
    },
    async listProducts(options = {}) {
      const { products } = await load();
      const filtered = options.category ? products.filter((p) => p.category === options.category) : products;
      const ordered =
        options.sort === "newest"
          ? [...filtered].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          : [...filtered].sort((a, b) => b.popularity - a.popularity);
      const all = inStockFirst(ordered);
      return { products: page(all, options), total: all.length };
    },
    async getCollection(handle) {
      if (typeof handle !== "string" || !HANDLE_RE.test(handle)) return null;
      const found = (await load()).collections.find((c) => c.handle === handle);
      return found ? { handle: found.handle, title: found.title, description: found.description } : null;
    },
    async listCollections() {
      return (await load()).collections.map(({ handle, title, description }) => ({ handle, title, description }));
    },
    async listCategories() {
      return (await load()).featured;
    },
    async listCategoryTree() {
      return (await load()).tree;
    },
    async getCategory(handle) {
      if (typeof handle !== "string" || !HANDLE_RE.test(handle)) return null;
      return (await load()).tree.find((c) => c.handle === handle) ?? null;
    },
    async searchCatalog(scope, query) {
      const s = await load();
      let scoped: Product[];
      let relevance: Map<string, number> | undefined;
      switch (scope.kind) {
        case "all":
          scoped = s.products;
          break;
        case "category":
          if (!HANDLE_RE.test(scope.category) || (scope.subcategory && !HANDLE_RE.test(scope.subcategory))) {
            throw new CommerceError("invalid_input", "Invalid category");
          }
          scoped = s.products.filter((p) => p.category === scope.category && (!scope.subcategory || p.subcategory === scope.subcategory));
          break;
        case "collection": {
          const c = s.collections.find((x) => x.handle === scope.collection);
          if (!c) throw new CommerceError("not_found", "Collection not found");
          scoped = s.products.filter((p) => matchesRule(p, c.rule, s.now));
          break;
        }
        case "search": {
          relevance = searchOf(s).search(scope.q);
          scoped = s.products.filter((p) => relevance!.has(p.id));
          break;
        }
      }
      return runQuery(scoped, query, relevance);
    },
    async suggest(q, limit = 6) {
      const s = await load();
      const term = q.slice(0, 80);
      const idx = searchOf(s);
      const scores = idx.search(term);
      const products = s.products
        .filter((p) => scores.has(p.id))
        .sort((a, b) => scores.get(b.id)! - scores.get(a.id)! || b.popularity - a.popularity)
        .slice(0, Math.min(Math.max(1, limit), 10))
        .map((p) => ({ handle: p.handle, title: p.title, price: p.price, mrp: p.mrp, image: p.images[0] }));
      return { products, categories: idx.categories(term) };
    },
  };
}
