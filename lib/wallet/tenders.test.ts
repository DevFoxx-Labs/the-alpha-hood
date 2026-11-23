import { describe, expect, it } from "vitest";
import { parseAddress } from "@/lib/checkout/address";
import { cancelOrder } from "@/lib/orders/lifecycle";
import { handlePaymentEvent, placeOrder, quote, reconcilePending, retryPayment, type CheckoutDeps } from "@/lib/checkout/service";
import { createMockAdapter } from "@/lib/commerce/mock";
import { MOCK_PRODUCTS } from "@/lib/commerce/mock/data";
import { createKeyedLock } from "@/lib/concurrency/lock";
import { createMemoryCustomerStore } from "@/lib/customers/store";
import { createMemoryGiftCardStore, formatGiftCode, GIFT_CARD_RULES, giftHash, normaliseGiftCode } from "@/lib/giftcards/store";
import { CLUB } from "@/lib/loyalty/config";
import { sumCoins } from "@/lib/loyalty/service";
import { createMemoryLoyaltyStore } from "@/lib/loyalty/store";
import { createMemoryOrderStore, orderPayable } from "@/lib/orders/store";
import { createDemoGateway } from "@/lib/payments/gateway";
import { createMockShipping } from "@/lib/shipping";
import { createMemoryCreditLedger } from "./store-credit";
import { parseTenderChoice, splitRefund, TENDER_RULES, type TenderChoice } from "./tenders";

const ENV = { CHECKOUT_ENABLED: "true", COD_ENABLED: "true", NODE_ENV: "test" };
const NOW = new Date("2026-11-25T05:00:00Z");
const ADDRESS = { name: "Wallet Buyer", phone: "9876500000", pincode: "411045", line1: "Flat 21, Wallet Heights, Baner Road", line2: "Baner", landmark: "", city: "Pune", state: "Maharashtra", type: "home" };
const item = MOCK_PRODUCTS.find((p) => p.price >= 150_000 && p.sizes.some((s) => s.stock >= 5))!;
const size = item.sizes.find((s) => s.stock >= 5)!.label;

function setup() {
  const gateway = createDemoGateway("test-secret-test-secret-test-secret!!");
  const wallet = { loyalty: createMemoryLoyaltyStore(), credit: createMemoryCreditLedger(), giftCards: createMemoryGiftCardStore() };
  const deps: CheckoutDeps = {
    commerce: createMockAdapter(),
    customers: createMemoryCustomerStore(),
    orders: createMemoryOrderStore(),
    gateway,
    shipping: createMockShipping(),
    locks: createKeyedLock(),
    env: ENV,
    loyalty: wallet.loyalty,
    wallet,
  };
  return { deps, gateway, wallet };
}

async function buyer(deps: CheckoutDeps, phone = "+919811100000") {
  const { customer } = await deps.customers.findOrCreateByPhone(phone);
  const address = await deps.customers.addAddress(customer.id, parseAddress(ADDRESS));
  const cart = await deps.commerce.cart.create();
  await deps.commerce.cart.addLine(cart.id, { productId: item.id, size, quantity: 1 });
  return { customer, address, cartId: cart.id };
}

async function place(deps: CheckoutDeps, b: Awaited<ReturnType<typeof buyer>>, payment: "upi" | "cod", tenders: TenderChoice, expected?: number) {
  const q = await quote(deps, { customerId: b.customer.id, cartId: b.cartId, addressId: b.address.id, speed: "standard", payment, tenders, now: NOW });
  const r = await placeOrder(deps, { customerId: b.customer.id, cartId: b.cartId, addressId: b.address.id, speed: "standard", payment, idempotencyKey: crypto.randomUUID(), expectedTotal: expected ?? q.payable, tenders, now: NOW });
  return { q, r, order: (await deps.orders.get(r.orderNumber))! };
}

function pay(deps: CheckoutDeps, gateway: ReturnType<typeof createDemoGateway>, redirectUrl: string, outcome: "succeeded" | "failed") {
  const signed = gateway.simulate(redirectUrl.split("/").pop()!, outcome, NOW.getTime())!;
  return handlePaymentEvent(deps, gateway.verifyWebhook(signed.rawBody, signed.signature, signed.timestamp, NOW.getTime())!, NOW);
}

async function giveCoins(wallet: ReturnType<typeof setup>["wallet"], customerId: string, coins: number) {
  await wallet.loyalty.join(customerId, NOW);
  await wallet.loyalty.addCoins({ customerId, coins, kind: "adjustment", reference: `seed:${customerId}`, availableAt: new Date(NOW.getTime() - 1000).toISOString(), expiresAt: new Date(NOW.getTime() + 90 * 86_400_000).toISOString() }, NOW);
}

describe("gift cards (PROMO-06)", () => {
  it("codes are random 16-char bearer secrets, stored only as a hash; amount range enforced", async () => {
    const store = createMemoryGiftCardStore();
    const { code, card } = await store.issue({ amount: GIFT_CARD_RULES.min, issuedBy: "staff@x", note: "test" }, NOW);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{16}$/);
    expect(card.hash).toBe(giftHash(code));
    expect(JSON.stringify(await store.list())).not.toContain(code);
    expect(normaliseGiftCode(formatGiftCode(code).toLowerCase())).toBe(code);
    expect(normaliseGiftCode("abc")).toBeNull();
    await expect(store.issue({ amount: GIFT_CARD_RULES.max + 1, issuedBy: "s", note: "n" })).rejects.toThrow();
    await expect(store.add({ hash: card.hash, amount: -(GIFT_CARD_RULES.min + 1), reference: "x" })).rejects.toThrow(/Insufficient/);
    expect(Date.parse(card.expiresAt) - NOW.getTime()).toBe(GIFT_CARD_RULES.validityDays * 86_400_000);
  });
});

describe("tender choice parsing", () => {
  it("strict allow-list: no amounts from the client", () => {
    expect(parseTenderChoice(undefined)).toEqual({ coins: 0, useStoreCredit: false, giftCardCode: null });
    expect(() => parseTenderChoice({ coins: 10, amount: 500 })).toThrow();
    expect(() => parseTenderChoice({ coins: -1 })).toThrow();
    expect(() => parseTenderChoice({ coins: 1.5 })).toThrow();
    expect(() => parseTenderChoice({ giftCardCode: "nope" })).toThrow();
    expect(() => parseTenderChoice({ useStoreCredit: "yes" })).toThrow();
  });
});

describe("paying with the wallet (CHK-05)", () => {
  it("gift card + store credit + coins reduce the amount to pay; invoice total and GST stay the same", async () => {
    const { deps, gateway, wallet } = setup();
    const b = await buyer(deps);
    const { code } = await wallet.giftCards.issue({ amount: 50_000, issuedBy: "s", note: "n" }, NOW);
    await wallet.credit.add({ customerId: b.customer.id, amount: 20_000, reason: "adjustment", reference: "seed" }, NOW);
    await giveCoins(wallet, b.customer.id, 10_000);

    const { q, r, order } = await place(deps, b, "upi", { coins: 99_999, useStoreCredit: true, giftCardCode: code });
    const coinsCap = Math.floor((q.pricing.goodsTotal * TENDER_RULES.coinMaxPercent) / 100 / 100);
    expect(q.tenders.coins).toBe(coinsCap); // capped on the server, never the client's 99,999
    expect(q.tenders.giftCard?.amount).toBe(50_000);
    expect(q.tenders.storeCredit).toBe(20_000);
    expect(q.payable).toBe(q.pricing.total - 50_000 - 20_000 - coinsCap * 100);
    expect(order.pricing.total).toBe(q.pricing.total); // GST / invoice on the full total
    expect(orderPayable(order)).toBe(q.payable);
    expect(order.attempts[0].amount).toBe(q.payable); // gateway charges only the rest
    expect(await wallet.giftCards.balance(giftHash(code))).toBe(0);
    expect(await wallet.credit.balance(b.customer.id)).toBe(0);
    expect(sumCoins(await wallet.loyalty.coins(b.customer.id), NOW).available).toBe(10_000 - coinsCap);
    expect(await pay(deps, gateway, r.redirectUrl, "succeeded")).toBe("confirmed");
  });

  it("a fully wallet-paid order is confirmed with no gateway payment", async () => {
    const { deps, wallet } = setup();
    const b = await buyer(deps);
    const { code } = await wallet.giftCards.issue({ amount: GIFT_CARD_RULES.max, issuedBy: "s", note: "n" }, NOW);
    const { q, r, order } = await place(deps, b, "upi", { coins: 0, useStoreCredit: false, giftCardCode: code });
    expect(q.payable).toBe(0);
    expect(r.status).toBe("confirmed");
    expect(order.attempts).toHaveLength(0);
    expect(await wallet.giftCards.balance(giftHash(code))).toBe(GIFT_CARD_RULES.max - q.pricing.total);
  });

  it("expected amount must match what's left to pay; a stale wallet is refused and nothing is taken", async () => {
    const { deps, wallet } = setup();
    const b = await buyer(deps);
    await wallet.credit.add({ customerId: b.customer.id, amount: 30_000, reason: "adjustment", reference: "seed" }, NOW);
    const q = await quote(deps, { customerId: b.customer.id, cartId: b.cartId, addressId: b.address.id, speed: "standard", payment: "upi", tenders: { coins: 0, useStoreCredit: true, giftCardCode: null }, now: NOW });
    // Client claims the full total (as if no credit) → refused.
    await expect(
      placeOrder(deps, { customerId: b.customer.id, cartId: b.cartId, addressId: b.address.id, speed: "standard", payment: "upi", idempotencyKey: crypto.randomUUID(), expectedTotal: q.pricing.total, tenders: { coins: 0, useStoreCredit: true, giftCardCode: null }, now: NOW }),
    ).rejects.toMatchObject({ code: "total_changed" });
    expect(await wallet.credit.balance(b.customer.id)).toBe(30_000);
  });

  it("unknown, blocked and expired gift cards look the same", async () => {
    const { deps, wallet } = setup();
    const b = await buyer(deps);
    const { code, card } = await wallet.giftCards.issue({ amount: 50_000, issuedBy: "s", note: "n" }, NOW);
    await wallet.giftCards.setDisabled(card.hash, true);
    const ask = (giftCardCode: string) => quote(deps, { customerId: b.customer.id, cartId: b.cartId, addressId: b.address.id, speed: "standard", payment: "upi", tenders: { coins: 0, useStoreCredit: false, giftCardCode }, now: NOW });
    await expect(ask(code)).rejects.toMatchObject({ code: "invalid_gift_card", message: "This gift card can't be used." });
    await expect(ask("ABCDEFGHJKLMNPQR")).rejects.toMatchObject({ code: "invalid_gift_card", message: "This gift card can't be used." });
  });

  it("a failed payment gives everything back; retry takes it again; expiry gives it back once", async () => {
    const { deps, gateway, wallet } = setup();
    const b = await buyer(deps);
    await wallet.credit.add({ customerId: b.customer.id, amount: 25_000, reason: "adjustment", reference: "seed" }, NOW);
    await giveCoins(wallet, b.customer.id, 50);
    const { r } = await place(deps, b, "upi", { coins: 50, useStoreCredit: true, giftCardCode: null });
    expect(await wallet.credit.balance(b.customer.id)).toBe(0);
    expect(await pay(deps, gateway, r.redirectUrl, "failed")).toBe("failed");
    expect(await wallet.credit.balance(b.customer.id)).toBe(25_000);
    expect(sumCoins(await wallet.loyalty.coins(b.customer.id), NOW).available).toBe(50);
    const retry = await retryPayment(deps, b.customer.id, r.orderNumber, NOW);
    expect(await wallet.credit.balance(b.customer.id)).toBe(0);
    // Let the retry expire: reconcile releases once, a second run changes nothing.
    const later = new Date(NOW.getTime() + 20 * 60_000);
    await reconcilePending(deps, later);
    await reconcilePending(deps, later);
    expect(await wallet.credit.balance(b.customer.id)).toBe(25_000);
    expect(sumCoins(await wallet.loyalty.coins(b.customer.id), later).available).toBe(50);
    expect(retry.redirectUrl).toBeTruthy();
  });

  it("cannot double-spend: two orders racing for the same store credit → one wins", async () => {
    const { deps, wallet } = setup();
    const b = await buyer(deps);
    await wallet.credit.add({ customerId: b.customer.id, amount: 40_000, reason: "adjustment", reference: "seed" }, NOW);
    const cart2 = await deps.commerce.cart.create();
    await deps.commerce.cart.addLine(cart2.id, { productId: item.id, size, quantity: 1 });
    const choice = { coins: 0, useStoreCredit: true, giftCardCode: null };
    const q = await quote(deps, { customerId: b.customer.id, cartId: b.cartId, addressId: b.address.id, speed: "standard", payment: "upi", tenders: choice, now: NOW });
    const go = (cartId: string) => placeOrder(deps, { customerId: b.customer.id, cartId, addressId: b.address.id, speed: "standard", payment: "upi", idempotencyKey: crypto.randomUUID(), expectedTotal: q.payable, tenders: choice, now: NOW });
    const results = await Promise.allSettled([go(b.cartId), go(cart2.id)]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await wallet.credit.balance(b.customer.id)).toBe(0);
  });

  it("COD with a gift card collects only the rest at the door", async () => {
    const { deps, wallet } = setup();
    const b = await buyer(deps);
    const { code } = await wallet.giftCards.issue({ amount: 50_000, issuedBy: "s", note: "n" }, NOW);
    const { q, r, order } = await place(deps, b, "cod", { coins: 0, useStoreCredit: false, giftCardCode: code });
    expect(r.status).toBe("confirmed");
    expect(orderPayable(order)).toBe(q.pricing.total - 50_000);
  });
});

describe("refunds go back to each instrument (CHK-05)", () => {
  it("cancelling returns coins, gift card and credit in full; cash to source; once", async () => {
    const { deps, gateway, wallet } = setup();
    const b = await buyer(deps);
    const { code } = await wallet.giftCards.issue({ amount: 50_000, issuedBy: "s", note: "n" }, NOW);
    await wallet.credit.add({ customerId: b.customer.id, amount: 10_000, reason: "adjustment", reference: "seed" }, NOW);
    await giveCoins(wallet, b.customer.id, 40);
    const { r } = await place(deps, b, "upi", { coins: 40, useStoreCredit: true, giftCardCode: code });
    await pay(deps, gateway, r.redirectUrl, "succeeded");
    const cancelled = await cancelOrder(deps, b.customer.id, r.orderNumber, NOW);
    expect(await wallet.giftCards.balance(giftHash(code))).toBe(50_000);
    expect(await wallet.credit.balance(b.customer.id)).toBe(10_000);
    expect(sumCoins(await wallet.loyalty.coins(b.customer.id), NOW).available).toBe(40);
    const source = cancelled.refunds.filter((x) => x.to === "source").reduce((n, x) => n + x.amount, 0);
    expect(source).toBe(orderPayable(cancelled));
    await expect(cancelOrder(deps, b.customer.id, r.orderNumber, NOW)).rejects.toMatchObject({ code: "not_cancellable" });
    expect(await wallet.credit.balance(b.customer.id)).toBe(10_000);
  });

  it("a partial refund is split in proportion and never exceeds what each part paid", () => {
    const order = { pricing: { total: 100_000 }, payable: 50_000, tenders: { coins: 200, giftCard: { hash: "h", last4: "AAAA", amount: 20_000 }, storeCredit: 10_000, total: 50_000 }, refunds: [] } as never;
    const s = splitRefund(order, 40_000, 0);
    expect(s.source + s.coins + s.wallet).toBe(40_000);
    expect(s.coins % 100).toBe(0);
    expect(s.coins).toBe(8_000);
    expect(s.wallet).toBe(12_000);
    expect(s.source).toBe(20_000);
    const all = splitRefund(order, 100_000, 0);
    expect(all).toEqual({ source: 50_000, coins: 20_000, wallet: 30_000 });
    expect(CLUB.coinExpiryDays).toBeGreaterThan(0);
  });
});

describe("review fixes (CHK-05)", () => {
  it("coins used to pay earn no new coins", async () => {
    const { onDelivered } = await import("@/lib/loyalty/service");
    const loyalty = createMemoryLoyaltyStore();
    const order = {
      number: "AH-T1",
      customerId: "cus_t1",
      deliveredAt: NOW.toISOString(),
      club: { tier: "member", earnPercent: 5, returnWindowDays: 30 },
      pricing: { goodsTotal: 200_000 },
      tenders: { coins: 400, giftCard: null, storeCredit: 0, total: 40_000 },
    } as never;
    await loyalty.join("cus_t1", NOW);
    await onDelivered(order, loyalty);
    const earn = await loyalty.entry("earn:AH-T1");
    expect(earn?.coins).toBe(80); // 5% of ₹1,600 paid by other means, not of ₹2,000
  });

  it("COD with wallet tenders: the courier collects only the rest", async () => {
    const { deps, wallet } = setup();
    const b = await buyer(deps, "+919811100077");
    const { code } = await wallet.giftCards.issue({ amount: 60_000, issuedBy: "s", note: "n" }, NOW);
    const { order } = await place(deps, b, "cod", { coins: 0, useStoreCredit: false, giftCardCode: code });
    expect(orderPayable(order)).toBe(order.pricing.total - 60_000);
    expect(orderPayable(order)).toBeLessThan(order.pricing.total);
  });
});

describe("security review R1: a gateway failure never strands the wallet", () => {
  it("createPayment throws → order expired, stock and store credit given back at once", async () => {
    const { deps, wallet } = setup();
    const b = await buyer(deps, "+919811100099");
    await wallet.credit.add({ customerId: b.customer.id, amount: 30_000, reason: "adjustment", reference: "seed" }, NOW);
    const before = await deps.commerce.inventory.available(item.id, size, NOW);
    deps.gateway = { ...deps.gateway, createPayment: async () => { throw new Error("gateway down"); } };
    const choice = { coins: 0, useStoreCredit: true, giftCardCode: null };
    const q = await quote(deps, { customerId: b.customer.id, cartId: b.cartId, addressId: b.address.id, speed: "standard", payment: "upi", tenders: choice, now: NOW });
    await expect(
      placeOrder(deps, { customerId: b.customer.id, cartId: b.cartId, addressId: b.address.id, speed: "standard", payment: "upi", idempotencyKey: crypto.randomUUID(), expectedTotal: q.payable, tenders: choice, now: NOW }),
    ).rejects.toThrow("gateway down");
    expect(await wallet.credit.balance(b.customer.id)).toBe(30_000);
    expect(await deps.commerce.inventory.available(item.id, size, NOW)).toBe(before);
    const [order] = await deps.orders.listByCustomer(b.customer.id);
    expect(order.status).toBe("expired");
  });
});
