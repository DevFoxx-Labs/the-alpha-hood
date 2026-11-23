import { type CatalogSnapshot, createCatalogReader } from "@/lib/catalog/reader";
import { createCartOps, createMemoryCartRepo } from "../cart-engine";
import { CommerceError, type CommerceAdapter } from "../types";
import { MOCK_CATEGORIES, MOCK_CATEGORY_TREE, MOCK_COLLECTIONS, MOCK_NOW, MOCK_PRODUCTS } from "./data";

/** The demo catalogue as a snapshot (also what `pnpm db:seed` writes into the own backend). */
export const DEMO_SNAPSHOT: CatalogSnapshot = {
  products: MOCK_PRODUCTS,
  tree: MOCK_CATEGORY_TREE,
  featured: MOCK_CATEGORIES,
  collections: MOCK_COLLECTIONS,
  now: MOCK_NOW,
};

/**
 * In-memory mock commerce adapter for local development and tests.
 * Cart state lives in this process only — never use it in production (see lib/commerce/index.ts).
 */

interface Reservation {
  items: { key: string; quantity: number }[];
  expiresAt: number;
  state: "held" | "committed" | "released";
}

export function createMockAdapter(): CommerceAdapter {
  const sold = new Map<string, number>();
  const reservations = new Map<string, Reservation>();
  const restocked = new Set<string>();
  const skuKey = (productId: string, size: string) => `${productId}::${size}`;

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

  const adapter: CommerceAdapter = {
    name: "mock",

    // Shared catalogue read rules (lib/catalog/reader.ts) on the static demo snapshot.
    ...createCatalogReader(() => DEMO_SNAPSHOT),

    // Shared bag rules (lib/commerce/cart-engine.ts) on an in-process repository.
    cart: createCartOps({
      repo: createMemoryCartRepo(),
      product: async (id) => MOCK_PRODUCTS.find((p) => p.id === id) ?? null,
      available: async (productId, size) => availableNow(productId, size, Date.now()),
    }),

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
