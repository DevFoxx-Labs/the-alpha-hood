import { describe, expect, it } from "vitest";
import { MOCK_PRODUCTS } from "@/lib/commerce/mock/data";
import { percentOff } from "@/lib/format";
import { applyFilters, runQuery, sortProducts } from "./engine";
import { activeFilterCount, clearFilters, emptyQuery, PAGE_SIZE, parseQuery, serializeQuery, toggleValue } from "./query";

const soldOut = (p: (typeof MOCK_PRODUCTS)[number]) => p.sizes.every((s) => s.stock === 0);

describe("listing URL state (PLP-02)", () => {
  it("round-trips canonically", () => {
    const q = parseQuery(new URLSearchParams("fit=slim,regular&size=m&price=500-2000&discount=30&instock=1&sort=price-asc&page=2"));
    expect(q.filters.fit).toEqual(["regular", "slim"]);
    expect(serializeQuery(q)).toBe("size=m&fit=regular,slim&price=500-2000&discount=30&instock=1&sort=price-asc&page=2");
    expect(serializeQuery(parseQuery(new URLSearchParams(serializeQuery(q))))).toBe(serializeQuery(q));
    expect(activeFilterCount(q)).toBe(6);
  });

  it("drops unknown keys, malformed values and out-of-range numbers (allow-list)", () => {
    const q = parseQuery({
      fit: "slim,<script>,../x," + "a".repeat(40),
      admin: "1",
      price: "9000-100",
      discount: "33",
      sort: "drop table",
      page: "999",
      size: Array.from({ length: 50 }, (_, i) => `s${i}`).join(","),
    });
    expect(q.filters.fit).toEqual(["slim"]);
    expect(q.price).toBeNull();
    expect(q.discount).toBeNull();
    expect(q.sort).toBe("popularity");
    expect(q.page).toBe(20);
    expect(q.filters.size.length).toBe(20);
  });

  it("relevance sort only exists on search; defaults are omitted from the URL", () => {
    expect(parseQuery({ sort: "relevance" }).sort).toBe("popularity");
    expect(parseQuery({}, { search: true }).sort).toBe("relevance");
    expect(serializeQuery(emptyQuery())).toBe("");
    expect(serializeQuery(emptyQuery("relevance"), { search: true })).toBe("");
  });

  it("changing a filter resets to page 1; clear keeps the sort", () => {
    const q = { ...emptyQuery("price-desc"), page: 3 };
    expect(toggleValue(q, "fit", "slim").page).toBe(1);
    expect(toggleValue(toggleValue(q, "fit", "slim"), "fit", "slim").filters.fit).toEqual([]);
    expect(clearFilters(toggleValue(q, "colour", "black"))).toMatchObject({ sort: "price-desc", page: 1, filters: { colour: [] } });
  });
});

describe("listing engine (PLP-02…04)", () => {
  it("filters by size in stock, colour family, attributes, price, discount and availability", () => {
    const q = { ...emptyQuery(), filters: { ...emptyQuery().filters, size: ["xs"] } };
    const xs = applyFilters(MOCK_PRODUCTS, q);
    expect(xs.length).toBeGreaterThan(0);
    expect(xs.every((p) => p.sizes.some((s) => s.label === "XS" && s.stock > 0))).toBe(true);

    const black = applyFilters(MOCK_PRODUCTS, toggleValue(emptyQuery(), "colour", "black"));
    expect(black.every((p) => p.colourFamily === "black")).toBe(true);

    const priced = applyFilters(MOCK_PRODUCTS, { ...emptyQuery(), price: { min: 1000, max: 1500 } });
    expect(priced.every((p) => p.price >= 100_000 && p.price <= 150_000)).toBe(true);

    const disc = applyFilters(MOCK_PRODUCTS, { ...emptyQuery(), discount: 30 });
    expect(disc.every((p) => percentOff(p.price, p.mrp) >= 30)).toBe(true);

    expect(applyFilters(MOCK_PRODUCTS, { ...emptyQuery(), inStockOnly: true }).some(soldOut)).toBe(false);
  });

  it("ORs values within a filter and ANDs across filters", () => {
    const either = applyFilters(MOCK_PRODUCTS, toggleValue(toggleValue(emptyQuery(), "fit", "slim"), "fit", "oversized"));
    expect(either.every((p) => p.attributes.fit === "slim" || p.attributes.fit === "oversized")).toBe(true);
    const both = applyFilters(MOCK_PRODUCTS, toggleValue(toggleValue(emptyQuery(), "fit", "slim"), "colour", "black"));
    expect(both.every((p) => p.attributes.fit === "slim" && p.colourFamily === "black")).toBe(true);
  });

  it("facet counts are disjunctive and match the filtered results", () => {
    const q = toggleValue(emptyQuery(), "fit", "slim");
    const result = runQuery(MOCK_PRODUCTS, q);
    const fit = result.facets.find((f) => f.key === "fit")!;
    // Own facet ignores its own selection: count for "regular" = all regular products.
    expect(fit.values.find((v) => v.value === "regular")!.count).toBe(MOCK_PRODUCTS.filter((p) => p.attributes.fit === "regular").length);
    // Other facets respect the selection.
    const colour = result.facets.find((f) => f.key === "colour")!;
    expect(colour.values.reduce((n, v) => n + v.count, 0)).toBe(result.total);
  });

  it("sorts correctly and always puts sold-out styles last (CARD-02)", () => {
    for (const sort of ["popularity", "new", "price-asc", "price-desc", "discount", "rating"] as const) {
      const sorted = sortProducts(MOCK_PRODUCTS, { ...emptyQuery(), sort });
      const firstSold = sorted.findIndex(soldOut);
      expect(firstSold).toBeGreaterThan(-1);
      expect(sorted.slice(firstSold).every(soldOut)).toBe(true);
      const inStock = sorted.slice(0, firstSold);
      if (sort === "price-asc") expect(inStock.every((p, i) => i === 0 || inStock[i - 1].price <= p.price)).toBe(true);
      if (sort === "price-desc") expect(inStock.every((p, i) => i === 0 || inStock[i - 1].price >= p.price)).toBe(true);
      if (sort === "new") expect(inStock.every((p, i) => i === 0 || inStock[i - 1].createdAt >= p.createdAt)).toBe(true);
    }
  });

  it("pages are cumulative (Load more keeps earlier items) and deterministic", () => {
    const p1 = runQuery(MOCK_PRODUCTS, emptyQuery());
    const p2 = runQuery(MOCK_PRODUCTS, { ...emptyQuery(), page: 2 });
    expect(p1.products).toHaveLength(PAGE_SIZE);
    expect(p2.products.slice(0, PAGE_SIZE).map((p) => p.id)).toEqual(p1.products.map((p) => p.id));
    expect(p1.total).toBe(MOCK_PRODUCTS.length);
    expect(p1.scopeTotal).toBe(MOCK_PRODUCTS.length);
  });

  it("reports price bounds in rupees rounded to ₹100", () => {
    const { priceRange } = runQuery(MOCK_PRODUCTS, emptyQuery());
    expect(priceRange!.min % 100).toBe(0);
    expect(priceRange!.max % 100).toBe(0);
    expect(priceRange!.min).toBeLessThanOrEqual(599);
  });
});
