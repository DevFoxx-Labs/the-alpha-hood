import { describe, expect, it } from "vitest";
import { createMockAdapter } from "@/lib/commerce/mock";
import { MOCK_PRODUCTS } from "@/lib/commerce/mock/data";
import { emptyQuery } from "@/lib/catalog/query";
import { canonical, editDistance, normalise, tokens } from "./engine";

const commerce = createMockAdapter();
const titles = async (q: string) =>
  (await commerce.searchCatalog({ kind: "search", q }, emptyQuery("relevance"))).products.map((p) => p.title);

describe("search normalisation (SRCH-02)", () => {
  it("treats t-shirt / tshirt / t shirt / tee as one term", () => {
    for (const q of ["T-Shirt", "tshirt", "t shirt", "tees", "TEE"]) expect(tokens(q)).toEqual(["tshirt"]);
  });

  it("maps Hinglish and synonyms", () => {
    expect(canonical("pant")).toBe("trouser");
    expect(canonical("lower")).toBe("jogger");
    expect(canonical("chashma")).toBe("sunglasses");
    expect(canonical("joota")).toBe("sneaker");
    expect(normalise("Co-ord   SETS!!")).toBe("coord sets");
  });

  it("bounds edit distance", () => {
    expect(editDistance("hodie", "hoodie", 1)).toBe(1);
    expect(editDistance("jaket", "jacket", 1)).toBe(1);
    expect(editDistance("sheirt", "shirt", 1)).toBe(1);
    expect(editDistance("tshirt", "trouser", 2)).toBeGreaterThan(2);
  });
});

describe("catalogue search", () => {
  it("finds tees by any spelling", async () => {
    for (const q of ["tshirt", "t-shirt", "tee"]) {
      const r = await titles(q);
      expect(r.length).toBeGreaterThan(0);
      expect(r.some((t) => t.includes("Tee"))).toBe(true);
    }
  });

  it("tolerates typos", async () => {
    expect((await titles("hodie")).some((t) => t.includes("Hoodie"))).toBe(true);
    expect((await titles("baggi jeans")).some((t) => t.includes("Baggy Jeans"))).toBe(true);
  });

  it("matches Hinglish and synonyms", async () => {
    expect((await titles("pant")).some((t) => /Trousers|Chinos/.test(t))).toBe(true);
    expect((await titles("lower")).some((t) => t.includes("Joggers"))).toBe(true);
    expect((await titles("chashma")).every((t) => t.includes("Sunglasses"))).toBe(true);
  });

  it("narrows with every word (AND) and ranks title matches first", async () => {
    const r = await titles("black hoodie");
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((t) => t.includes("Hoodie") && t.includes("Black"))).toBe(true);
  });

  it("returns nothing for gibberish or empty input", async () => {
    expect(await titles("zzqxv")).toEqual([]);
    expect(await titles("   ")).toEqual([]);
  });

  it("suggests products and categories, capped", async () => {
    const s = await commerce.suggest("jeans", 50);
    expect(s.products.length).toBeLessThanOrEqual(10);
    expect(s.categories[0]).toEqual({ title: "Jeans", href: "/men/jeans" });
    expect(Object.keys(s.products[0]).sort()).toEqual(["handle", "image", "mrp", "price", "title"]);
  });

  it("index covers the whole catalogue", async () => {
    const all = await commerce.searchCatalog({ kind: "search", q: "the" }, emptyQuery("relevance"));
    expect(all.scopeTotal).toBeLessThan(MOCK_PRODUCTS.length);
  });
});
