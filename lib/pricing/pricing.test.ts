import { describe, expect, it } from "vitest";
import { rupees } from "@/lib/format";
import { applyCombos, COMBOS } from "@/lib/promotions/combos";
import { DEMO_COUPONS, evaluateCoupon, findCoupon, normaliseCouponCode, type Coupon } from "@/lib/promotions/coupons";
import { gstClassFor, inclusiveTax, isIntraState, rateFor, splitTax } from "./gst";
import { COD_FEE, priceCart, SHIPPING_FEE, type PricingLineInput } from "./price-cart";

const now = new Date("2026-11-22T10:00:00Z");
const line = (id: string, category: string, price: number, qty = 1, mrp = price + 500, subcategory?: string): PricingLineInput => ({
  lineId: id,
  productId: `p_${id}`,
  category,
  subcategory,
  quantity: qty,
  unitPrice: rupees(price),
  unitMrp: rupees(mrp),
});

function invariants(p: ReturnType<typeof priceCart>) {
  expect(p.goodsTotal).toBe(p.lines.reduce((n, l) => n + l.net, 0));
  expect(p.total).toBe(p.goodsTotal + p.shipping + p.expressFee + p.codFee);
  for (const l of p.lines) {
    expect(Number.isSafeInteger(l.net)).toBe(true);
    expect(l.net).toBeGreaterThanOrEqual(0);
    expect(l.net).toBe(l.unitPrice * l.quantity - l.automaticDiscount - l.comboDiscount - l.couponDiscount - l.prepaidDiscount);
  }
  expect(p.gst.total).toBe(p.gst.cgst + p.gst.sgst + p.gst.igst);
  expect(p.total).toBeGreaterThanOrEqual(0);
}

describe("GST (CHK-10, demo table)", () => {
  it("extracts inclusive tax and splits intra/inter-state", () => {
    expect(inclusiveTax(rupees(1050), 5)).toBe(rupees(50));
    expect(inclusiveTax(rupees(1180), 18)).toBe(rupees(180));
    expect(splitTax(101, true)).toEqual({ cgst: 50, sgst: 51, igst: 0 });
    expect(splitTax(101, false)).toEqual({ cgst: 0, sgst: 0, igst: 101 });
    expect(isIntraState("maharashtra")).toBe(true);
    expect(isIntraState("Karnataka")).toBe(false);
  });

  it("uses the per-piece value slab", () => {
    expect(rateFor("apparel", rupees(2500))).toBe(5);
    expect(rateFor("apparel", rupees(2500) + 1)).toBe(18);
    expect(gstClassFor("sneakers")).toBe("footwear");
  });
});

describe("combos (PROMO-04)", () => {
  it("bundles the most expensive eligible units and splits the discount proportionally", () => {
    const r = applyCombos(
      [
        { lineId: "a", unitPrice: rupees(2199), quantity: 1, category: "jeans" },
        { lineId: "b", unitPrice: rupees(1999), quantity: 1, category: "trousers" },
        { lineId: "c", unitPrice: rupees(1299), quantity: 1, category: "joggers" },
      ],
      COMBOS,
      now,
    );
    expect(r.applications).toEqual([{ comboId: "any-2-bottoms", title: expect.any(String), bundles: 1, discount: rupees(2199 + 1999 - 2999) }]);
    expect((r.lineDiscounts.get("a") ?? 0) + (r.lineDiscounts.get("b") ?? 0)).toBe(rupees(1199));
    expect(r.lineDiscounts.get("c")).toBeUndefined();
    expect(r.progress).toEqual([expect.objectContaining({ comboId: "any-2-bottoms", have: 1, need: 1 })]);
  });

  it("never bundles when it would not save money, and counts quantities as units", () => {
    const cheap = applyCombos([{ lineId: "t", unitPrice: rupees(599), quantity: 3, category: "t-shirts" }], COMBOS, now);
    expect(cheap.applications).toEqual([]);
    const tees = applyCombos([{ lineId: "t", unitPrice: rupees(899), quantity: 4, category: "t-shirts" }], COMBOS, now);
    expect(tees.applications[0]).toMatchObject({ bundles: 1, discount: rupees(899 * 3 - 1999) });
    expect(tees.lineBundledUnits.get("t")).toBe(3);
  });
});

describe("coupons (PROMO-01)", () => {
  const ctx = (lines: { value: number; nonComboValue?: number; category?: string }[], extra: Partial<Parameters<typeof evaluateCoupon>[1]> = {}) => ({
    lines: lines.map((l, i) => ({ lineId: `l${i}`, category: l.category ?? "shirts", value: l.value, nonComboValue: l.nonComboValue ?? l.value })),
    payment: null,
    customer: null,
    now,
    ...extra,
  });
  const alpha = findCoupon("ALPHA10")!;
  const hood200 = findCoupon("HOOD200")!;

  it("normalises codes and rejects junk", () => {
    expect(normaliseCouponCode(" alpha10 ")).toBe("ALPHA10");
    expect(normaliseCouponCode("A'; DROP")).toBeNull();
    expect(normaliseCouponCode(42)).toBeNull();
  });

  it("enforces minimum cart, first order, per-customer limit, prepaid-only and expiry", () => {
    expect(evaluateCoupon(hood200, ctx([{ value: rupees(1500) }]))).toMatchObject({ ok: false, shortBy: rupees(499) });
    expect(evaluateCoupon(alpha, ctx([{ value: rupees(1000) }], { customer: { orderCount: 1, uses: 0 } }))).toMatchObject({ ok: false });
    expect(evaluateCoupon(hood200, ctx([{ value: rupees(2500) }], { customer: { orderCount: 3, uses: 3 } }))).toMatchObject({ ok: false });
    const upi = findCoupon("UPI150")!;
    expect(evaluateCoupon(upi, ctx([{ value: rupees(2000) }], { payment: "cod" }))).toMatchObject({ ok: false });
    expect(evaluateCoupon(upi, ctx([{ value: rupees(2000) }]))).toMatchObject({ ok: true, provisional: "prepaid orders only" });
    const expired: Coupon = { ...hood200, endsAt: "2026-01-01T00:00:00Z" };
    expect(evaluateCoupon(expired, ctx([{ value: rupees(2500) }]))).toMatchObject({ ok: false });
  });

  it("caps percent coupons and excludes combo units", () => {
    const r = evaluateCoupon(alpha, ctx([{ value: rupees(5000) }]));
    expect(r).toMatchObject({ ok: true, discount: rupees(300) });
    expect(evaluateCoupon(alpha, ctx([{ value: rupees(2999), nonComboValue: 0 }]))).toMatchObject({ ok: false });
  });

  it("allocates the discount across eligible lines exactly", () => {
    const r = evaluateCoupon(alpha, ctx([{ value: 33_333 }, { value: 33_333 }, { value: 33_334 }]));
    if (!r.ok) throw new Error("expected ok");
    expect([...r.allocations.values()].reduce((a, b) => a + b, 0)).toBe(r.discount);
  });

  it("every demo coupon has a valid code", () => {
    for (const c of DEMO_COUPONS) expect(normaliseCouponCode(c.code)).toBe(c.code);
  });
});

describe("priceCart (the one money function)", () => {
  it("charges shipping below the threshold and not above", () => {
    const small = priceCart({ lines: [line("a", "t-shirts", 699)], now });
    expect(small.shipping).toBe(SHIPPING_FEE);
    expect(small.freeShippingRemaining).toBe(rupees(300));
    invariants(small);
    const big = priceCart({ lines: [line("a", "shirts", 1299)], now });
    expect(big.shipping).toBe(0);
    invariants(big);
  });

  it("applies combo → coupon → prepaid in order and keeps invariants", () => {
    const p = priceCart({
      lines: [line("j", "jeans", 2199), line("t", "trousers", 1999), line("s", "shirts", 1299)],
      coupon: findCoupon("HOOD200"),
      payment: "upi",
      shipState: "Maharashtra",
      now,
    });
    expect(p.comboDiscount).toBe(rupees(1199));
    // HOOD200 excludes combo units: eligible = ₹1,299 shirt < ₹1,999 minimum → not applied.
    expect(p.coupon).toMatchObject({ ok: false });
    expect(p.prepaidDiscount).toBe(Math.min(Math.floor((p.goodsTotal + p.prepaidDiscount) * 0.05), rupees(150)));
    expect(p.savings).toBe(p.saleDiscount + p.comboDiscount + p.couponDiscount + p.prepaidDiscount + p.automaticDiscount);
    expect(p.gst.cgst).toBeGreaterThan(0);
    invariants(p);
  });

  it("adds COD fee and express fee only when chosen", () => {
    const base = { lines: [line("a", "shirts", 1299)], now };
    expect(priceCart({ ...base, payment: "cod" }).codFee).toBe(COD_FEE);
    expect(priceCart({ ...base, payment: "upi" }).codFee).toBe(0);
    expect(priceCart({ ...base, speed: "express", expressFee: rupees(99) }).expressFee).toBe(rupees(99));
    expect(priceCart({ ...base, speed: "express", expressFee: null }).expressFee).toBe(0);
  });

  it("checks coupon customer limits when the customer is known", () => {
    const lines = [line("a", "shirts", 2499)];
    expect(priceCart({ lines, coupon: findCoupon("ALPHA10"), customer: { orderCount: 0, couponUses: {} }, now }).coupon).toMatchObject({ ok: true });
    expect(priceCart({ lines, coupon: findCoupon("ALPHA10"), customer: { orderCount: 2, couponUses: {} }, now }).coupon).toMatchObject({ ok: false });
  });

  it("rejects tampered inputs: negative, fractional or over-limit quantities and prices", () => {
    expect(() => priceCart({ lines: [{ ...line("a", "shirts", 1299), quantity: 0 }], now })).toThrow();
    expect(() => priceCart({ lines: [{ ...line("a", "shirts", 1299), quantity: 6 }], now })).toThrow();
    expect(() => priceCart({ lines: [{ ...line("a", "shirts", 1299), unitPrice: -1 }], now })).toThrow();
    expect(() => priceCart({ lines: [{ ...line("a", "shirts", 1299), unitPrice: 10.5 }], now })).toThrow();
  });

  it("an empty bag costs nothing", () => {
    const p = priceCart({ lines: [], payment: "cod", now });
    expect(p.total).toBe(0);
    invariants(p);
  });

  it("holds invariants across many random carts", () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const cats = ["jeans", "trousers", "t-shirts", "hoodies", "shirts", "sneakers", "sunglasses"];
    for (let i = 0; i < 300; i++) {
      const lines = Array.from({ length: 1 + Math.floor(rand() * 5) }, (_, j) =>
        line(`l${j}`, cats[Math.floor(rand() * cats.length)], 499 + Math.floor(rand() * 3500), 1 + Math.floor(rand() * 5)),
      );
      const p = priceCart({
        lines,
        coupon: DEMO_COUPONS[Math.floor(rand() * DEMO_COUPONS.length)],
        payment: (["upi", "card", "cod", null] as const)[Math.floor(rand() * 4)],
        shipState: rand() > 0.5 ? "Maharashtra" : "Delhi",
        now,
      });
      invariants(p);
    }
  });
});
