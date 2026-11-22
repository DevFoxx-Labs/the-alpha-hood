import { describe, expect, it } from "vitest";
import { SIZE_CHARTS, toInches } from "@/lib/catalog/size-charts";
import { MOCK_PRODUCTS, MOCK_REVIEWS } from "@/lib/commerce/mock/data";
import { COOKIE_INVENTORY } from "@/lib/consent/purposes";
import { rupees } from "@/lib/format";
import { bestCouponFor, couponDiscount, type Coupon } from "@/lib/promotions/coupons";
import { createMockReviews } from "@/lib/reviews";
import { parseReviewQuery, queryReviews, summarise } from "@/lib/reviews/summary";
import { productJsonLd, toJsonLd } from "@/lib/seo/json-ld";
import { addBusinessDays, createMockShipping, resolveShipping } from "@/lib/shipping";

describe("coupons (PROMO-01 maths, paise)", () => {
  const pct: Coupon = { code: "P", kind: "percent", value: 10, minCart: 0, maxDiscount: rupees(300), description: "" };
  const flat: Coupon = { code: "F", kind: "flat", value: rupees(200), minCart: rupees(1999), description: "" };

  it("percent rounds down to whole paise and respects the cap", () => {
    expect(couponDiscount(pct, 129_999)).toBe(12_999);
    expect(couponDiscount(pct, rupees(5000))).toBe(rupees(300));
  });

  it("flat needs the minimum cart and never exceeds the subtotal", () => {
    expect(couponDiscount(flat, rupees(1998))).toBe(0);
    expect(couponDiscount(flat, rupees(1999))).toBe(rupees(200));
    expect(couponDiscount({ ...flat, minCart: 0, value: rupees(500) }, rupees(100))).toBe(rupees(100));
  });

  it("rejects non-integer / non-positive subtotals", () => {
    expect(couponDiscount(pct, 100.5)).toBe(0);
    expect(couponDiscount(pct, -100)).toBe(0);
  });

  it("picks the best live coupon for a price", () => {
    expect(bestCouponFor(rupees(1299))?.coupon.code).toBe("ALPHA10");
    expect(bestCouponFor(rupees(3499))?.coupon.code).toBe("ALPHA10"); // 10% capped at ₹300 > ₹200
    expect(bestCouponFor(rupees(4999))?.coupon.code).toBe("HOOD500");
    const expired = [{ ...pct, endsAt: "2020-01-01T00:00:00Z" }];
    expect(bestCouponFor(rupees(1000), expired)).toBeNull();
  });
});

describe("delivery promise (PDP-05)", () => {
  it("skips Sundays and applies the 2 pm IST dispatch cut-off", () => {
    // Sat 21 Nov 2026, 10:00 IST → +2 business days = Tue 24 Nov (Sunday skipped)
    expect(addBusinessDays(new Date("2026-11-21T04:30:00Z"), 2)).toBe("2026-11-24");
    // Sat 21 Nov 2026, 15:00 IST → after cut-off: +1 → Wed 25 Nov
    expect(addBusinessDays(new Date("2026-11-21T09:30:00Z"), 2)).toBe("2026-11-25");
  });

  it("covers serviceable, prepaid-only and unserviceable pincodes", async () => {
    const s = createMockShipping();
    const now = new Date("2026-11-23T04:30:00Z");
    const pune = await s.check("411045", now);
    expect(pune).toMatchObject({ serviceable: true, city: "Pune", cod: { available: true } });
    expect(pune.express).not.toBeNull();
    expect((await s.check("799001", now)).cod.available).toBe(false);
    expect((await s.check("744101", now)).serviceable).toBe(false);
    await expect(s.check("011045", now)).rejects.toThrow();
  });

  it("fails closed in production without a shipping partner", async () => {
    await expect(resolveShipping({ NODE_ENV: "production" }).check("411045")).rejects.toThrow(/no production backend/);
  });
});

describe("reviews (PDP-08)", () => {
  const style = MOCK_PRODUCTS.find((p) => p.rating)!;
  const own = MOCK_REVIEWS.filter((r) => r.styleId === style.styleId);

  it("card ratings are computed from the same reviews the PDP shows", () => {
    const s = summarise(own)!;
    expect(style.rating).toEqual({ average: s.average, count: s.count });
    expect(s.distribution.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(98);
    expect(s.fit).toBeGreaterThanOrEqual(0);
  });

  it("filters, sorts and pages", () => {
    const five = queryReviews(own, { rating: 5, sort: "recent", page: 1 });
    expect(five.reviews.every((r) => r.rating === 5)).toBe(true);
    const photos = queryReviews(own, { withPhotos: true, sort: "recent", page: 1 });
    expect(photos.reviews.every((r) => r.photos.length > 0)).toBe(true);
    const helpful = queryReviews(own, { sort: "helpful", page: 2 });
    expect(helpful.reviews.length).toBeLessThanOrEqual(10);
    expect(helpful.reviews.every((r, i, a) => i === 0 || a[i - 1].helpful >= r.helpful)).toBe(true);
  });

  it("parses list params by allow-list", () => {
    const q = parseReviewQuery(new URLSearchParams("rating=9&size=<x>&page=999&sort=drop&photos=1"));
    expect(q).toEqual({ rating: undefined, withPhotos: true, size: undefined, sort: "recent", page: 50 });
  });

  it("falls back to category reviews when a style has none", async () => {
    const adapter = createMockReviews();
    const noReviews = MOCK_PRODUCTS.find((p) => !p.rating && MOCK_REVIEWS.some((r) => r.category === p.category))!;
    const res = await adapter.summary(noReviews.styleId, noReviews.category);
    expect(res?.scope).toBe("category");
  });

  it("allows one helpful vote per voter per review", async () => {
    const adapter = createMockReviews();
    const r = own[0];
    const first = await adapter.voteHelpful(r.id, "voter-a");
    expect(first).toBe(r.helpful + 1);
    expect(await adapter.voteHelpful(r.id, "voter-a")).toBeNull();
    expect(await adapter.voteHelpful(r.id, "voter-b")).toBe(r.helpful + 2);
    expect(await adapter.voteHelpful("rv_nope", "voter-a")).toBeNull();
  });
});

describe("product data completeness", () => {
  it("every product has Legal Metrology fields, SKU, specs and a size chart that covers its sizes", () => {
    for (const p of MOCK_PRODUCTS) {
      expect(p.legal.manufacturer).toBeTruthy();
      expect(p.legal.countryOfOrigin).toBeTruthy();
      expect(p.legal.netQuantity).toBeTruthy();
      expect(p.sku).toMatch(/^AH-[A-Z]{3}-\d{3}-[A-Z0-9]{1,3}$/);
      expect(p.specs.some((s) => s.label === "Wash care")).toBe(true);
      if (p.sizeChart !== "none") {
        const chartSizes = SIZE_CHARTS[p.sizeChart].rows.map((r) => r.size);
        for (const s of p.sizes) expect(chartSizes).toContain(s.label);
      }
    }
    expect(new Set(MOCK_PRODUCTS.map((p) => p.sku)).size).toBe(MOCK_PRODUCTS.length);
  });

  it("converts cm to inches with one decimal", () => {
    expect(toInches(106)).toBe("41.7");
  });

  it("the Cookie Policy lists the device-only pincode and recent-search keys", () => {
    const names = COOKIE_INVENTORY.map((c) => c.name).join(" ");
    expect(names).toContain("ah_pincode");
    expect(names).toContain("ah_recent_searches");
  });
});

describe("structured data (PDP-12)", () => {
  it("escapes characters that could close the script tag", () => {
    const out = toJsonLd({ name: "</script><script>alert(1)</script> &  " });
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
    expect(out).not.toContain("&");
    expect(out).not.toContain(" ");
    expect(JSON.parse(out).name).toContain("</script>");
  });

  it("emits Product + Offer (+ AggregateRating only with own reviews) + BreadcrumbList", () => {
    const p = MOCK_PRODUCTS.find((x) => x.rating)!;
    const [product, crumbs] = productJsonLd({ product: p, url: "https://x.test/p", brand: "B", breadcrumbs: [{ name: "Home", url: "https://x.test/" }], rating: summarise(MOCK_REVIEWS.filter((r) => r.styleId === p.styleId)) }) as [Record<string, never>, Record<string, never>];
    expect(product["@type"]).toBe("Product");
    expect(product.offers).toMatchObject({ priceCurrency: "INR", price: (p.price / 100).toFixed(2) });
    expect(product.aggregateRating).toBeDefined();
    expect(crumbs["@type"]).toBe("BreadcrumbList");
    const [noRating] = productJsonLd({ product: p, url: "u", brand: "B", breadcrumbs: [], rating: null }) as [Record<string, unknown>];
    expect(noRating.aggregateRating).toBeUndefined();
  });
});
