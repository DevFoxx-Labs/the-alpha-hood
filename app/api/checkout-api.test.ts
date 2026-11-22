import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOCK_PRODUCTS } from "@/lib/commerce/mock/data";
import { rateLimiter } from "@/lib/http/rate-limit";
import { GET as cartGET } from "./cart/route";
import { DELETE as couponDELETE, POST as couponPOST } from "./cart/coupon/route";
import { POST as linePOST } from "./cart/lines/route";
import { PATCH as linePATCH } from "./cart/lines/[lineId]/route";
import { POST as addressPOST } from "./checkout/addresses/route";
import { POST as placePOST } from "./checkout/place/route";
import { POST as quotePOST } from "./checkout/quote/route";
import { GET as orderGET } from "./orders/[number]/route";
import { POST as otpSend } from "./otp/send/route";
import { POST as otpVerify } from "./otp/verify/route";
import { POST as demoPOST } from "./payments/demo/route";
import { POST as webhookPOST } from "./payments/webhook/route";

const ORIGIN = "http://localhost:3000";
let ipSeq = 0;

function req(path: string, method: string, body?: unknown, { cookie, headers = {} }: { cookie?: string; headers?: Record<string, string> } = {}) {
  const h = new Headers({ "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": `203.0.113.${(ipSeq % 250) + 1}`, ...headers });
  if (cookie) h.set("cookie", cookie);
  return new Request(`${ORIGIN}${path}`, { method, headers: h, body: method === "GET" ? undefined : JSON.stringify(body ?? {}) });
}

const cookieOf = (res: Response, name: string) =>
  res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`))?.split(";")[0];

const product = MOCK_PRODUCTS.find((p) => p.price >= 100_000 && p.sizes.some((s) => s.stock >= 5))!;
const size = product.sizes.find((s) => s.stock >= 5)!.label;
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

async function signIn(phone: string) {
  const sent = await (await otpSend(req("/api/otp/send", "POST", { phone }))).json();
  const res = await otpVerify(req("/api/otp/verify", "POST", { challengeId: sent.challengeId, code: sent.demoCode }));
  expect(res.status).toBe(200);
  return cookieOf(res, "ah_session")!;
}

async function cartWithItem() {
  const res = await linePOST(req("/api/cart/lines", "POST", { productId: product.id, size, quantity: 1 }));
  expect(res.status).toBe(201);
  return cookieOf(res, "ah_cart")!;
}

beforeEach(() => {
  rateLimiter.reset();
  ipSeq++;
  vi.stubEnv("CHECKOUT_ENABLED", "true");
  vi.stubEnv("COD_ENABLED", "true");
});
afterEach(() => vi.unstubAllEnvs());

describe("cart API (CART-01/04/05)", () => {
  it("creates an HttpOnly 30-day cart cookie and prices on the server", async () => {
    const res = await linePOST(req("/api/cart/lines", "POST", { productId: product.id, size, quantity: 2 }));
    expect(res.status).toBe(201);
    const set = res.headers.getSetCookie().find((c) => c.startsWith("ah_cart="))!;
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/Max-Age=2592000/);
    const body = await res.json();
    expect(body.pricing.sellingTotal).toBe(product.price * 2);
  });

  it("rejects client prices, bad quantities and unknown fields", async () => {
    expect((await linePOST(req("/api/cart/lines", "POST", { productId: product.id, size, quantity: 1, price: 1 }))).status).toBe(422);
    expect((await linePOST(req("/api/cart/lines", "POST", { productId: product.id, size, quantity: 6 }))).status).toBe(422);
    expect((await linePOST(req("/api/cart/lines", "POST", { productId: product.id, size, quantity: -1 }))).status).toBe(422);
    expect((await linePOST(req("/api/cart/lines", "POST", { productId: "../x", size, quantity: 1 }))).status).toBe(422);
  });

  it("can't touch a line in someone else's cart", async () => {
    const mine = await cartWithItem();
    const theirs = await cartWithItem();
    const theirLine = (await (await cartGET(req("/api/cart", "GET", undefined, { cookie: theirs }))).json()).lines[0].id;
    expect((await linePATCH(req(`/api/cart/lines/${theirLine}`, "PATCH", { quantity: 2 }, { cookie: mine }), { params: Promise.resolve({ lineId: theirLine }) })).status).toBe(404);
  });

  it("forged / malformed cart cookies give an empty bag, never another cart", async () => {
    const body = await (await cartGET(req("/api/cart", "GET", undefined, { cookie: "ah_cart=cart_1" }))).json();
    expect(body.lines).toEqual([]);
  });

  it("coupons: unknown codes get one generic message; attempts are rate-limited", async () => {
    const cart = await cartWithItem();
    const bad = await couponPOST(req("/api/cart/coupon", "POST", { code: "NOPE99" }, { cookie: cart }));
    expect(bad.status).toBe(422);
    expect((await bad.json()).error.message).toBe("This coupon code isn't valid.");
    expect((await couponPOST(req("/api/cart/coupon", "POST", { code: "ALPHA10" }, { cookie: cart }))).status).toBe(200);
    expect((await couponDELETE(req("/api/cart/coupon", "DELETE", {}, { cookie: cart }))).status).toBe(200);
    let last: Response | undefined;
    for (let i = 0; i < 12; i++) last = await couponPOST(req("/api/cart/coupon", "POST", { code: `GUESS${i}0` }, { cookie: cart }));
    expect(last?.status).toBe(429);
  });
});

describe("OTP API", () => {
  it("returns the same shape for any number and rejects bad input", async () => {
    expect((await otpSend(req("/api/otp/send", "POST", { phone: "12345" }))).status).toBe(422);
    const r = await (await otpSend(req("/api/otp/send", "POST", { phone: "9123456780" }))).json();
    expect(Object.keys(r).sort()).toEqual(["challengeId", "demoCode", "expiresInSeconds"]);
  });

  it("wrong codes don't sign in; unknown fields are refused", async () => {
    const sent = await (await otpSend(req("/api/otp/send", "POST", { phone: "9123456781" }))).json();
    const wrong = sent.demoCode === "000000" ? "111111" : "000000";
    expect((await otpVerify(req("/api/otp/verify", "POST", { challengeId: sent.challengeId, code: wrong }))).status).toBe(422);
    expect((await otpVerify(req("/api/otp/verify", "POST", { challengeId: sent.challengeId, code: sent.demoCode, customerId: "x" }))).status).toBe(422);
  });

  it("is refused when checkout is switched off (kill switch)", async () => {
    vi.stubEnv("CHECKOUT_ENABLED", "false");
    expect((await otpSend(req("/api/otp/send", "POST", { phone: "9123456782" }))).status).toBe(503);
  });
});

describe("checkout API (CHK)", () => {
  it("requires a session for quote / address / place / order (401)", async () => {
    expect((await quotePOST(req("/api/checkout/quote", "POST", {}))).status).toBe(401);
    expect((await addressPOST(req("/api/checkout/addresses", "POST", ADDRESS))).status).toBe(401);
    expect((await placePOST(req("/api/checkout/place", "POST", {}))).status).toBe(401);
    expect((await orderGET(req("/api/orders/AH12345678", "GET"), { params: Promise.resolve({ number: "AH12345678" }) })).status).toBe(401);
  });

  it("end to end: OTP → address → quote → place (prepaid) → signed payment → owner-only order view", async () => {
    const session = await signIn("9988776655");
    const cart = await cartWithItem();
    const cookie = `${session}; ${cart}`;
    const address = (await (await addressPOST(req("/api/checkout/addresses", "POST", ADDRESS, { cookie }))).json()).address;
    const quote = await (await quotePOST(req("/api/checkout/quote", "POST", { addressId: address.id, payment: "upi" }, { cookie }))).json();
    expect(quote.pricing.prepaidDiscount).toBeGreaterThan(0);

    // Missing Idempotency-Key and a tampered total are both refused.
    expect((await placePOST(req("/api/checkout/place", "POST", { addressId: address.id, payment: "upi", expectedTotal: quote.pricing.total }, { cookie }))).status).toBe(422);
    const key = crypto.randomUUID();
    const tampered = await placePOST(req("/api/checkout/place", "POST", { addressId: address.id, payment: "upi", expectedTotal: 100 }, { cookie, headers: { "idempotency-key": key } }));
    expect(tampered.status).toBe(409);

    const placed = await placePOST(req("/api/checkout/place", "POST", { addressId: address.id, payment: "upi", expectedTotal: quote.pricing.total }, { cookie, headers: { "idempotency-key": crypto.randomUUID() } }));
    expect(placed.status).toBe(201);
    const { orderNumber, redirectUrl } = await placed.json();
    const paymentId = redirectUrl.split("/").pop();

    // Someone else can't see or pay this order.
    const stranger = await signIn("9988776600");
    expect((await orderGET(req(`/api/orders/${orderNumber}`, "GET", undefined, { cookie: stranger }), { params: Promise.resolve({ number: orderNumber }) })).status).toBe(404);
    expect((await demoPOST(req("/api/payments/demo", "POST", { paymentId, outcome: "succeeded" }, { cookie: stranger }))).status).toBe(404);

    expect((await demoPOST(req("/api/payments/demo", "POST", { paymentId, outcome: "succeeded" }, { cookie }))).status).toBe(200);
    const order = (await (await orderGET(req(`/api/orders/${orderNumber}`, "GET", undefined, { cookie }), { params: Promise.resolve({ number: orderNumber }) })).json()).order;
    expect(order.status).toBe("confirmed");
    expect(order.totals.total).toBe(quote.pricing.total);
    // The bag is emptied after a confirmed order.
    expect((await (await cartGET(req("/api/cart", "GET", undefined, { cookie }))).json()).lines).toEqual([]);
  });

  it("someone else's address id is refused", async () => {
    const a = await signIn("9988776611");
    const b = await signIn("9988776612");
    const theirs = (await (await addressPOST(req("/api/checkout/addresses", "POST", ADDRESS, { cookie: b }))).json()).address;
    const cart = await cartWithItem();
    const res = await quotePOST(req("/api/checkout/quote", "POST", { addressId: theirs.id }, { cookie: `${a}; ${cart}` }));
    expect(res.status).toBe(404);
  });
});

describe("payment webhook", () => {
  it("rejects unsigned, forged and malformed calls (fails closed)", async () => {
    const body = JSON.stringify({ id: "evt_aaaaaaaaaaaaaaaaaaaaaaaa", type: "payment.succeeded", paymentId: "pay_aaaaaaaaaaaaaaaaaaaaaaaa", orderNumber: "AH12345678", amount: 1 });
    const mk = (headers: Record<string, string>) => new Request(`${ORIGIN}/api/payments/webhook`, { method: "POST", headers, body });
    expect((await webhookPOST(mk({}))).status).toBe(401);
    expect((await webhookPOST(mk({ "x-signature": "0".repeat(64), "x-timestamp": String(Date.now()) }))).status).toBe(401);
    expect((await webhookPOST(mk({ "x-signature": "zz", "x-timestamp": "abc" }))).status).toBe(401);
  });
});
