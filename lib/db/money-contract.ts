import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MOCK_PRODUCTS } from "@/lib/commerce/mock/data";
import type { Order } from "@/lib/orders/store";
import { type StoresUnderTest, testTargets } from "./testing";

/**
 * Phase 2 money contract, identical on memory, MySQL, PostgreSQL and MongoDB. Every race here is a real money
 * bug if it fails: overselling the last unit, spending a balance twice, two invoices with one number, a payment
 * attached to two orders, two checkouts running at once.
 *
 * Registered from contract.test.ts (not its own *.test.ts): every database suite resets the same `_test`
 * database, so they must run in one file, one after another — never in parallel test workers.
 */
const inStock = MOCK_PRODUCTS.find((p) => p.sizes.some((s) => s.stock >= 5))!;
const size = inStock.sizes.find((s) => s.stock >= 5)!.label;
const lastUnit = MOCK_PRODUCTS.flatMap((p) => p.sizes.filter((s) => s.stock === 1).map((s) => ({ p, size: s.label })))[0];

function orderInput(customerId: string, key: string, extra: Partial<Order> = {}): Omit<Order, "id" | "number"> {
  return {
    customerId,
    cartId: null,
    status: "pending_payment",
    paymentMethod: "upi",
    attempts: [],
    lines: [],
    pricing: { total: 100_000, goodsTotal: 100_000 } as Order["pricing"],
    address: {} as Order["address"],
    delivery: { speed: "standard", by: null },
    couponCode: null,
    codRisk: null,
    idempotencyKey: key,
    createdAt: new Date().toISOString(),
    confirmedAt: null,
    notes: [],
    fulfilment: "placed",
    timeline: [],
    tracking: null,
    deliveredAt: null,
    refunds: [],
    returnedQty: {},
    invoice: null,
    ...extra,
  };
}

for (const target of testTargets()) {
  describe(`money contract · ${target.name}`, () => {
    let s: StoresUnderTest;
    beforeAll(async () => {
      s = await target.setup();
    }, 60_000);
    afterAll(async () => {
      await target.teardown();
    });

    it("lock: mutual exclusion per key, released after errors", async () => {
      let inside = 0;
      let max = 0;
      const work = () =>
        s.locks.run("contract:k1", async () => {
          inside++;
          max = Math.max(max, inside);
          await new Promise((r) => setTimeout(r, 15));
          inside--;
        });
      await Promise.all([work(), work(), work(), work()]);
      expect(max).toBe(1);
      await expect(s.locks.run("contract:k2", async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
      expect(await s.locks.run("contract:k2", async () => "free again")).toBe("free again");
    }, 30_000);

    it("orders: idempotency key unique, conditional transitions, payment id owned by one order", async () => {
      const a = await s.orders.create(orderInput("cus_o1", "key-1", { attempts: [{ paymentId: "pay_contract_1", amount: 100_000, status: "pending", createdAt: new Date().toISOString() }] }));
      await expect(s.orders.create(orderInput("cus_o1", "key-1"))).rejects.toThrow(/idempotency/i);
      expect(a.number).toMatch(/^AH[0-9A-Z]{8}$/);
      expect((await s.orders.byIdempotency("cus_o1", "key-1"))?.number).toBe(a.number);
      expect((await s.orders.byPaymentId("pay_contract_1"))?.number).toBe(a.number);
      // Two webhooks race to confirm: exactly one transition wins.
      const results = await Promise.all([1, 2, 3].map(() => s.orders.transition(a.number, ["pending_payment"], "confirmed", (o) => o.timeline.push({ status: "confirmed", at: "t" }))));
      expect(results.filter(Boolean)).toHaveLength(1);
      const now = (await s.orders.get(a.number))!;
      expect(now.status).toBe("confirmed");
      expect(now.timeline).toHaveLength(1);
      expect(await s.orders.transition(a.number, ["pending_payment"], "expired")).toBeNull();
      // Concurrent updates never lose a change.
      await Promise.all(Array.from({ length: 5 }, (_, i) => s.orders.update(a.number, (o) => o.notes.push(`n${i}`))));
      expect((await s.orders.get(a.number))!.notes.sort()).toEqual(["n0", "n1", "n2", "n3", "n4"]);
      // A payment id can't move to a second order.
      const b = await s.orders.create(orderInput("cus_o1", "key-2"));
      await expect(s.orders.update(b.number, (o) => o.attempts.push({ paymentId: "pay_contract_1", amount: 1, status: "pending", createdAt: "t" }))).rejects.toThrow();
      expect((await s.orders.byPaymentId("pay_contract_1"))?.number).toBe(a.number);
      expect((await s.orders.listByCustomer("cus_o1")).map((o) => o.number)).toContain(b.number);
      expect((await s.orders.listByStatus("confirmed")).some((o) => o.number === a.number)).toBe(true);
    });

    it("orders: webhook events processed once; invoice numbers gap-free and unique under concurrency", async () => {
      expect(await s.orders.markEvent("evt_contract_1")).toBe(true);
      expect(await s.orders.markEvent("evt_contract_1")).toBe(false);
      const numbers = await Promise.all(Array.from({ length: 10 }, () => s.orders.nextInvoiceNumber("2099-00")));
      expect(new Set(numbers).size).toBe(10);
      expect(numbers.map((n) => Number(n.split("/")[2])).sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(numbers[0]).toMatch(/^INV\/2099-00\/\d{6}$/);
    });

    it("inventory: the last unit can be held by exactly one checkout; commit, release, restock are idempotent", async () => {
      const inv = s.commerce.inventory;
      const now = new Date();
      const item = [{ productId: lastUnit.p.id, size: lastUnit.size, quantity: 1 }];
      expect(await inv.available(lastUnit.p.id, lastUnit.size, now)).toBe(1);
      const race = await Promise.allSettled([inv.reserve("res_a", item, 60_000, now), inv.reserve("res_b", item, 60_000, now), inv.reserve("res_c", item, 60_000, now)]);
      expect(race.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(race.filter((r) => r.status === "rejected").every((r) => (r as PromiseRejectedResult).reason.code === "out_of_stock")).toBe(true);
      const winner = ["res_a", "res_b", "res_c"][race.findIndex((r) => r.status === "fulfilled")];
      expect(await inv.available(lastUnit.p.id, lastUnit.size, now)).toBe(0);
      expect(await inv.isHeld(winner, now)).toBe(true);
      await inv.reserve(winner, item, 60_000, now); // re-hold by the same reference: no-op
      await inv.commit(winner);
      await inv.commit(winner);
      expect(await inv.isHeld(winner, now)).toBe(false);
      expect(await inv.available(lastUnit.p.id, lastUnit.size, now)).toBe(0);
      await inv.restock(`cancel:${winner}`, item);
      await inv.restock(`cancel:${winner}`, item);
      expect(await inv.available(lastUnit.p.id, lastUnit.size, now)).toBe(1);
      // An expired hold frees the stock; release is a no-op after commit.
      await inv.reserve("res_expiring", item, 1, now);
      expect(await inv.available(lastUnit.p.id, lastUnit.size, new Date(now.getTime() + 1000))).toBe(1);
      await inv.release("res_expiring");
      // Adjust never goes below zero.
      await expect(inv.adjust(lastUnit.p.id, lastUnit.size, -5)).rejects.toMatchObject({ code: "invalid_input" });
      expect(await inv.adjust(lastUnit.p.id, lastUnit.size, 4)).toBe(5);
      await expect(inv.adjust("nope", "M", 1)).rejects.toMatchObject({ code: "not_found" });
      const snap = (await inv.snapshot(now)).find((x) => x.productId === lastUnit.p.id && x.size === lastUnit.size)!;
      expect(snap).toMatchObject({ onHand: 5, available: 5 });
    }, 30_000);

    it("cart: catalogue prices, per-SKU limit, stock check, merges, concurrent adds don't lose quantity", async () => {
      const c = s.commerce.cart;
      const cart = await c.create();
      expect(cart.id).toMatch(/^cart_[0-9a-f]{32}$/);
      const added = await c.addLine(cart.id, { productId: inStock.id, size, quantity: 1 });
      expect(added.lines[0].price).toBe(inStock.price);
      await Promise.all([c.addLine(cart.id, { productId: inStock.id, size, quantity: 1 }), c.addLine(cart.id, { productId: inStock.id, size, quantity: 1 })]);
      expect((await c.get(cart.id))!.lines[0].quantity).toBe(3);
      await expect(c.addLine(cart.id, { productId: inStock.id, size, quantity: 10 })).rejects.toMatchObject({ code: "limit_exceeded" });
      await expect(c.addLine(cart.id, { productId: "nope", size, quantity: 1 })).rejects.toMatchObject({ code: "not_found" });
      const lineId = (await c.get(cart.id))!.lines[0].id;
      await c.setCoupon(cart.id, "ALPHA10");
      expect((await c.get(cart.id))!.couponCode).toBe("ALPHA10");
      await c.removeLine(cart.id, lineId);
      expect((await c.get(cart.id))!.lines).toHaveLength(0);
      await c.clear(cart.id);
      expect(await c.get(cart.id)).toBeNull();
      expect(await c.get("../etc/passwd")).toBeNull();
    });

    it("store credit: idempotent per reference, never negative even when debits race", async () => {
      await s.credit.add({ customerId: "cus_c1", amount: 10_000, reason: "adjustment", reference: "seed:c1" });
      await s.credit.add({ customerId: "cus_c1", amount: 10_000, reason: "adjustment", reference: "seed:c1" }); // retry → no-op
      expect(await s.credit.balance("cus_c1")).toBe(10_000);
      const race = await Promise.allSettled(Array.from({ length: 4 }, (_, i) => s.credit.add({ customerId: "cus_c1", amount: -4_000, reason: "spent", reference: `spend:c1:${i}` })));
      expect(race.filter((r) => r.status === "fulfilled")).toHaveLength(2);
      expect(await s.credit.balance("cus_c1")).toBe(2_000);
      expect((await s.credit.history("cus_c1")).length).toBe(3);
    });

    it("Hood Coins + Alpha Club: one membership, unique codes, coin floor, referrals once, erase", async () => {
      const [m1, m2] = await Promise.all([s.loyalty.join("cus_l1"), s.loyalty.join("cus_l1")]);
      expect(m1.referralCode).toBe(m2.referralCode);
      expect((await s.loyalty.memberByCode(m1.referralCode))?.customerId).toBe("cus_l1");
      const t = new Date().toISOString();
      await s.loyalty.addCoins({ customerId: "cus_l1", coins: 100, kind: "earn", reference: "earn:X", availableAt: t, expiresAt: null });
      expect((await s.loyalty.entry("earn:X"))?.coins).toBe(100);
      const race = await Promise.allSettled([1, 2].map((i) => s.loyalty.addCoins({ customerId: "cus_l1", coins: -70, kind: "redeemed", reference: `redeem:${i}`, availableAt: t, expiresAt: null })));
      expect(race.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(await s.loyalty.recordReferral({ code: m1.referralCode, referrerId: "cus_l1", friendId: "cus_f", orderNumber: "AH0000001" })).toBe(true);
      expect(await s.loyalty.recordReferral({ code: m1.referralCode, referrerId: "cus_l1", friendId: "cus_f", orderNumber: "AH0000001" })).toBe(false);
      expect(await s.loyalty.referralsBy("cus_l1")).toHaveLength(1);
      await s.loyalty.erase("cus_l1");
      expect(await s.loyalty.getMember("cus_l1")).toBeNull();
      expect(await s.loyalty.coins("cus_l1")).toEqual([]);
    });

    it("gift cards: issued with a balance, debits can't overspend under a race, block works", async () => {
      const { code, card } = await s.giftCards.issue({ amount: 100_000, issuedBy: "staff@x", note: "contract" });
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{16}$/);
      expect(await s.giftCards.balance(card.hash)).toBe(100_000);
      const race = await Promise.allSettled([1, 2, 3].map((i) => s.giftCards.add({ hash: card.hash, amount: -40_000, reference: `gc:${i}` })));
      expect(race.filter((r) => r.status === "fulfilled")).toHaveLength(2);
      expect(await s.giftCards.balance(card.hash)).toBe(20_000);
      await expect(s.giftCards.add({ hash: "0".repeat(64), amount: 1, reference: "x" })).rejects.toThrow();
      expect(await s.giftCards.setDisabled(card.hash, true)).toBe(true);
      expect((await s.giftCards.get(card.hash))?.disabled).toBe(true);
      const listed = (await s.giftCards.list()).find((c) => c.hash === card.hash)!;
      expect(listed.balance).toBe(20_000);
      expect(JSON.stringify(await s.giftCards.list())).not.toContain(code);
    });
  });
}

// ── End to end: the real API routes running on each configured database ─────────────────────────
import { vi } from "vitest";
import { POST as linePOST } from "@/app/api/cart/lines/route";
import { POST as addressPOST } from "@/app/api/checkout/addresses/route";
import { POST as placePOST } from "@/app/api/checkout/place/route";
import { POST as quotePOST } from "@/app/api/checkout/quote/route";
import { POST as cancelPOST } from "@/app/api/orders/[number]/cancel/route";
import { POST as otpSend } from "@/app/api/otp/send/route";
import { POST as otpVerify } from "@/app/api/otp/verify/route";
import { createMockAdapter } from "@/lib/commerce/mock";
import { giftHash } from "@/lib/giftcards/store";
import { rateLimiter } from "@/lib/http/rate-limit";
import { createDbStores } from "./index";

for (const target of testTargets().filter((t) => t.cfg)) {
  describe(`checkout API on the own backend · ${target.name}`, () => {
    const ORIGIN = "http://localhost:3000";
    const req = (path: string, method: string, body?: unknown, cookie?: string, headers: Record<string, string> = {}) =>
      new Request(`${ORIGIN}${path}`, {
        method,
        headers: { "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": "198.51.100.41", ...(cookie ? { cookie } : {}), ...headers },
        body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
      });
    const cookieOf = (res: Response, name: string) => res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`))?.split(";")[0];
    const ADDRESS = { name: "Db Buyer", phone: "9876543210", pincode: "411045", line1: "Flat 12, Shanti Apartments, Baner Road", line2: "Baner", landmark: "Near park", city: "Pune", state: "Maharashtra", type: "home" };

    beforeAll(async () => {
      await target.setup();
      vi.stubEnv("DATABASE_DRIVER", target.cfg!.driver);
      vi.stubEnv("DATABASE_URL", target.cfg!.url);
      vi.stubEnv("ACCOUNTS_ENABLED", "true");
      vi.stubEnv("CHECKOUT_ENABLED", "true");
      vi.stubEnv("COD_ENABLED", "true");
      rateLimiter.reset();
    }, 60_000);
    afterAll(async () => {
      vi.unstubAllEnvs();
      await target.teardown();
    });

    it("bag → gift card + COD order → replay → cancel: stock, order and balance all persisted and restored", async () => {
      const fresh = createDbStores(target.cfg!);
      const inv = fresh.commerce(createMockAdapter()).inventory;
      const before = await inv.available(inStock.id, size);
      const { code } = await fresh.giftCards.issue({ amount: 50_000, issuedBy: "contract", note: "e2e" });

      const sent = await (await otpSend(req("/api/otp/send", "POST", { phone: "9811122244" }))).json();
      const session = cookieOf(await otpVerify(req("/api/otp/verify", "POST", { challengeId: sent.challengeId, code: sent.demoCode })), "ah_session")!;
      const bag = await linePOST(req("/api/cart/lines", "POST", { productId: inStock.id, size, quantity: 2 }));
      expect([200, 201]).toContain(bag.status);
      const cookie = `${session}; ${cookieOf(bag, "ah_cart")}`;
      const address = (await (await addressPOST(req("/api/checkout/addresses", "POST", ADDRESS, cookie))).json()).address;
      const tenders = { giftCardCode: code };
      const q = await (await quotePOST(req("/api/checkout/quote", "POST", { addressId: address.id, payment: "cod", tenders }, cookie))).json();
      expect(q.payable).toBe(q.pricing.total - 50_000); // the card covers ₹500, COD collects the rest

      const key = crypto.randomUUID();
      const place = () => placePOST(req("/api/checkout/place", "POST", { addressId: address.id, payment: "cod", expectedTotal: q.payable, tenders }, cookie, { "idempotency-key": key }));
      const first = await place();
      const placed = await first.json();
      expect([200, 201], JSON.stringify(placed)).toContain(first.status);
      const number = placed.orderNumber as string;

      // In the database: the order, the stock taken, the gift card spent.
      const order = (await fresh.orders.get(number))!;
      expect(order.status).toBe("confirmed");
      expect(order.paymentMethod).toBe("cod");
      expect(await inv.available(inStock.id, size)).toBe(before - 2);
      expect(await fresh.giftCards.balance(giftHash(code))).toBe(0);

      // A retried request with the same idempotency key returns the same order and spends nothing again.
      const again = await (await place()).json();
      expect(again.orderNumber).toBe(number);
      expect(await inv.available(inStock.id, size)).toBe(before - 2);
      expect((await fresh.orders.listByCustomer(order.customerId)).length).toBe(1);

      // Cancel restores stock and the gift card balance exactly once.
      const p = { params: Promise.resolve({ number }) };
      expect((await cancelPOST(req(`/api/orders/${number}/cancel`, "POST", {}, session), p)).status).toBe(200);
      expect((await cancelPOST(req(`/api/orders/${number}/cancel`, "POST", {}, session), p)).status).toBe(409);
      expect((await fresh.orders.get(number))!.fulfilment).toBe("cancelled");
      expect(await inv.available(inStock.id, size)).toBe(before);
      expect(await fresh.giftCards.balance(giftHash(code))).toBe(50_000);
    }, 60_000);
  });
}
