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

interface StoredCart {
  lines: CartLine[];
  couponCode: string | null;
}

function totals(id: string, cart: StoredCart): Cart {
  const lines = cart.lines.map((l) => ({ ...l }));
  return {
    id,
    lines,
    subtotal: lines.reduce((sum, l) => sum + l.price * l.quantity, 0),
    totalMrp: lines.reduce((sum, l) => sum + l.mrp * l.quantity, 0),
    itemCount: lines.reduce((sum, l) => sum + l.quantity, 0),
    couponCode: cart.couponCode,
  };
}

/** Unguessable ids (128 bits) — a cart id is a bearer credential held in an HttpOnly cookie. */
function randomId(prefix: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `${prefix}_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

interface Reservation {
  items: { key: string; quantity: number }[];
  expiresAt: number;
  state: "held" | "committed" | "released";
}

export function createMockAdapter(): CommerceAdapter {
  const carts = new Map<string, StoredCart>();
  const sold = new Map<string, number>();
  const reservations = new Map<string, Reservation>();
  const restocked = new Set<string>();
  const skuKey = (productId: string, size: string) => `${productId}::${size}`;

  function requireCart(cartId: string) {
    if (!ID_RE.test(cartId)) throw new CommerceError("invalid_input", "Invalid cart id");
    const cart = carts.get(cartId);
    if (!cart) throw new CommerceError("not_found", "Cart not found");
    return cart;
  }

  function stockOf(productId: string, size: string): number {
    const product = MOCK_PRODUCTS.find((p) => p.id === productId);
    return product?.sizes.find((s) => s.label === size)?.stock ?? 0;
  }

  /** Synchronous so check-and-hold can't interleave with another request (atomic in one event-loop turn). */
  function availableNow(productId: string, size: string, now: number, ignore?: string): number {
    const key = skuKey(productId, size);
    let held = 0;
    for (const [ref, r] of reservations) {
      if (ref === ignore || r.state !== "held" || r.expiresAt <= now) continue;
      for (const item of r.items) if (item.key === key) held += item.quantity;
    }
    return Math.max(0, stockOf(productId, size) - (sold.get(key) ?? 0) - held);
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
    if (availableNow(product.id, size, Date.now()) < quantity) throw new CommerceError("out_of_stock", "Not enough stock");
  }

  const adapter: CommerceAdapter = {
    name: "mock",

    async getProduct(handle) {
      if (!HANDLE_RE.test(handle)) return null;
      return MOCK_PRODUCTS.find((p) => p.handle === handle) ?? null;
    },

    async getProductById(id) {
      if (typeof id !== "string" || !ID_RE.test(id)) return null;
      return MOCK_PRODUCTS.find((p) => p.id === id) ?? null;
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
        const id = randomId("cart");
        const cart: StoredCart = { lines: [], couponCode: null };
        carts.set(id, cart);
        return totals(id, cart);
      },

      async addLine(cartId, { productId, size, quantity }) {
        const cart = requireCart(cartId);
        if (typeof productId !== "string" || !ID_RE.test(productId)) throw new CommerceError("invalid_input", "Invalid product");
        const product = MOCK_PRODUCTS.find((p) => p.id === productId);
        if (!product) throw new CommerceError("not_found", "Product not found");
        const existing = cart.lines.find((l) => l.productId === productId && l.size === size);
        requireStock(product, size, (existing?.quantity ?? 0) + quantity);
        if (existing) {
          existing.quantity += quantity;
        } else {
          // Price always comes from the catalogue, never from the caller.
          cart.lines.push({
            id: randomId("line"),
            productId,
            handle: product.handle,
            title: product.title,
            colour: product.colour.name,
            size,
            quantity,
            price: product.price,
            mrp: product.mrp,
            image: product.images[0],
          });
        }
        return totals(cartId, cart);
      },

      async updateLine(cartId, lineId, input) {
        const cart = requireCart(cartId);
        const line = cart.lines.find((l) => l.id === lineId);
        if (!line) throw new CommerceError("not_found", "Line not found");
        const product = MOCK_PRODUCTS.find((p) => p.id === line.productId)!;
        const size = input.size ?? line.size;
        const quantity = input.quantity ?? line.quantity;
        const twin = cart.lines.find((l) => l !== line && l.productId === line.productId && l.size === size);
        if (twin) {
          // Changing to a size already in the bag merges the two lines.
          requireStock(product, size, twin.quantity + quantity);
          twin.quantity += quantity;
          cart.lines.splice(cart.lines.indexOf(line), 1);
        } else {
          requireStock(product, size, quantity);
          line.size = size;
          line.quantity = quantity;
        }
        return totals(cartId, cart);
      },

      async removeLine(cartId, lineId) {
        const cart = requireCart(cartId);
        const index = cart.lines.findIndex((l) => l.id === lineId);
        if (index === -1) throw new CommerceError("not_found", "Line not found");
        cart.lines.splice(index, 1);
        return totals(cartId, cart);
      },

      async setCoupon(cartId, code) {
        const cart = requireCart(cartId);
        cart.couponCode = code;
        return totals(cartId, cart);
      },

      async refreshLine(cartId, lineId, { quantity }) {
        const cart = requireCart(cartId);
        const line = cart.lines.find((l) => l.id === lineId);
        if (!line) throw new CommerceError("not_found", "Line not found");
        const product = MOCK_PRODUCTS.find((p) => p.id === line.productId);
        if (!product) throw new CommerceError("not_found", "Product not found");
        line.price = product.price;
        line.mrp = product.mrp;
        if (Number.isInteger(quantity) && quantity >= 1) line.quantity = Math.min(quantity, STORE_CONFIG.maxQtyPerSku);
        return totals(cartId, cart);
      },

      async clear(cartId) {
        if (ID_RE.test(cartId)) carts.delete(cartId);
      },
    },

    inventory: {
      async available(productId, size, now = new Date()) {
        return availableNow(productId, size, now.getTime());
      },

      async reserve(reference, items, ttlMs, now = new Date()) {
        const t = now.getTime();
        const existing = reservations.get(reference);
        if (existing && existing.state === "held" && existing.expiresAt > t) return;
        // Check every line first, then hold — no await in between, so it is atomic.
        const needed = new Map<string, number>();
        for (const i of items) {
          if (!Number.isInteger(i.quantity) || i.quantity < 1) throw new CommerceError("invalid_input", "Invalid quantity");
          const key = skuKey(i.productId, i.size);
          needed.set(key, (needed.get(key) ?? 0) + i.quantity);
        }
        for (const i of items) {
          const key = skuKey(i.productId, i.size);
          if (availableNow(i.productId, i.size, t, reference) < needed.get(key)!) {
            throw new CommerceError("out_of_stock", "Not enough stock");
          }
        }
        reservations.set(reference, {
          items: [...needed].map(([key, quantity]) => ({ key, quantity })),
          expiresAt: t + ttlMs,
          state: "held",
        });
      },

      async commit(reference) {
        const r = reservations.get(reference);
        if (!r || r.state !== "held") return;
        r.state = "committed";
        for (const item of r.items) sold.set(item.key, (sold.get(item.key) ?? 0) + item.quantity);
      },

      async release(reference) {
        const r = reservations.get(reference);
        if (r && r.state === "held") r.state = "released";
      },

      async restock(reference, items) {
        if (restocked.has(reference)) return;
        restocked.add(reference);
        for (const i of items) {
          if (!Number.isInteger(i.quantity) || i.quantity < 1) continue;
          const key = skuKey(i.productId, i.size);
          sold.set(key, (sold.get(key) ?? 0) - i.quantity);
        }
      },

      async adjust(productId, size, delta) {
        if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 10_000) throw new CommerceError("invalid_input", "Invalid adjustment");
        const product = MOCK_PRODUCTS.find((p) => p.id === productId);
        if (!product || !product.sizes.some((s) => s.label === size)) throw new CommerceError("not_found", "SKU not found");
        const key = skuKey(productId, size);
        const onHand = stockOf(productId, size) - (sold.get(key) ?? 0);
        if (onHand + delta < 0) throw new CommerceError("invalid_input", "Stock can't go below zero");
        sold.set(key, (sold.get(key) ?? 0) - delta);
        return onHand + delta;
      },

      async snapshot(now = new Date()) {
        const t = now.getTime();
        return MOCK_PRODUCTS.flatMap((p) =>
          p.sizes.map((s) => {
            const key = skuKey(p.id, s.label);
            const onHand = stockOf(p.id, s.label) - (sold.get(key) ?? 0);
            const available = availableNow(p.id, s.label, t);
            return { productId: p.id, size: s.label, onHand, held: Math.max(0, onHand - available), available };
          }),
        );
      },

      async isHeld(reference, now = new Date()) {
        const r = reservations.get(reference);
        return !!r && r.state === "held" && r.expiresAt > now.getTime();
      },
    },
  };

  return adapter;
}
