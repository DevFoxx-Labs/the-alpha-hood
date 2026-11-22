import { STORE_CONFIG } from "@/lib/config/store";
import { CommerceError, type Cart, type CartLine, type CommerceAdapter, type ListOptions, type Product } from "../types";
import { MOCK_CATEGORIES, MOCK_PRODUCTS } from "./data";

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
      // Mock "newest": later catalogue rows were added later.
      const ordered = options.sort === "newest" ? [...filtered].reverse() : filtered;
      const all = inStockFirst(ordered);
      return { products: page(all, options), total: all.length };
    },

    async getCollection(handle, options = {}) {
      if (!HANDLE_RE.test(handle)) return null;
      const category = MOCK_CATEGORIES.find((c) => c.handle === handle);
      if (!category) return null;
      const { products, total } = await adapter.listProducts({ ...options, category: handle });
      return { collection: { handle, title: category.title }, products, total };
    },

    async listCategories() {
      return MOCK_CATEGORIES;
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
