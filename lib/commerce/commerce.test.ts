import { describe, expect, it } from "vitest";
import { emptyQuery } from "@/lib/catalog/query";
import { percentOff } from "@/lib/format";
import { createMockAdapter } from "./mock";
import { MOCK_PRODUCTS } from "./mock/data";
import { resolveCommerce } from "./resolve";
import { CommerceError } from "./types";

const inStock = MOCK_PRODUCTS.find((p) => p.sizes.some((s) => s.stock >= 5))!;
const size = inStock.sizes.find((s) => s.stock >= 5)!.label;

describe("mock catalogue", () => {
  it("has unique ids and handles, integer paise prices, MRP ≥ price", () => {
    expect(new Set(MOCK_PRODUCTS.map((p) => p.id)).size).toBe(MOCK_PRODUCTS.length);
    expect(new Set(MOCK_PRODUCTS.map((p) => p.handle)).size).toBe(MOCK_PRODUCTS.length);
    for (const p of MOCK_PRODUCTS) {
      expect(Number.isInteger(p.price)).toBe(true);
      expect(p.mrp).toBeGreaterThanOrEqual(p.price);
      expect(p.handle).toMatch(/^[a-z0-9-]+$/);
    }
  });
});

describe("mock adapter — catalogue reads", () => {
  const commerce = createMockAdapter();

  it("gets a product by handle and rejects malformed handles", async () => {
    expect((await commerce.getProduct(inStock.handle))?.id).toBe(inStock.id);
    expect(await commerce.getProduct("../../etc/passwd")).toBeNull();
    expect(await commerce.getProduct("x".repeat(500))).toBeNull();
  });

  it("puts sold-out products last (CARD-02)", async () => {
    const first = await commerce.listProducts({ limit: 60 });
    const rest = await commerce.listProducts({ limit: 60, offset: 60 });
    const products = [...first.products, ...rest.products];
    expect(products).toHaveLength(first.total);
    const firstSoldOut = products.findIndex((p) => p.sizes.every((s) => s.stock === 0));
    expect(firstSoldOut).toBeGreaterThan(-1);
    expect(products.slice(firstSoldOut).every((p) => p.sizes.every((s) => s.stock === 0))).toBe(true);
  });

  it("clamps page size so a caller can't request the whole catalogue at once", async () => {
    const { products } = await commerce.listProducts({ limit: 10_000 });
    expect(products.length).toBeLessThanOrEqual(60);
  });

  it("returns collections/categories and null for unknown or malformed handles", async () => {
    expect((await commerce.getCollection("sale"))?.title).toBe("Sale");
    expect(await commerce.getCollection("nope")).toBeNull();
    expect((await commerce.getCategory("jeans"))?.subcategories.map((s) => s.handle)).toContain("baggy");
    expect(await commerce.getCategory("../x")).toBeNull();
  });

  it("scopes searchCatalog to a category / sub-category / collection and rejects bad scopes", async () => {
    const q = emptyQuery();
    const jeans = await commerce.searchCatalog({ kind: "category", category: "jeans", subcategory: "baggy" }, q);
    expect(jeans.total).toBeGreaterThan(0);
    expect(jeans.products.every((p) => p.category === "jeans" && p.subcategory === "baggy")).toBe(true);
    const sale = await commerce.searchCatalog({ kind: "collection", collection: "sale" }, q);
    expect(sale.products.every((p) => percentOff(p.price, p.mrp) >= 30)).toBe(true);
    await expect(commerce.searchCatalog({ kind: "category", category: "a/../b" }, q)).rejects.toMatchObject({ code: "invalid_input" });
    await expect(commerce.searchCatalog({ kind: "collection", collection: "nope" }, q)).rejects.toMatchObject({ code: "not_found" });
  });

  it("every colour is its own product and links its siblings (PDP-03)", () => {
    const tee = MOCK_PRODUCTS.filter((p) => p.title.startsWith("Heavyweight Oversized Tee"));
    expect(tee.length).toBe(3);
    expect(tee[0].colours.map((c) => c.handle)).toEqual(tee.map((p) => p.handle));
  });
});

describe("mock adapter — cart", () => {
  it("adds lines with server-side prices and merges the same size", async () => {
    const commerce = createMockAdapter();
    const cart = await commerce.cart.create();
    await commerce.cart.addLine(cart.id, { productId: inStock.id, size, quantity: 1 });
    const after = await commerce.cart.addLine(cart.id, { productId: inStock.id, size, quantity: 2 });
    expect(after.lines).toHaveLength(1);
    expect(after.itemCount).toBe(3);
    expect(after.subtotal).toBe(inStock.price * 3);
    expect(after.totalMrp).toBe(inStock.mrp * 3);
  });

  it("ignores any client-supplied price (price comes from the catalogue)", async () => {
    const commerce = createMockAdapter();
    const cart = await commerce.cart.create();
    const tampered = { productId: inStock.id, size, quantity: 1, price: 1 } as never;
    const after = await commerce.cart.addLine(cart.id, tampered);
    expect(after.lines[0].price).toBe(inStock.price);
  });

  it("refuses quantity above the per-SKU limit, zero, negatives and fractions", async () => {
    const commerce = createMockAdapter();
    const cart = await commerce.cart.create();
    for (const quantity of [6, 0, -1, 1.5]) {
      await expect(commerce.cart.addLine(cart.id, { productId: inStock.id, size, quantity })).rejects.toBeInstanceOf(CommerceError);
    }
  });

  it("refuses sold-out sizes and unknown sizes/products", async () => {
    const commerce = createMockAdapter();
    const cart = await commerce.cart.create();
    const soldOut = MOCK_PRODUCTS.find((p) => p.sizes.some((s) => s.stock === 0))!;
    const soldOutSize = soldOut.sizes.find((s) => s.stock === 0)!.label;
    await expect(commerce.cart.addLine(cart.id, { productId: soldOut.id, size: soldOutSize, quantity: 1 })).rejects.toMatchObject({ code: "out_of_stock" });
    await expect(commerce.cart.addLine(cart.id, { productId: inStock.id, size: "ZZ", quantity: 1 })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(commerce.cart.addLine(cart.id, { productId: "mock_999", size, quantity: 1 })).rejects.toMatchObject({ code: "not_found" });
  });

  it("refuses unknown or malformed cart ids", async () => {
    const commerce = createMockAdapter();
    await expect(commerce.cart.addLine("cart_zzz", { productId: inStock.id, size, quantity: 1 })).rejects.toMatchObject({ code: "not_found" });
    await expect(commerce.cart.addLine("'; DROP", { productId: inStock.id, size, quantity: 1 })).rejects.toMatchObject({ code: "invalid_input" });
    expect(await commerce.cart.get("../x")).toBeNull();
  });

  it("updates and removes lines", async () => {
    const commerce = createMockAdapter();
    const cart = await commerce.cart.create();
    const added = await commerce.cart.addLine(cart.id, { productId: inStock.id, size, quantity: 1 });
    const lineId = added.lines[0].id;
    expect((await commerce.cart.updateLine(cart.id, lineId, { quantity: 4 })).itemCount).toBe(4);
    await expect(commerce.cart.updateLine(cart.id, lineId, { quantity: 9 })).rejects.toMatchObject({ code: "limit_exceeded" });
    expect((await commerce.cart.removeLine(cart.id, lineId)).lines).toHaveLength(0);
  });

  it("keeps carts isolated from each other", async () => {
    const commerce = createMockAdapter();
    const a = await commerce.cart.create();
    const b = await commerce.cart.create();
    await commerce.cart.addLine(a.id, { productId: inStock.id, size, quantity: 1 });
    expect((await commerce.cart.get(b.id))?.lines).toHaveLength(0);
  });
});

describe("resolveCommerce — fail closed", () => {
  it("uses the mock adapter in development", () => {
    expect(resolveCommerce({ NODE_ENV: "development" }).name).toBe("mock");
  });

  it("refuses mock data in production unless explicitly allowed", async () => {
    const adapter = resolveCommerce({ NODE_ENV: "production" });
    expect(adapter.name).toBe("disabled");
    await expect(adapter.listProducts()).rejects.toThrow(/disabled in production/);
    expect(resolveCommerce({ NODE_ENV: "production", ALLOW_MOCK_DATA: "1" }).name).toBe("disabled");
    expect(resolveCommerce({ NODE_ENV: "production", ALLOW_MOCK_DATA: "true" }).name).toBe("mock");
  });

  it("throws on an unknown provider", () => {
    expect(() => resolveCommerce({ COMMERCE_PROVIDER: "magento" })).toThrow(/Unknown COMMERCE_PROVIDER/);
  });
});
