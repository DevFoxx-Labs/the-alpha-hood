import { createMemoryGiftCardStore } from "@/lib/giftcards/store";
import { createMemoryLoyaltyStore } from "@/lib/loyalty/store";
import { describe, expect, it } from "vitest";
import { parseAddress } from "@/lib/checkout/address";
import { placeOrder, quote, handlePaymentEvent, type CheckoutDeps } from "@/lib/checkout/service";
import { createMockAdapter } from "@/lib/commerce/mock";
import { MOCK_PRODUCTS } from "@/lib/commerce/mock/data";
import { createKeyedLock } from "@/lib/concurrency/lock";
import { createMemoryCustomerStore } from "@/lib/customers/store";
import { advanceFulfilment, cancelOrder, financialYear, TRANSITIONS } from "@/lib/orders/lifecycle";
import { createMemoryOrderStore, orderPayable } from "@/lib/orders/store";
import { createDemoGateway } from "@/lib/payments/gateway";
import { createMockShipping } from "@/lib/shipping";
import { createMemoryCreditLedger } from "@/lib/wallet/store-credit";
import { createMemoryPhotoStore, sniffType, stripJpeg, stripPng } from "./photos";
import { RETURN_RULES, unitsValue } from "./rules";
import { advanceReturn, cancelReturn, createMemoryReturnStore, createReturn, parseReturnInput, pickupDates, type ReturnDeps } from "./service";

const ENV = { CHECKOUT_ENABLED: "true", COD_ENABLED: "true", NODE_ENV: "test" };
const T0 = new Date("2026-11-23T05:00:00Z");
const ADDRESS = { name: "Test Buyer", phone: "9876543210", pincode: "411045", line1: "Flat 12, Shanti Apartments, Baner Road", line2: "Baner", landmark: "Near park", city: "Pune", state: "Maharashtra", type: "home" };

const shirt = MOCK_PRODUCTS.find((p) => p.category === "shirts" && p.sizes.filter((s) => s.stock >= 5).length >= 2)!;
const [sizeA, sizeB] = shirt.sizes.filter((s) => s.stock >= 5).map((s) => s.label);
const shades = MOCK_PRODUCTS.find((p) => p.category === "sunglasses")!;

function setup(): { deps: ReturnDeps; gateway: ReturnType<typeof createDemoGateway> } {
  const gateway = createDemoGateway("test-secret-test-secret-test-secret!!");
  const base: CheckoutDeps = {
    commerce: createMockAdapter(),
    customers: createMemoryCustomerStore(),
    orders: createMemoryOrderStore(),
    gateway,
    shipping: createMockShipping(),
    locks: createKeyedLock(),
    env: ENV,
  };
  const byId = new Map(MOCK_PRODUCTS.map((p) => [p.id, p]));
  return {
    gateway,
    deps: {
      ...base,
      returns: createMemoryReturnStore(),
      credit: createMemoryCreditLedger(),
      photos: createMemoryPhotoStore(),
      categoryOf: (id) => byId.get(id)?.category,
      sizesOf: (id) => byId.get(id)?.sizes.filter((s) => s.stock > 0).map((s) => s.label) ?? [],
    },
  };
}

async function deliveredOrder(
  deps: ReturnDeps,
  gateway: ReturnType<typeof createDemoGateway>,
  payment: "upi" | "cod",
  items = [{ productId: shirt.id, size: sizeA, quantity: 2 }],
  phone = "+919876500000",
) {
  const { customer } = await deps.customers.findOrCreateByPhone(phone);
  const address = await deps.customers.addAddress(customer.id, parseAddress(ADDRESS));
  const cart = await deps.commerce.cart.create();
  for (const i of items) await deps.commerce.cart.addLine(cart.id, i);
  const q = await quote(deps, { customerId: customer.id, cartId: cart.id, addressId: address.id, speed: "standard", payment, now: T0 });
  const placed = await placeOrder(deps, { customerId: customer.id, cartId: cart.id, addressId: address.id, speed: "standard", payment, idempotencyKey: crypto.randomUUID(), expectedTotal: q.pricing.total, now: T0 });
  if (payment !== "cod") {
    const signed = gateway.simulate(placed.redirectUrl.split("/").pop()!, "succeeded", T0.getTime())!;
    await handlePaymentEvent(deps, gateway.verifyWebhook(signed.rawBody, signed.signature, signed.timestamp, T0.getTime())!, T0);
  }
  for (const to of ["packed", "shipped", "delivered"] as const) await advanceFulfilment(deps, placed.orderNumber, to, T0);
  return { customer, address, order: (await deps.orders.get(placed.orderNumber))! };
}

const dates = pickupDates(T0);
const reqBody = (order: Awaited<ReturnType<typeof deliveredOrder>>["order"], addressId: string, extra: Record<string, unknown> = {}) => ({
  items: [{ lineId: order.lines[0].lineId, quantity: 1 }],
  reason: "too_small",
  resolution: "refund",
  addressId,
  date: dates[0],
  slot: "morning",
  ...extra,
});

describe("ORD-01 fulfilment state machine", () => {
  it("only allows forward transitions; terminal states stay terminal", () => {
    expect(TRANSITIONS.confirmed).toContain("packed");
    expect(TRANSITIONS.cancelled).toEqual([]);
    expect(TRANSITIONS.delivered).not.toContain("shipped");
  });

  it("issues a consecutive GST invoice at dispatch and records the timeline", async () => {
    const { deps, gateway } = setup();
    const a = await deliveredOrder(deps, gateway, "cod", undefined, "+919800000001");
    const b = await deliveredOrder(deps, gateway, "cod", undefined, "+919800000002");
    expect(a.order.invoice!.number).toBe(`INV/${financialYear(T0)}/000001`);
    expect(b.order.invoice!.number).toBe(`INV/${financialYear(T0)}/000002`);
    expect(a.order.timeline.map((t) => t.status)).toEqual(["placed", "confirmed", "packed", "shipped", "delivered"]);
    expect(a.order.tracking?.awb).toMatch(/^\d{12}$/);
    await expect(advanceFulfilment(deps, a.order.number, "packed", T0)).rejects.toMatchObject({ code: "invalid_transition" });
  });

  it("financial year runs April–March in IST", () => {
    expect(financialYear(new Date("2026-03-31T18:31:00Z"))).toBe("2026-27"); // 1 Apr 2026, 00:01 IST
    expect(financialYear(new Date("2026-03-31T18:00:00Z"))).toBe("2025-26"); // 31 Mar 2026, 23:30 IST
    expect(financialYear(new Date("2026-03-31T10:00:00Z"))).toBe("2025-26");
  });
});

describe("ORD-04 cancellation", () => {
  it("prepaid: full refund to source exactly once, stock back; not after packing; owner only", async () => {
    const { deps, gateway } = setup();
    const { customer } = await deps.customers.findOrCreateByPhone("+919811100000");
    const address = await deps.customers.addAddress(customer.id, parseAddress(ADDRESS));
    const cart = await deps.commerce.cart.create();
    await deps.commerce.cart.addLine(cart.id, { productId: shirt.id, size: sizeA, quantity: 1 });
    const before = await deps.commerce.inventory.available(shirt.id, sizeA);
    const q = await quote(deps, { customerId: customer.id, cartId: cart.id, addressId: address.id, speed: "standard", payment: "upi", now: T0 });
    const placed = await placeOrder(deps, { customerId: customer.id, cartId: cart.id, addressId: address.id, speed: "standard", payment: "upi", idempotencyKey: crypto.randomUUID(), expectedTotal: q.pricing.total, now: T0 });
    const s = gateway.simulate(placed.redirectUrl.split("/").pop()!, "succeeded", T0.getTime())!;
    await handlePaymentEvent(deps, gateway.verifyWebhook(s.rawBody, s.signature, s.timestamp, T0.getTime())!, T0);

    await expect(cancelOrder(deps, "cus_other", placed.orderNumber, T0)).rejects.toMatchObject({ status: 404 });
    const [a, b] = await Promise.allSettled([cancelOrder(deps, customer.id, placed.orderNumber, T0), cancelOrder(deps, customer.id, placed.orderNumber, T0)]);
    expect([a.status, b.status].sort()).toEqual(["fulfilled", "rejected"]);
    const o = (await deps.orders.get(placed.orderNumber))!;
    expect(o.fulfilment).toBe("cancelled");
    expect(o.refunds).toHaveLength(1);
    expect(o.refunds[0]).toMatchObject({ amount: q.pricing.total, to: "source" });
    expect(await deps.commerce.inventory.available(shirt.id, sizeA)).toBe(before);
  });

  it("can't cancel once packed", async () => {
    const { deps, gateway } = setup();
    const { order, customer } = await deliveredOrder(deps, gateway, "cod");
    await expect(cancelOrder(deps, customer.id, order.number, T0)).rejects.toMatchObject({ code: "not_cancellable" });
  });
});

describe("RET-01…04 returns", () => {
  it("refund to source after QC: items value, first return free, never above what was paid, once", async () => {
    const { deps, gateway } = setup();
    const { order, customer, address } = await deliveredOrder(deps, gateway, "upi");
    const r = await createReturn(deps, customer.id, parseReturnInput(reqBody(order, address.id), order.number), T0);
    expect(r.amounts.fee).toBe(0);
    expect(r.amounts.payable).toBe(unitsValue(order.lines[0], 1, 0));
    await expect(advanceReturn(deps, r.number, "qc_passed", T0)).rejects.toMatchObject({ code: "invalid_transition" });
    await advanceReturn(deps, r.number, "picked_up", T0);
    const done = await advanceReturn(deps, r.number, "qc_passed", T0);
    expect(done!.status).toBe("completed");
    await expect(advanceReturn(deps, r.number, "qc_passed", T0)).rejects.toMatchObject({ code: "invalid_transition" });
    const o = (await deps.orders.get(order.number))!;
    expect(o.refunds.filter((x) => x.reference === `return:${r.number}`)).toHaveLength(1);
    expect(o.refunds.reduce((n, x) => n + x.amount, 0)).toBeLessThanOrEqual(o.pricing.total);
  });

  it("second return pays the fee; returning the last unit gets the rounding remainder", async () => {
    const { deps, gateway } = setup();
    const { order, customer, address } = await deliveredOrder(deps, gateway, "upi");
    const first = await createReturn(deps, customer.id, parseReturnInput(reqBody(order, address.id), order.number), T0);
    const second = await createReturn(deps, customer.id, parseReturnInput(reqBody(order, address.id), order.number), T0);
    expect(second.amounts.fee).toBe(RETURN_RULES.returnFee);
    expect(first.amounts.itemsValue + second.amounts.itemsValue).toBe(order.lines[0].net);
    // Nothing left to return.
    await expect(createReturn(deps, customer.id, parseReturnInput(reqBody(order, address.id), order.number), T0)).rejects.toMatchObject({ code: "not_returnable" });
  });

  it("COD orders refund to a UPI ID (masked) or store credit with the bonus — never 'source'", async () => {
    const { deps, gateway } = setup();
    const { order, customer, address } = await deliveredOrder(deps, gateway, "cod");
    await expect(createReturn(deps, customer.id, parseReturnInput(reqBody(order, address.id), order.number), T0)).rejects.toMatchObject({ code: "invalid_refund_target" });
    const credit = await createReturn(deps, customer.id, parseReturnInput(reqBody(order, address.id, { resolution: "store_credit" }), order.number), T0);
    expect(credit.amounts.bonus).toBe(Math.floor((credit.amounts.payable * RETURN_RULES.storeCreditBonusPercent) / 100));
    await advanceReturn(deps, credit.number, "picked_up", T0);
    await advanceReturn(deps, credit.number, "qc_passed", T0);
    expect(await deps.credit.balance(customer.id)).toBe(credit.amounts.payable + credit.amounts.bonus);
    // Replaying the completion can't credit twice.
    await deps.credit.add({ customerId: customer.id, amount: credit.amounts.payable, reason: "return_credit", reference: `return:${credit.number}` });
    expect(await deps.credit.balance(customer.id)).toBe(credit.amounts.payable + credit.amounts.bonus);

    const upi = parseReturnInput(reqBody(order, address.id, { refundTo: "upi", upiId: "buyer.name@okbank" }), order.number);
    const r = await createReturn(deps, customer.id, upi, T0);
    expect(r.refundTo).toBe("upi");
    expect(() => parseReturnInput(reqBody(order, address.id, { refundTo: "upi", upiId: "not a upi" }), order.number)).toThrow();
  });

  it("exchange-first: holds the new size, commits it after QC; out-of-stock or same size is refused", async () => {
    const { deps, gateway } = setup();
    const { order, customer, address } = await deliveredOrder(deps, gateway, "cod");
    const before = await deps.commerce.inventory.available(shirt.id, sizeB);
    await expect(
      createReturn(deps, customer.id, parseReturnInput(reqBody(order, address.id, { resolution: "exchange", items: [{ lineId: order.lines[0].lineId, quantity: 1, exchangeSize: sizeA }] }), order.number), T0),
    ).rejects.toMatchObject({ code: "exchange_unavailable" });
    const r = await createReturn(deps, customer.id, parseReturnInput(reqBody(order, address.id, { resolution: "exchange", items: [{ lineId: order.lines[0].lineId, quantity: 1, exchangeSize: sizeB }] }), order.number), T0);
    expect(r.amounts.payable).toBe(0);
    expect(await deps.commerce.inventory.available(shirt.id, sizeB)).toBe(before - 1);
    await advanceReturn(deps, r.number, "picked_up", T0);
    await advanceReturn(deps, r.number, "qc_passed", T0);
    expect(await deps.commerce.inventory.available(shirt.id, sizeB)).toBe(before - 1);
  });

  it("cancel before pickup frees the quantity and the exchange hold; QC fail returns nothing", async () => {
    const { deps, gateway } = setup();
    const { order, customer, address } = await deliveredOrder(deps, gateway, "upi");
    const r = await createReturn(deps, customer.id, parseReturnInput(reqBody(order, address.id), order.number), T0);
    await expect(cancelReturn(deps, "cus_other", r.number, T0)).rejects.toMatchObject({ status: 404 });
    await cancelReturn(deps, customer.id, r.number, T0);
    expect((await deps.orders.get(order.number))!.returnedQty[order.lines[0].lineId]).toBe(0);

    const r2 = await createReturn(deps, customer.id, parseReturnInput(reqBody(order, address.id), order.number), T0);
    await advanceReturn(deps, r2.number, "picked_up", T0);
    await advanceReturn(deps, r2.number, "qc_failed", T0);
    const o = (await deps.orders.get(order.number))!;
    expect(o.refunds).toHaveLength(0);
    expect(o.returnedQty[order.lines[0].lineId]).toBe(0);
  });

  it("rules: window, hygiene categories, damaged needs photos within 24 h, other customers and addresses refused", async () => {
    const { deps, gateway } = setup();
    const { order, customer, address } = await deliveredOrder(deps, gateway, "upi", [
      { productId: shirt.id, size: sizeA, quantity: 1 },
      { productId: shades.id, size: shades.sizes[0].label, quantity: 1 },
    ]);
    const shadesLine = order.lines.find((l) => l.productId === shades.id)!;
    await expect(createReturn(deps, customer.id, parseReturnInput(reqBody(order, address.id, { items: [{ lineId: shadesLine.lineId, quantity: 1 }] }), order.number), T0)).rejects.toMatchObject({ code: "invalid_items" });
    await expect(createReturn(deps, customer.id, parseReturnInput(reqBody(order, address.id, { reason: "damaged" }), order.number), T0)).rejects.toMatchObject({ code: "photos_required" });
    await expect(createReturn(deps, "cus_other", parseReturnInput(reqBody(order, address.id), order.number), T0)).rejects.toMatchObject({ status: 404 });
    const late = new Date(T0.getTime() + (RETURN_RULES.windowDays + 1) * 86_400_000);
    await expect(createReturn(deps, customer.id, parseReturnInput({ ...reqBody(order, address.id), date: pickupDates(late)[0] }, order.number), late)).rejects.toMatchObject({ code: "not_returnable" });
    const other = await deps.customers.findOrCreateByPhone("+919000099999");
    const foreign = await deps.customers.addAddress(other.customer.id, parseAddress(ADDRESS));
    await expect(createReturn(deps, customer.id, parseReturnInput(reqBody(order, foreign.id), order.number), T0)).rejects.toMatchObject({ code: "invalid_items" });
  });

  it("damaged with the customer's own photo is free; someone else's photo is refused", async () => {
    const { deps, gateway } = setup();
    const { order, customer, address } = await deliveredOrder(deps, gateway, "upi");
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xda, 0x00, 0x02, 0x11, 0xff, 0xd9]);
    const mine = await deps.photos.save(customer.id, jpeg);
    const theirs = await deps.photos.save("cus_other", jpeg);
    await expect(createReturn(deps, customer.id, parseReturnInput(reqBody(order, address.id, { reason: "damaged", photoIds: [theirs.id] }), order.number), T0)).rejects.toMatchObject({ code: "invalid_items" });
    const r = await createReturn(deps, customer.id, parseReturnInput(reqBody(order, address.id, { reason: "damaged", photoIds: [mine.id] }), order.number), T0);
    expect(r.amounts.fee).toBe(0);
  });

  it("parser refuses unknown fields, client amounts and bad shapes", () => {
    const base = { items: [{ lineId: `line_${"a".repeat(32)}`, quantity: 1 }], reason: "too_small", resolution: "refund", addressId: "adr_abcdefgh", date: "2026-11-24", slot: "morning" };
    expect(() => parseReturnInput({ ...base, amount: 1 }, "AH12345678")).toThrow();
    expect(() => parseReturnInput({ ...base, items: [{ lineId: "x", quantity: 1 }] }, "AH12345678")).toThrow();
    expect(() => parseReturnInput({ ...base, items: [{ ...base.items[0], quantity: 9 }] }, "AH12345678")).toThrow();
    expect(() => parseReturnInput({ ...base, reason: "free stuff" }, "AH12345678")).toThrow();
    expect(() => parseReturnInput({ ...base, items: [base.items[0], base.items[0]] }, "AH12345678")).toThrow();
  });
});

describe("return photos (private uploads)", () => {
  it("sniffs type from bytes, not the claimed type", () => {
    expect(sniffType(Uint8Array.from([0xff, 0xd8, 0xff, 0x00]))).toBe("image/jpeg");
    expect(sniffType(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(sniffType(new TextEncoder().encode("%PDF-1.4"))).toBeNull();
  });

  it("strips JPEG EXIF (APP1) and PNG text/eXIf chunks", () => {
    const exif = [0xff, 0xe1, 0x00, 0x08, ...new TextEncoder().encode("GPS!!!")];
    const jpeg = Uint8Array.from([0xff, 0xd8, ...exif, 0xff, 0xdb, 0x00, 0x03, 0x01, 0xff, 0xda, 0x00, 0x02, 0x11, 0xff, 0xd9]);
    const clean = stripJpeg(jpeg);
    expect(new TextDecoder().decode(clean)).not.toContain("GPS");
    expect(clean[0]).toBe(0xff);
    expect(() => stripJpeg(Uint8Array.from([0xff, 0xd8, 0x00]))).toThrow();

    const chunk = (type: string, data: number[]) => {
      const len = [0, 0, 0, data.length];
      return [...len, ...new TextEncoder().encode(type), ...data, 0, 0, 0, 0];
    };
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk("IHDR", [1, 2]), ...chunk("tEXt", [...new TextEncoder().encode("GPS")]), ...chunk("IEND", [])]);
    expect(new TextDecoder().decode(stripPng(png))).not.toContain("GPS");
  });

  it("owner-scoped reads; size cap", async () => {
    const store = createMemoryPhotoStore();
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
    const saved = await store.save("cus_a", jpeg);
    expect(await store.get("cus_a", saved.id)).not.toBeNull();
    expect(await store.get("cus_b", saved.id)).toBeNull();
    await expect(store.save("cus_a", new Uint8Array(6 * 1024 * 1024))).rejects.toThrow();
  });
});

describe("CHK-05 returns on a wallet-paid order", () => {
  it("QC pass refunds the card/UPI share to source and the rest back to coins / store credit, once", async () => {
    const { deps, gateway } = setup();
    const loyalty = createMemoryLoyaltyStore();
    const wallet = { loyalty, credit: deps.credit, giftCards: createMemoryGiftCardStore() };
    deps.loyalty = loyalty;
    deps.wallet = wallet;
    const { customer } = await deps.customers.findOrCreateByPhone("+919877700001");
    const address = await deps.customers.addAddress(customer.id, parseAddress(ADDRESS));
    await deps.credit.add({ customerId: customer.id, amount: 20_000, reason: "adjustment", reference: "seed" }, T0);
    await loyalty.join(customer.id, T0);
    await loyalty.addCoins({ customerId: customer.id, coins: 100, kind: "adjustment", reference: "seed-coins", availableAt: new Date(T0.getTime() - 1000).toISOString(), expiresAt: new Date(T0.getTime() + 90 * 86_400_000).toISOString() }, T0);
    const cart = await deps.commerce.cart.create();
    await deps.commerce.cart.addLine(cart.id, { productId: shirt.id, size: sizeA, quantity: 2 });
    const tenders = { coins: 100, useStoreCredit: true, giftCardCode: null };
    const q = await quote(deps, { customerId: customer.id, cartId: cart.id, addressId: address.id, speed: "standard", payment: "upi", tenders, now: T0 });
    const placed = await placeOrder(deps, { customerId: customer.id, cartId: cart.id, addressId: address.id, speed: "standard", payment: "upi", idempotencyKey: crypto.randomUUID(), expectedTotal: q.payable, tenders, now: T0 });
    const signed = gateway.simulate(placed.redirectUrl.split("/").pop()!, "succeeded", T0.getTime())!;
    await handlePaymentEvent(deps, gateway.verifyWebhook(signed.rawBody, signed.signature, signed.timestamp, T0.getTime())!, T0);
    for (const to of ["packed", "shipped", "delivered"] as const) await advanceFulfilment(deps, placed.orderNumber, to, T0);
    const order = (await deps.orders.get(placed.orderNumber))!;
    expect(await deps.credit.balance(customer.id)).toBe(0);

    const r = await createReturn(deps, customer.id, parseReturnInput(reqBody(order, address.id), order.number), T0);
    await advanceReturn(deps, r.number, "picked_up", T0);
    await advanceReturn(deps, r.number, "qc_passed", T0);
    await expect(advanceReturn(deps, r.number, "qc_passed", T0)).rejects.toMatchObject({ code: "invalid_transition" });

    const after = (await deps.orders.get(order.number))!;
    const by = (to: string) => after.refunds.filter((x) => x.to === to).reduce((n, x) => n + x.amount, 0);
    const refunded = by("source") + by("coins") + by("store_credit") + by("gift_card");
    expect(refunded).toBe(r.amounts.payable);
    expect(by("source")).toBeLessThanOrEqual(orderPayable(after));
    expect(by("coins") % 100).toBe(0);
    expect(by("coins")).toBeLessThanOrEqual(100 * 100);
    expect(await deps.credit.balance(customer.id)).toBe(by("store_credit"));
  });
});
