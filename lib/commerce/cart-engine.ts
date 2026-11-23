import { STORE_CONFIG } from "@/lib/config/store";
import { type Cart, type CartLine, CommerceError, type CommerceAdapter, type Product } from "./types";

/**
 * Bag rules (CART-01/05) in ONE place, shared by the memory adapter and the own-backend database adapter:
 * prices always come from the catalogue, quantity ≤ per-SKU limit and ≤ available stock, changing to a size
 * already in the bag merges the lines. Storage is a small repository with optimistic versions, so two tabs
 * editing the same bag never lose an update.
 */
export interface StoredCart {
  lines: CartLine[];
  couponCode: string | null;
}

export interface CartRepo {
  get(id: string): Promise<{ cart: StoredCart; version: number } | null>;
  create(id: string, cart: StoredCart): Promise<void>;
  /** Writes only if the stored version still equals `version`; returns false on a concurrent change. */
  save(id: string, cart: StoredCart, version: number): Promise<boolean>;
  delete(id: string): Promise<void>;
}

export interface CartDeps {
  repo: CartRepo;
  product(id: string): Promise<Product | null>;
  available(productId: string, size: string): Promise<number>;
}

export const CART_ID_RE = /^[a-z0-9_]{1,64}$/;

export function cartTotals(id: string, cart: StoredCart): Cart {
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
export function randomCommerceId(prefix: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `${prefix}_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function createCartOps(deps: CartDeps): CommerceAdapter["cart"] {
  async function requireStock(product: Product, size: string, quantity: number) {
    if (!Number.isInteger(quantity) || quantity < 1) throw new CommerceError("invalid_input", "Quantity must be a positive whole number");
    if (quantity > STORE_CONFIG.maxQtyPerSku) throw new CommerceError("limit_exceeded", `Maximum ${STORE_CONFIG.maxQtyPerSku} per size`);
    if (!product.sizes.some((s) => s.label === size)) throw new CommerceError("invalid_input", "Unknown size");
    if ((await deps.available(product.id, size)) < quantity) throw new CommerceError("out_of_stock", "Not enough stock");
  }

  /** Read → change → write with a version check; retried on a concurrent edit. */
  async function mutate(cartId: string, change: (cart: StoredCart) => Promise<void>): Promise<Cart> {
    if (!CART_ID_RE.test(cartId)) throw new CommerceError("invalid_input", "Invalid cart id");
    for (let i = 0; i < 10; i++) {
      const found = await deps.repo.get(cartId);
      if (!found) throw new CommerceError("not_found", "Cart not found");
      const cart = structuredClone(found.cart);
      await change(cart);
      if (await deps.repo.save(cartId, cart, found.version)) return cartTotals(cartId, cart);
    }
    throw new CommerceError("limit_exceeded", "Your bag is busy — please try again");
  }

  return {
    async get(cartId) {
      if (!CART_ID_RE.test(cartId)) return null;
      const found = await deps.repo.get(cartId);
      return found ? cartTotals(cartId, found.cart) : null;
    },

    async create() {
      const id = randomCommerceId("cart");
      const cart: StoredCart = { lines: [], couponCode: null };
      await deps.repo.create(id, cart);
      return cartTotals(id, cart);
    },

    addLine(cartId, { productId, size, quantity }) {
      return mutate(cartId, async (cart) => {
        if (typeof productId !== "string" || !CART_ID_RE.test(productId)) throw new CommerceError("invalid_input", "Invalid product");
        const product = await deps.product(productId);
        if (!product) throw new CommerceError("not_found", "Product not found");
        const existing = cart.lines.find((l) => l.productId === productId && l.size === size);
        await requireStock(product, size, (existing?.quantity ?? 0) + quantity);
        if (existing) {
          existing.quantity += quantity;
        } else {
          // Price always comes from the catalogue, never from the caller.
          cart.lines.push({
            id: randomCommerceId("line"),
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
      });
    },

    updateLine(cartId, lineId, input) {
      return mutate(cartId, async (cart) => {
        const line = cart.lines.find((l) => l.id === lineId);
        if (!line) throw new CommerceError("not_found", "Line not found");
        const product = await deps.product(line.productId);
        if (!product) throw new CommerceError("not_found", "Product not found");
        const size = input.size ?? line.size;
        const quantity = input.quantity ?? line.quantity;
        const twin = cart.lines.find((l) => l !== line && l.productId === line.productId && l.size === size);
        if (twin) {
          // Changing to a size already in the bag merges the two lines.
          await requireStock(product, size, twin.quantity + quantity);
          twin.quantity += quantity;
          cart.lines.splice(cart.lines.indexOf(line), 1);
        } else {
          await requireStock(product, size, quantity);
          line.size = size;
          line.quantity = quantity;
        }
      });
    },

    removeLine(cartId, lineId) {
      return mutate(cartId, async (cart) => {
        const index = cart.lines.findIndex((l) => l.id === lineId);
        if (index === -1) throw new CommerceError("not_found", "Line not found");
        cart.lines.splice(index, 1);
      });
    },

    setCoupon(cartId, code) {
      return mutate(cartId, async (cart) => {
        cart.couponCode = code;
      });
    },

    refreshLine(cartId, lineId, { quantity }) {
      return mutate(cartId, async (cart) => {
        const line = cart.lines.find((l) => l.id === lineId);
        if (!line) throw new CommerceError("not_found", "Line not found");
        const product = await deps.product(line.productId);
        if (!product) throw new CommerceError("not_found", "Product not found");
        line.price = product.price;
        line.mrp = product.mrp;
        if (Number.isInteger(quantity) && quantity >= 1) line.quantity = Math.min(quantity, STORE_CONFIG.maxQtyPerSku);
      });
    },

    async clear(cartId) {
      if (CART_ID_RE.test(cartId)) await deps.repo.delete(cartId);
    },
  };
}

/** In-process repository (dev / tests). */
export function createMemoryCartRepo(): CartRepo {
  const carts = new Map<string, { cart: StoredCart; version: number }>();
  return {
    async get(id) {
      const c = carts.get(id);
      return c ? { cart: structuredClone(c.cart), version: c.version } : null;
    },
    async create(id, cart) {
      carts.set(id, { cart: structuredClone(cart), version: 1 });
    },
    async save(id, cart, version) {
      const c = carts.get(id);
      if (!c || c.version !== version) return false;
      carts.set(id, { cart: structuredClone(cart), version: version + 1 });
      return true;
    },
    async delete(id) {
      carts.delete(id);
    },
  };
}
