import { STORE_CONFIG } from "@/lib/config/store";
import { CommerceError, type Cart, type CartLine, type CommerceAdapter, type ListOptions, type Product } from "../types";
import { runQuery } from "@/lib/catalog/engine";
import { MOCK_CATEGORIES, MOCK_CATEGORY_TREE, MOCK_COLLECTIONS, MOCK_PRODUCTS } from "./data";
import { searchIndex } from "./search";

/**
 * In-memory mock commerce adapter for local development and tests.
 * Cart state lives in this process only — never use it in production (see lib/commerce/index.ts).
 */

const HANDLE_RE = /^[a-z0-9-]{1,120}$/;
const ID_RE = /^[a-z0-9_]{1,64}$/;

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

function totals(id: string, lines: CartLine[]): Cart {
  return {
    id,
    lines,
    subtotal: lines.reduce((sum, l) => sum + l.price * l.quantity, 0),
    totalMrp: lines.reduce((sum, l) => sum + l.mrp * l.quantity, 0),
    itemCount: lines.reduce((sum, l) => sum + l.quantity, 0),
  };
}

export function createMockAdapter(): CommerceAdapter {
  const carts = new Map<string, CartLine[]>();
  let seq = 0;
  const nextId = (prefix: string) => `${prefix}_${(++seq).toString(36)}`;

  function requireCart(cartId: string) {
    if (!ID_RE.test(cartId)) throw new CommerceError("invalid_input", "Invalid cart id");
    const lines = carts.get(cartId);
    if (!lines) throw new CommerceError("not_found", "Cart not found");
    return lines;
  }

  function requireStock(product: Product, size: string, quantity: number) {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new CommerceError("invalid_input", "Quantity must be a positive whole number");
    }
    if (quantity > STORE_CONFIG.maxQtyPerSku) {
      throw new CommerceError("limit_exceeded", `Maximum ${STORE_CONFIG.maxQtyPerSku} per size`);
    }
    const option = product.sizes.find((s) => s.label === size);
    if (!option) throw new CommerceError("invalid_input", "Unknown size");
    if (option.stock < quantity) throw new CommerceError("out_of_stock", "Not enough stock");
  }

  const adapter: CommerceAdapter = {
    name: "mock",

    async getProduct(handle) {
      if (!HANDLE_RE.test(handle)) return null;
      return MOCK_PRODUCTS.find((p) => p.handle === handle) ?? null;
    },

    async listProducts(options = {}) {
      const filtered = options.category ? MOCK_PRODUCTS.filter((p) => p.category === options.category) : MOCK_PRODUCTS;
      const ordered =
        options.sort === "newest"
          ? [...filtered].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          : [...filtered].sort((a, b) => b.popularity - a.popularity);
      const all = inStockFirst(ordered);
      return { products: page(all, options), total: all.length };
    },

    async getCollection(handle) {
      if (!HANDLE_RE.test(handle)) return null;
      const found = MOCK_COLLECTIONS.find((c) => c.handle === handle);
      return found ? { handle: found.handle, title: found.title, description: found.description } : null;
    },

    async listCollections() {
      return MOCK_COLLECTIONS.map(({ handle, title, description }) => ({ handle, title, description }));
    },

    async listCategories() {
      return MOCK_CATEGORIES;
    },

    async listCategoryTree() {
      return MOCK_CATEGORY_TREE;
    },

    async getCategory(handle) {
      if (!HANDLE_RE.test(handle)) return null;
      return MOCK_CATEGORY_TREE.find((c) => c.handle === handle) ?? null;
    },

    async searchCatalog(scope, query) {
      let scoped: Product[];
      let relevance: Map<string, number> | undefined;
      switch (scope.kind) {
        case "all":
          scoped = MOCK_PRODUCTS;
          break;
        case "category":
          if (!HANDLE_RE.test(scope.category) || (scope.subcategory && !HANDLE_RE.test(scope.subcategory))) {
            throw new CommerceError("invalid_input", "Invalid category");
          }
          scoped = MOCK_PRODUCTS.filter(
            (p) => p.category === scope.category && (!scope.subcategory || p.subcategory === scope.subcategory),
          );
          break;
        case "collection": {
          const c = MOCK_COLLECTIONS.find((x) => x.handle === scope.collection);
          if (!c) throw new CommerceError("not_found", "Collection not found");
          scoped = MOCK_PRODUCTS.filter(c.rule);
          break;
        }
        case "search": {
          relevance = searchIndex().search(scope.q);
          scoped = MOCK_PRODUCTS.filter((p) => relevance!.has(p.id));
          break;
        }
      }
      return runQuery(scoped, query, relevance);
    },

    async suggest(q, limit = 6) {
      const term = q.slice(0, 80);
      const scores = searchIndex().search(term);
      const products = MOCK_PRODUCTS.filter((p) => scores.has(p.id))
        .sort((a, b) => scores.get(b.id)! - scores.get(a.id)! || b.popularity - a.popularity)
        .slice(0, Math.min(Math.max(1, limit), 10))
        .map((p) => ({ handle: p.handle, title: p.title, price: p.price, mrp: p.mrp, image: p.images[0] }));
      return { products, categories: searchIndex().categories(term) };
    },

    cart: {
      async get(cartId) {
        if (!ID_RE.test(cartId) || !carts.has(cartId)) return null;
        return totals(cartId, carts.get(cartId)!);
      },

      async create() {
        const id = nextId("cart");
        carts.set(id, []);
        return totals(id, []);
      },

      async addLine(cartId, { productId, size, quantity }) {
        const lines = requireCart(cartId);
        const product = MOCK_PRODUCTS.find((p) => p.id === productId);
        if (!product) throw new CommerceError("not_found", "Product not found");
        const existing = lines.find((l) => l.productId === productId && l.size === size);
        requireStock(product, size, (existing?.quantity ?? 0) + quantity);
        if (existing) {
          existing.quantity += quantity;
        } else {
          // Price always comes from the catalogue, never from the caller.
          lines.push({
            id: nextId("line"),
            productId,
            title: product.title,
            colour: product.colour.name,
            size,
            quantity,
            price: product.price,
            mrp: product.mrp,
            image: product.images[0],
          });
        }
        return totals(cartId, lines);
      },

      async updateLine(cartId, lineId, input) {
        const lines = requireCart(cartId);
        const line = lines.find((l) => l.id === lineId);
        if (!line) throw new CommerceError("not_found", "Line not found");
        const product = MOCK_PRODUCTS.find((p) => p.id === line.productId)!;
        const size = input.size ?? line.size;
        const quantity = input.quantity ?? line.quantity;
        requireStock(product, size, quantity);
        line.size = size;
        line.quantity = quantity;
        return totals(cartId, lines);
      },

      async removeLine(cartId, lineId) {
        const lines = requireCart(cartId);
        const index = lines.findIndex((l) => l.id === lineId);
        if (index === -1) throw new CommerceError("not_found", "Line not found");
        lines.splice(index, 1);
        return totals(cartId, lines);
      },
    },
  };

  return adapter;
}
