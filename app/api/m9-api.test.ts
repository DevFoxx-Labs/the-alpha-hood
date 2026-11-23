import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryAlertStore, sweepAlerts } from "@/lib/alerts/service";
import { defaultDeps } from "@/lib/checkout/service";
import { readOneClick, oneClickAvailable } from "@/lib/checkout/one-click";
import { commerce } from "@/lib/commerce";
import { MOCK_PRODUCTS } from "@/lib/commerce/mock/data";
import { resolveLedger } from "@/lib/consent/ledger";
import { EXPERIMENTS, variantFor } from "@/lib/experiments/config";
import { cronAuthorised } from "@/lib/http/cron";
import { rateLimiter } from "@/lib/http/rate-limit";
import { CLUB, coinsFor, tierFor } from "@/lib/loyalty/config";
import { sumCoins } from "@/lib/loyalty/service";
import { resolveLoyalty } from "@/lib/loyalty/store";
import { readAutomation } from "@/lib/marketing/automation";
import { clearOutboxForTests, FREQUENCY_CAP, notify, outboxFor } from "@/lib/notify/outbox";
import { advanceFulfilment } from "@/lib/orders/lifecycle";
import { resolveOrders } from "@/lib/orders/store";
import { priceCart } from "@/lib/pricing/price-cart";
import { LOOKS } from "@/lib/promotions/looks";
import { adviseSize } from "@/lib/sizing/advice";
import { returnEligibility } from "@/lib/returns/rules";
import { GET as alertsGET, POST as alertsPOST } from "./account/alerts/route";
import { DELETE as alertDELETE } from "./account/alerts/[id]/route";
import { GET as clubGET, POST as clubPOST } from "./account/club/route";
import { POST as ugcPOST } from "./account/ugc/route";
import { POST as moderatePOST } from "./admin/ugc/[id]/route";
import { POST as couponPOST } from "./cart/coupon/route";
import { POST as linePOST } from "./cart/lines/route";
import { POST as addressPOST } from "./checkout/addresses/route";
import { POST as placePOST } from "./checkout/place/route";
import { POST as quotePOST } from "./checkout/quote/route";
import { GET as cronGET } from "./cron/sweep/route";
import { POST as otpSend } from "./otp/send/route";
import { POST as otpVerify } from "./otp/verify/route";
import { POST as photoPOST } from "./returns/photos/route";
import { GET as ugcListGET } from "./ugc/route";
import { GET as ugcPhotoGET } from "./ugc/[id]/photo/route";

const ORIGIN = "http://localhost:3000";
let ipSeq = 0;
function req(path: string, method: string, body?: unknown, { cookie, headers = {} }: { cookie?: string; headers?: Record<string, string> } = {}) {
  const h = new Headers({ "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": `198.19.0.${(ipSeq % 250) + 1}`, ...headers });
  if (cookie) h.set("cookie", cookie);
  return new Request(`${ORIGIN}${path}`, { method, headers: h, body: method === "GET" ? undefined : JSON.stringify(body ?? {}) });
}
const cookieOf = (res: Response, name: string) => res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`))?.split(";")[0];
const p = <T extends object>(v: T) => ({ params: Promise.resolve(v) });
const product = MOCK_PRODUCTS.find((x) => x.category === "shirts" && x.sizes.filter((s) => s.stock >= 5).length >= 2)!;
const size = product.sizes.find((s) => s.stock >= 5)!.label;
const address = (line1: string, pincode = "411045") => ({ name: "Test Buyer", phone: "9876543210", pincode, line1, line2: "Baner", landmark: "", city: "Pune", state: "Maharashtra", type: "home" });

let clock = Date.parse("2026-11-25T05:00:00Z");
const tick = (ms = 31_000) => vi.setSystemTime((clock += ms));

async function signIn(phone: string) {
  const sent = await (await otpSend(req("/api/otp/send", "POST", { phone }))).json();
  return cookieOf(await otpVerify(req("/api/otp/verify", "POST", { challengeId: sent.challengeId, code: sent.demoCode })), "ah_session")!;
}

async function placeCod(session: string, line1: string, coupon?: string, extraCookie = "") {
  const cart = cookieOf(await linePOST(req("/api/cart/lines", "POST", { productId: product.id, size, quantity: 1 })), "ah_cart")!;
  const cookie = [session, cart, extraCookie].filter(Boolean).join("; ");
  if (coupon) {
    const c = await couponPOST(req("/api/cart/coupon", "POST", { code: coupon }, { cookie }));
    if (c.status !== 200) return { status: c.status, body: await c.json(), cookie };
  }
  const addr = (await (await addressPOST(req("/api/checkout/addresses", "POST", address(line1), { cookie }))).json()).address;
  const q = await (await quotePOST(req("/api/checkout/quote", "POST", { addressId: addr.id, payment: "cod" }, { cookie }))).json();
  const res = await placePOST(req("/api/checkout/place", "POST", { addressId: addr.id, payment: "cod", expectedTotal: q.pricing.total }, { cookie, headers: { "idempotency-key": crypto.randomUUID() } }));
  return { status: res.status, body: await res.json(), cookie };
}

const deliver = async (number: string) => {
  for (const to of ["packed", "shipped", "delivered"] as const) await advanceFulfilment(defaultDeps(), number, to);
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  tick();
  rateLimiter.reset();
  ipSeq++;
  vi.stubEnv("CHECKOUT_ENABLED", "true");
  vi.stubEnv("COD_ENABLED", "true");
  vi.stubEnv("ACCOUNTS_ENABLED", "true");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("LOY-01 Alpha Club", () => {
  it("joining needs explicit consent (server-checked) and records it in the ledger", async () => {
    const s = await signIn("9711000001");
    expect((await clubGET(req("/api/account/club", "GET"))).status).toBe(401);
    expect((await clubPOST(req("/api/account/club", "POST", { action: "join" }, { cookie: s }))).status).toBe(422);
    expect((await clubPOST(req("/api/account/club", "POST", { action: "join", consent: "yes" }, { cookie: s }))).status).toBe(422);
    const r = await clubPOST(req("/api/account/club", "POST", { action: "join", consent: true }, { cookie: s }));
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.member).toBe(true);
    expect(d.referralCode).toMatch(/^REF[A-HJ-NP-Z2-9]{6}$/);
    expect((await clubPOST(req("/api/account/club", "POST", { action: "join", consent: true }, { cookie: s }))).status).toBe(409);
    expect((await clubPOST(req("/api/account/club", "POST", { action: "join", consent: true, tier: "legend" }, { cookie: s }))).status).toBe(422);
  });

  it("members earn coins on delivery (pending until the 30-day window), lose them on return, once", async () => {
    const s = await signIn("9711000002");
    await clubPOST(req("/api/account/club", "POST", { action: "join", consent: true }, { cookie: s }));
    const placed = await placeCod(s, "Flat 2, Earn Towers, Baner Road");
    expect(placed.status).toBe(201);
    const order = (await resolveOrders().get(placed.body.orderNumber))!;
    expect(order.club).toMatchObject({ returnWindowDays: CLUB.memberReturnWindowDays });
    await deliver(order.number);
    await advanceFulfilment(defaultDeps(), order.number, "delivered").catch(() => undefined); // repeat → no double earn
    const delivered = (await resolveOrders().get(order.number))!;
    const d = await (await clubGET(req("/api/account/club", "GET", undefined, { cookie: s }))).json();
    expect(d.coins.pending).toBe(coinsFor(delivered.pricing.goodsTotal, CLUB.earnPercent.member));
    expect(d.coins.available).toBe(0);
    // 30-day member window (vs 7 days default) — open on day 20.
    expect(returnEligibility(delivered, () => "shirts", new Date(Date.parse(delivered.deliveredAt!) + 20 * 86_400_000)).open).toBe(true);
    // After the window the coins are available.
    const later = sumCoins(await resolveLoyalty().coins(order.customerId), new Date(Date.parse(delivered.deliveredAt!) + 31 * 86_400_000));
    expect(later.available).toBe(d.coins.pending);
  });

  it("non-members earn nothing and keep the 7-day window", async () => {
    const s = await signIn("9711000003");
    const placed = await placeCod(s, "Flat 3, Plain House, Baner Road");
    const order = (await resolveOrders().get(placed.body.orderNumber))!;
    expect(order.club ?? null).toBeNull();
    await deliver(order.number);
    expect(await resolveLoyalty().coins(order.customerId)).toEqual([]);
    const o = (await resolveOrders().get(order.number))!;
    expect(returnEligibility(o, () => "shirts", new Date(Date.parse(o.deliveredAt!) + 8 * 86_400_000)).open).toBe(false);
  });

  it("tiers and coin maths are integer and capped", () => {
    expect(tierFor(0)).toBe("member");
    expect(tierFor(CLUB.tierThreshold.elite)).toBe("elite");
    expect(tierFor(CLUB.tierThreshold.legend)).toBe("legend");
    expect(coinsFor(199_900, 5)).toBe(99);
    expect(coinsFor(-1, 5)).toBe(0);
  });

  it("leaving forfeits coins and withdraws consent", async () => {
    const s = await signIn("9711000004");
    await clubPOST(req("/api/account/club", "POST", { action: "join", consent: true }, { cookie: s }));
    const placed = await placeCod(s, "Flat 4, Leave Lane, Baner Road");
    await deliver(placed.body.orderNumber);
    const r = await (await clubPOST(req("/api/account/club", "POST", { action: "leave" }, { cookie: s }))).json();
    expect(r.member).toBe(false);
    const order = (await resolveOrders().get(placed.body.orderNumber))!;
    expect(sumCoins(await resolveLoyalty().coins(order.customerId)).total).toBe(0);
    const rows = await resolveLedger().listByUser(order.customerId);
    expect(rows.filter((x) => x.purpose === "alpha_club").map((x) => x.status)).toEqual(["granted", "withdrawn"]);
  });
});

describe("LOY-02 referral", () => {
  it("a friend gets ₹200 off a first order; the referrer is rewarded after delivery", async () => {
    const ref = await signIn("9712000001");
    const code = (await (await clubPOST(req("/api/account/club", "POST", { action: "join", consent: true }, { cookie: ref }))).json()).referralCode;
    await placeCod(ref, "Flat 9, Referrer Residency, Baner Road"); // the referrer's own address
    const friend = await signIn("9712000002");
    const placed = await placeCod(friend, "House 77, Friend Street, Aundh", code);
    expect(placed.status).toBe(201);
    const order = (await resolveOrders().get(placed.body.orderNumber))!;
    expect(order.couponCode).toBe(code);
    expect(order.pricing.couponDiscount).toBe(CLUB.referral.friendDiscount);
    await deliver(order.number);
    const d = await (await clubGET(req("/api/account/club", "GET", undefined, { cookie: ref }))).json();
    expect(d.history.some((h: { kind: string; coins: number }) => h.kind === "referral" && h.coins === CLUB.referral.referrerCoins)).toBe(true);
  });

  it("refuses self-referral, a shared address and unknown codes", async () => {
    const ref = await signIn("9712000003");
    const code = (await (await clubPOST(req("/api/account/club", "POST", { action: "join", consent: true }, { cookie: ref }))).json()).referralCode;
    const self = await placeCod(ref, "Flat 1, Self Court, Baner Road", code);
    expect([409, 422]).toContain(self.status);
    const friend = await signIn("9712000004");
    // Same delivery address as the referrer → refused at placement.
    const shared = await placeCod(friend, "Flat 1, Self Court, Baner Road", code);
    expect(shared.status).toBe(409);
    const s = await signIn("9712000005");
    const unknown = await placeCod(s, "Flat 5, Nowhere, Baner Road", "REFAAAAAA");
    expect(unknown.status).toBe(422);
  });
});

describe("PROMO-05 Shop the Look", () => {
  const base = (ids: string[], qty = 1) =>
    ids.map((id, i) => {
      const prod = MOCK_PRODUCTS.find((x) => x.id === id)!;
      return { lineId: `l${i}`, productId: id, category: prod.category, subcategory: prod.subcategory, quantity: qty, unitPrice: prod.price, unitMrp: prod.mrp };
    });

  it("takes 10% off one unit of each item only when the whole look is in the bag", () => {
    const look = LOOKS[0];
    const now = new Date("2026-11-25T10:00:00Z");
    const full = priceCart({ lines: base(look.productIds), now, rules: { combos: [], automatic: [] } });
    const expected = look.productIds.reduce((n, id) => n + Math.floor((MOCK_PRODUCTS.find((x) => x.id === id)!.price * look.percent) / 100), 0);
    expect(full.lookDiscount).toBe(expected);
    expect(full.looks).toEqual([{ lookId: look.id, title: look.title, discount: expected }]);
    const partial = priceCart({ lines: base(look.productIds.slice(0, 2)), now, rules: { combos: [], automatic: [] } });
    expect(partial.lookDiscount).toBe(0);
    // Two of everything still gives one look discount (one unit each).
    const double = priceCart({ lines: base(look.productIds, 2), now, rules: { combos: [], automatic: [] } });
    expect(double.lookDiscount).toBe(expected);
    expect(full.lines.every((l) => Number.isInteger(l.net) && l.net >= 0)).toBe(true);
  });
});

describe("PDP-10 alerts", () => {
  it("signed-in only, validated server-side, own alerts only, fire once", async () => {
    expect((await alertsPOST(req("/api/account/alerts", "POST", { productId: product.id, kind: "price_drop" }))).status).toBe(401);
    const s = await signIn("9713000001");
    const inStock = await alertsPOST(req("/api/account/alerts", "POST", { productId: product.id, kind: "back_in_stock", size }, { cookie: s }));
    expect(inStock.status).toBe(409); // size is in stock
    expect((await alertsPOST(req("/api/account/alerts", "POST", { productId: "nope", kind: "price_drop" }, { cookie: s }))).status).toBe(404);
    expect((await alertsPOST(req("/api/account/alerts", "POST", { productId: product.id, kind: "price_drop", price: 1 }, { cookie: s }))).status).toBe(422);
    const ok = await alertsPOST(req("/api/account/alerts", "POST", { productId: product.id, kind: "price_drop" }, { cookie: s }));
    expect(ok.status).toBe(201);
    const id = (await ok.json()).alert.id;
    const other = await signIn("9713000002");
    expect((await alertDELETE(req(`/api/account/alerts/${id}`, "DELETE", {}, { cookie: other }), p({ id }))).status).toBe(404);
    expect((await alertsGET(req("/api/account/alerts", "GET", undefined, { cookie: other }))).status).toBe(200);
    expect((await alertDELETE(req(`/api/account/alerts/${id}`, "DELETE", {}, { cookie: s }), p({ id }))).status).toBe(200);
  });

  it("back-in-stock fires once when stock returns", async () => {
    const alerts = createMemoryAlertStore();
    const soldOut = MOCK_PRODUCTS.find((x) => x.sizes.some((s) => s.stock === 0))!;
    const sz = soldOut.sizes.find((s) => s.stock === 0)!.label;
    await alerts.create({ customerId: "cus_x", productId: soldOut.id, size: sz, kind: "back_in_stock", priceAtSet: soldOut.price });
    expect(await sweepAlerts({ commerce, alerts }, soldOut.id)).toBe(0);
    await commerce.inventory.adjust(soldOut.id, sz, 3);
    expect(await sweepAlerts({ commerce, alerts }, soldOut.id)).toBe(1);
    expect(await sweepAlerts({ commerce, alerts }, soldOut.id)).toBe(0);
    await commerce.inventory.adjust(soldOut.id, sz, -3);
  });
});

describe("ORD-02 / LOY-04 notifications follow consent", () => {
  it("WhatsApp only with whatsapp_updates; marketing only with consent and inside the cap", async () => {
    clearOutboxForTests();
    const ledger = resolveLedger();
    const id = "cus_notify_1";
    await notify(id, "order_shipped", { orderNumber: "AH1" });
    expect((await outboxFor(id))[0].channels).toEqual(["sms", "email"]);
    expect(await notify(id, "abandoned_checkout_1h", {})).toBe(false); // no marketing consent → not queued
    const row = (purpose: "whatsapp_updates" | "marketing_whatsapp") => ({ user_id: id, visitor_id: null, subscriber_id: null, purpose, status: "granted" as const, method: "preferences" as const, source: "web" as const, notice_version: "privacy@x", ip_address: "1.1.1.1", user_agent: "t" });
    await ledger.append([row("whatsapp_updates"), row("marketing_whatsapp")]);
    await notify(id, "order_delivered", { orderNumber: "AH1" });
    expect((await outboxFor(id)).at(-1)!.channels).toContain("whatsapp");
    expect(await notify(id, "abandoned_checkout_1h", {})).toBe(true);
    expect((await outboxFor(id)).at(-1)!.channels).toEqual(["whatsapp"]);
    expect(await notify(id, "abandoned_checkout_24h", {})).toBe(false); // FREQUENCY_CAP.perDay
    expect(FREQUENCY_CAP.perDay).toBe(1);
  });
});

describe("LOY-03 #WearTheHood", () => {
  it("needs consent, a delivered item and a valid photo; public only after approval; staff-only moderation", async () => {
    const s = await signIn("9714000001");
    const placed = await placeCod(s, "Flat 14, Photo Point, Baner Road");
    await deliver(placed.body.orderNumber);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
    const up = await photoPOST(new Request(`${ORIGIN}/api/returns/photos`, { method: "POST", headers: { origin: ORIGIN, "content-type": "image/png", cookie: s, "x-forwarded-for": "198.19.1.1" }, body: new Blob([png]) }));
    expect(up.status).toBe(201);
    const photoId = (await up.json()).id;
    expect((await ugcPOST(req("/api/account/ugc", "POST", { photoId, productIds: [product.id], consent: false }, { cookie: s }))).status).toBe(422);
    expect((await ugcPOST(req("/api/account/ugc", "POST", { photoId, productIds: ["mock_999"], consent: true }, { cookie: s }))).status).toBe(422);
    expect((await ugcPOST(req("/api/account/ugc", "POST", { photoId, productIds: [product.id], consent: true, caption: "see www.spam.com" }, { cookie: s }))).status).toBe(422);
    const ok = await ugcPOST(req("/api/account/ugc", "POST", { photoId, productIds: [product.id], consent: true, caption: "Fresh fit" }, { cookie: s }));
    expect(ok.status).toBe(201);
    const postId = (await ok.json()).post.id;
    // Not public while pending.
    expect((await (await ugcListGET(req("/api/ugc", "GET"))).json()).posts.some((x: { id: string }) => x.id === postId)).toBe(false);
    expect((await ugcPhotoGET(req(`/api/ugc/${postId}/photo`, "GET"), p({ id: postId }))).status).toBe(404);
    // A customer session can't moderate.
    expect((await moderatePOST(req(`/api/admin/ugc/${postId}`, "POST", { decision: "approve" }, { cookie: s }), p({ id: postId }))).status).toBe(401);
  });
});

describe("cron, flags and experiments fail closed", () => {
  it("cron sweep needs a long secret, compared in constant time", async () => {
    expect((await cronGET(req("/api/cron/sweep", "GET"))).status).toBe(401);
    expect(cronAuthorised(req("/x", "GET", undefined, { headers: { authorization: "Bearer short" } }), { CRON_SECRET: "short" })).toBe(false);
    const secret = "s".repeat(40);
    expect(cronAuthorised(req("/x", "GET", undefined, { headers: { authorization: `Bearer ${secret}` } }), { CRON_SECRET: secret })).toBe(true);
    expect(cronAuthorised(req("/x", "GET", undefined, { headers: { authorization: `Bearer ${"t".repeat(40)}` } }), { CRON_SECRET: secret })).toBe(false);
    vi.stubEnv("CRON_SECRET", secret);
    const r = await cronGET(req("/api/cron/sweep", "GET", undefined, { headers: { authorization: `Bearer ${secret}` } }));
    expect(r.status).toBe(200);
  });

  it("one-click checkout and marketing automation stay off unless fully configured", () => {
    expect(readOneClick({})).toBeNull();
    expect(readOneClick({ ONE_CLICK_ENABLED: "true", ONE_CLICK_PROVIDER: "evil", ONE_CLICK_MERCHANT_ID: "abcdef12" })).toBeNull();
    expect(oneClickAvailable({ ONE_CLICK_ENABLED: "true", ONE_CLICK_PROVIDER: "gokwik", ONE_CLICK_MERCHANT_ID: "abcdef12" })).toBe(false);
    expect(readAutomation({ MARKETING_PROVIDER: "klaviyo", MARKETING_API_KEY: "x".repeat(20) })).toBeNull();
  });

  it("experiments: disabled → control; enabled → stable buckets within the weights", () => {
    const exp = EXPERIMENTS.pdp_exchange_note;
    expect(variantFor(exp, "a")).toBe("control");
    const on = { ...exp, enabled: true };
    expect(variantFor(on, "same-id")).toBe(variantFor(on, "same-id"));
    const counts = new Map<string, number>();
    for (let i = 0; i < 2000; i++) counts.set(variantFor(on, `id-${i}`), (counts.get(variantFor(on, `id-${i}`)) ?? 0) + 1);
    expect(Math.abs((counts.get("control") ?? 0) - 1000)).toBeLessThan(150);
  });
});

describe("PDP-04 size advice", () => {
  it("uses kept sizes in the same chart family and nudges by return reasons", () => {
    const target = { sizeChart: "tops" as const, sizes: ["S", "M", "L", "XL"].map((label) => ({ label, stock: 5 })) };
    const orders = [{ deliveredAt: "2026-01-01", returnedQty: {}, lines: [{ lineId: "a", productId: "t1", size: "M", quantity: 2 } as never] }];
    expect(adviseSize(target, orders, () => "tops", [])).toEqual({ size: "M", basis: "kept", from: 2 });
    expect(adviseSize(target, orders, () => "tops", [{ productId: "t1", reason: "too_small" }])?.size).toBe("L");
    expect(adviseSize(target, orders, () => "bottoms", [])).toBeNull();
    expect(adviseSize({ ...target, sizeChart: "none" }, orders, () => "tops", [])).toBeNull();
  });
});
