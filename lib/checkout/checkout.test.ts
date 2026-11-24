import { demoVerify } from "@/lib/payments/test-helpers";
import { describe, expect, it } from "vitest";
import { createOtpStore, OtpError, sendOtp, verifyOtp, OTP_COOLDOWN_MS } from "@/lib/auth/otp";
import { loadCartView } from "@/lib/cart/service";
import { createMockAdapter } from "@/lib/commerce/mock";
import { MOCK_PRODUCTS } from "@/lib/commerce/mock/data";
import { createKeyedLock } from "@/lib/concurrency/lock";
import { createMemoryCustomerStore } from "@/lib/customers/store";
import { createMemoryOrderStore } from "@/lib/orders/store";
import { createDemoGateway } from "@/lib/payments/gateway";
import { createMockShipping } from "@/lib/shipping";
import { addressQuality, parseAddress } from "./address";
import { codDecision } from "./cod-risk";
import { checkoutEnabled, codEnabled, mockPaymentsAllowed } from "./flags";
import { handlePaymentEvent, placeOrder, quote, reconcilePending, RESERVATION_TTL_MS, retryPayment, type CheckoutDeps } from "./service";

const ENV = { CHECKOUT_ENABLED: "true", COD_ENABLED: "true", NODE_ENV: "test" };
const NOW = new Date("2026-11-23T05:00:00Z");
const ADDRESS = {
  name: "Test Buyer",
  phone: "9876543210",
  pincode: "411045",
  line1: "Flat 12, Shanti Apartments, Baner Road",
  line2: "Baner",
  landmark: "Near Balewadi High Street",
  city: "Pune",
  state: "Maharashtra",
  type: "home",
};

const inStock = MOCK_PRODUCTS.find((p) => p.price >= 100_000 && p.sizes.some((s) => s.stock >= 5))!;
const size = inStock.sizes.find((s) => s.stock >= 5)!.label;
// A size with exactly one unit left, for race tests.
const lastUnit = MOCK_PRODUCTS.flatMap((p) => p.sizes.filter((s) => s.stock === 1).map((s) => ({ p, size: s.label })))[0];

function setup(env = ENV) {
  const gateway = createDemoGateway("test-secret-test-secret-test-secret!!");
  const deps: CheckoutDeps = {
    commerce: createMockAdapter(),
    customers: createMemoryCustomerStore(),
    orders: createMemoryOrderStore(),
    gateway,
    shipping: createMockShipping(),
    locks: createKeyedLock(),
    env,
  };
  return { deps, gateway };
}

async function buyer(deps: CheckoutDeps, phone = "+919876543210", items: { productId: string; size: string; quantity: number }[] = [{ productId: inStock.id, size, quantity: 1 }]) {
  const { customer } = await deps.customers.findOrCreateByPhone(phone);
  const address = await deps.customers.addAddress(customer.id, parseAddress(ADDRESS));
  const cart = await deps.commerce.cart.create();
  for (const i of items) await deps.commerce.cart.addLine(cart.id, i);
  return { customer, address, cartId: cart.id };
}

async function place(deps: CheckoutDeps, b: Awaited<ReturnType<typeof buyer>>, payment: "upi" | "cod" | "card", key = crypto.randomUUID()) {
  const q = await quote(deps, { customerId: b.customer.id, cartId: b.cartId, addressId: b.address.id, speed: "standard", payment, now: NOW });
  return placeOrder(deps, {
    customerId: b.customer.id,
    cartId: b.cartId,
    addressId: b.address.id,
    speed: "standard",
    payment,
    idempotencyKey: key,
    expectedTotal: q.pricing.total,
    now: NOW,
  });
}

function pay(deps: CheckoutDeps, gateway: ReturnType<typeof createDemoGateway>, redirectUrl: string, outcome: "succeeded" | "failed") {
  const paymentId = redirectUrl.split("/").pop()!;
  const signed = gateway.simulate(paymentId, outcome, NOW.getTime())!;
  const event = demoVerify(gateway, signed.rawBody, signed.signature, signed.timestamp, NOW.getTime())!;
  return { event, signed, run: () => handlePaymentEvent(deps, event, NOW) };
}

describe("flags fail closed", () => {
  it("checkout and COD are off unless exactly 'true'; mock payments never on the live store", () => {
    expect(checkoutEnabled({})).toBe(false);
    expect(checkoutEnabled({ CHECKOUT_ENABLED: "1" })).toBe(false);
    expect(codEnabled({ COD_ENABLED: "true" })).toBe(false);
    expect(mockPaymentsAllowed({ NODE_ENV: "production" })).toBe(false);
    expect(mockPaymentsAllowed({ NODE_ENV: "production", ALLOW_MOCK_PAYMENTS: "true" })).toBe(true);
  });

  it("placing an order with checkout switched off is refused", async () => {
    const { deps } = setup({ NODE_ENV: "test" } as never);
    const b = await buyer(deps);
    await expect(place(deps, b, "upi")).rejects.toMatchObject({ code: "checkout_disabled", status: 503 });
  });
});

describe("OTP (CHK-02)", () => {
  it("verifies the right code once; wrong codes, reuse and expiry fail", async () => {
    const store = createOtpStore();
    const sent = await sendOtp("+919876543210", { store, now: 1_000 });
    expect(sent.demoCode).toMatch(/^\d{6}$/);
    await expect(verifyOtp(sent.challengeId, "000000" === sent.demoCode ? "111111" : "000000", { store, now: 2_000 })).rejects.toBeInstanceOf(OtpError);
    expect(await verifyOtp(sent.challengeId, sent.demoCode!, { store, now: 3_000 })).toBe("+919876543210");
    await expect(verifyOtp(sent.challengeId, sent.demoCode!, { store, now: 4_000 })).rejects.toMatchObject({ code: "invalid" });

    const late = await sendOtp("+919999999999", { store, now: 0 });
    await expect(verifyOtp(late.challengeId, late.demoCode!, { store, now: 6 * 60_000 })).rejects.toMatchObject({ code: "expired" });
  });

  it("locks after 5 wrong attempts and never stores the code in clear", async () => {
    const store = createOtpStore();
    const sent = await sendOtp("+919876543211", { store, now: 0 });
    const wrong = sent.demoCode === "123456" ? "654321" : "123456";
    for (let i = 0; i < 4; i++) await expect(verifyOtp(sent.challengeId, wrong, { store, now: 1 })).rejects.toMatchObject({ code: "invalid" });
    await expect(verifyOtp(sent.challengeId, wrong, { store, now: 1 })).rejects.toMatchObject({ code: "locked" });
    await expect(verifyOtp(sent.challengeId, sent.demoCode!, { store, now: 1 })).rejects.toMatchObject({ code: "locked" });
    expect(JSON.stringify([...store.challenges.values()])).not.toContain(sent.demoCode);
  });

  it("enforces the resend cooldown and hourly cap", async () => {
    const store = createOtpStore();
    await sendOtp("+919876543212", { store, now: 0 });
    await expect(sendOtp("+919876543212", { store, now: 1_000 })).rejects.toMatchObject({ code: "cooldown" });
    let t = 0;
    for (let i = 0; i < 4; i++) await sendOtp("+919876543212", { store, now: (t += OTP_COOLDOWN_MS) });
    await expect(sendOtp("+919876543212", { store, now: (t += OTP_COOLDOWN_MS) })).rejects.toMatchObject({ code: "limited" });
  });
});

describe("cart re-validation (CART-05)", () => {
  it("flags quantity reductions and unavailable lines from live stock", async () => {
    const { deps } = setup();
    const cart = await deps.commerce.cart.create();
    await deps.commerce.cart.addLine(cart.id, { productId: lastUnit.p.id, size: lastUnit.size, quantity: 1 });
    await deps.commerce.inventory.reserve("someone-else", [{ productId: lastUnit.p.id, size: lastUnit.size, quantity: 1 }], RESERVATION_TTL_MS);
    const view = await loadCartView(cart.id, {}, deps.commerce);
    expect(view.lines[0].status).toBe("unavailable");
    expect(view.hasIssues).toBe(true);
    expect(view.pricing.total).toBe(0);
  });

  it("unknown or malformed cart ids give an empty bag", async () => {
    const { deps } = setup();
    expect((await loadCartView("cart_doesnotexist", {}, deps.commerce)).lines).toEqual([]);
    expect((await loadCartView("../../etc", {}, deps.commerce)).lines).toEqual([]);
  });
});

describe("placing orders", () => {
  it("COD: confirms, commits stock, clears the bag, counts the order", async () => {
    const { deps } = setup();
    const b = await buyer(deps);
    const before = await deps.commerce.inventory.available(inStock.id, size, NOW);
    const r = await place(deps, b, "cod");
    expect(r.status).toBe("confirmed");
    expect(await deps.commerce.inventory.available(inStock.id, size, NOW)).toBe(before - 1);
    expect(await deps.commerce.cart.get(b.cartId)).toBeNull();
    expect((await deps.customers.get(b.customer.id))!.orderCount).toBe(1);
    const order = (await deps.orders.get(r.orderNumber))!;
    expect(order.pricing.codFee).toBeGreaterThan(0);
    expect(order.codRisk).not.toBeNull();
  });

  it("is idempotent per Idempotency-Key (double click / retry never makes two orders)", async () => {
    const { deps } = setup();
    const b = await buyer(deps);
    const key = crypto.randomUUID();
    const [a, c] = await Promise.all([place(deps, b, "upi", key), place(deps, b, "upi", key)]);
    expect(a.orderNumber).toBe(c.orderNumber);
    expect((await deps.orders.listByStatus("pending_payment")).length).toBe(1);
  });

  it("refuses a total the shopper didn't see (tampered/out-of-date expectedTotal)", async () => {
    const { deps } = setup();
    const b = await buyer(deps);
    await expect(
      placeOrder(deps, { customerId: b.customer.id, cartId: b.cartId, addressId: b.address.id, speed: "standard", payment: "upi", idempotencyKey: crypto.randomUUID(), expectedTotal: 100, now: NOW }),
    ).rejects.toMatchObject({ code: "total_changed", status: 409 });
  });

  it("refuses another customer's address (ownership)", async () => {
    const { deps } = setup();
    const a = await buyer(deps, "+919000000001");
    const other = await buyer(deps, "+919000000002");
    await expect(
      placeOrder(deps, { customerId: a.customer.id, cartId: a.cartId, addressId: other.address.id, speed: "standard", payment: "upi", idempotencyKey: crypto.randomUUID(), expectedTotal: 1, now: NOW }),
    ).rejects.toMatchObject({ code: "address_not_found", status: 404 });
  });

  it("race: two buyers, one last unit → exactly one order gets it", async () => {
    const { deps } = setup();
    const item = [{ productId: lastUnit.p.id, size: lastUnit.size, quantity: 1 }];
    const b1 = await buyer(deps, "+919000000011", item);
    const b2 = await buyer(deps, "+919000000012", item);
    const results = await Promise.allSettled([place(deps, b1, "upi"), place(deps, b2, "upi")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "out_of_stock" } });
    expect(await deps.commerce.inventory.available(lastUnit.p.id, lastUnit.size, NOW)).toBe(0);
  });

  it("COD is refused above the limit (CHK-07)", async () => {
    const { deps } = setup();
    const expensive = MOCK_PRODUCTS.find((p) => p.price >= 300_000 && p.sizes.some((s) => s.stock >= 2))!;
    const s = expensive.sizes.find((x) => x.stock >= 2)!.label;
    const b = await buyer(deps, "+919000000021", [{ productId: expensive.id, size: s, quantity: 2 }]);
    await expect(place(deps, b, "cod")).rejects.toMatchObject({ code: "cod_unavailable" });
  });
});

describe("payment events (CHK-06)", () => {
  it("success confirms once; replayed/duplicate events are no-ops", async () => {
    const { deps, gateway } = setup();
    const b = await buyer(deps);
    const r = await place(deps, b, "upi");
    const { run, event } = pay(deps, gateway, r.redirectUrl, "succeeded");
    expect(await run()).toBe("confirmed");
    expect(await handlePaymentEvent(deps, event, NOW)).toBe("duplicate");
    expect(await handlePaymentEvent(deps, { ...event, id: "evt_ffffffffffffffffffffffff" }, NOW)).toBe("already_final");
    expect((await deps.customers.get(b.customer.id))!.orderCount).toBe(1);
    expect((await deps.orders.get(r.orderNumber))!.status).toBe("confirmed");
  });

  it("rejects forged, tampered or stale webhooks", async () => {
    const { deps, gateway } = setup();
    const b = await buyer(deps);
    const r = await place(deps, b, "card");
    const { signed } = pay(deps, gateway, r.redirectUrl, "succeeded");
    expect(demoVerify(gateway, signed.rawBody.replace(/"amount":\d+/, '"amount":1'), signed.signature, signed.timestamp, NOW.getTime())).toBeNull();
    expect(demoVerify(gateway, signed.rawBody, "0".repeat(64), signed.timestamp, NOW.getTime())).toBeNull();
    expect(demoVerify(gateway, signed.rawBody, signed.signature, signed.timestamp, NOW.getTime() + 10 * 60_000)).toBeNull();
    expect(demoVerify(gateway, signed.rawBody, null, null)).toBeNull();
  });

  it("an amount that doesn't match the order is never confirmed", async () => {
    const { deps, gateway } = setup();
    const b = await buyer(deps);
    const r = await place(deps, b, "upi");
    const { event } = pay(deps, gateway, r.redirectUrl, "succeeded");
    expect(await handlePaymentEvent(deps, { ...event, amount: 100 }, NOW)).toBe("amount_mismatch");
    expect((await deps.orders.get(r.orderNumber))!.status).toBe("needs_review");
  });

  it("failure releases stock and keeps the bag; retry creates a new attempt that can succeed", async () => {
    const { deps, gateway } = setup();
    const b = await buyer(deps);
    const before = await deps.commerce.inventory.available(inStock.id, size, NOW);
    const r = await place(deps, b, "upi");
    expect(await deps.commerce.inventory.available(inStock.id, size, NOW)).toBe(before - 1);
    expect(await pay(deps, gateway, r.redirectUrl, "failed").run()).toBe("failed");
    expect(await deps.commerce.inventory.available(inStock.id, size, NOW)).toBe(before);
    expect(await deps.commerce.cart.get(b.cartId)).not.toBeNull();

    await expect(retryPayment(deps, "cus_someoneelse", r.orderNumber, NOW)).rejects.toMatchObject({ status: 404 });
    const again = await retryPayment(deps, b.customer.id, r.orderNumber, NOW);
    expect(await pay(deps, gateway, again.redirectUrl, "succeeded").run()).toBe("confirmed");
    expect((await deps.orders.get(r.orderNumber))!.attempts).toHaveLength(2);
  });

  it("reconciliation confirms a paid order whose webhook was missed, and expires abandoned ones", async () => {
    const { deps, gateway } = setup();
    const paid = await place(deps, await buyer(deps, "+919000000031"), "upi");
    gateway.simulate(paid.redirectUrl.split("/").pop()!, "succeeded"); // webhook "lost"
    const abandoned = await place(deps, await buyer(deps, "+919000000032"), "upi");
    const later = new Date(NOW.getTime() + RESERVATION_TTL_MS + 60_000);
    const results = await reconcilePending(deps, later);
    expect(results[paid.orderNumber]).toBe("confirmed");
    expect(results[abandoned.orderNumber]).toBe("expired");
    expect((await deps.orders.get(abandoned.orderNumber))!.status).toBe("expired");
  });
});

describe("COD risk (CHK-07)", () => {
  const promise = { serviceable: true, pincode: "411045", cod: { available: true, fee: 4900, maxOrderValue: 500000 } };
  const customer = { codBlocked: false, rtoCount: 0, orderCount: 3 };
  it("allows a good order and blocks on each hard rule", () => {
    expect(codDecision({ codEnabled: true, total: 200000, promise, customer, addressQuality: 90 }).allowed).toBe(true);
    expect(codDecision({ codEnabled: false, total: 200000, promise, customer, addressQuality: 90 }).allowed).toBe(false);
    expect(codDecision({ codEnabled: true, total: 600000, promise, customer, addressQuality: 90 }).allowed).toBe(false);
    expect(codDecision({ codEnabled: true, total: 200000, promise: { ...promise, cod: { ...promise.cod, available: false } }, customer, addressQuality: 90 }).allowed).toBe(false);
    expect(codDecision({ codEnabled: true, total: 200000, promise, customer: { ...customer, rtoCount: 2 }, addressQuality: 90 }).allowed).toBe(false);
    expect(codDecision({ codEnabled: true, total: 200000, promise: { ...promise, pincode: "845201" }, customer, addressQuality: 90 }).allowed).toBe(false);
    expect(codDecision({ codEnabled: true, total: 200000, promise, customer, addressQuality: 20 }).allowed).toBe(false);
  });

  it("scores address quality", () => {
    expect(addressQuality({ line1: "Flat 12, Shanti Apartments, Baner Road", line2: "Baner", landmark: "Near park" })).toBeGreaterThanOrEqual(90);
    expect(addressQuality({ line1: "aaaaaaa", line2: "", landmark: "" })).toBeLessThan(40);
  });
});

describe("address validation (CHK-03)", () => {
  it("accepts a good address and rejects bad fields / unknown keys", () => {
    expect(parseAddress(ADDRESS).phone).toBe("+919876543210");
    expect(() => parseAddress({ ...ADDRESS, pincode: "012345" })).toThrow();
    expect(() => parseAddress({ ...ADDRESS, state: "Atlantis" })).toThrow();
    expect(() => parseAddress({ ...ADDRESS, customerId: "x" })).toThrow();
    expect(() => parseAddress({ ...ADDRESS, line1: "x".repeat(200) })).toThrow();
  });
});
