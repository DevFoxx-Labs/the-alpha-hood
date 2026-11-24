import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRazorpayGateway, LINK_TTL_MS, readRazorpayConfig, refundKey } from "./razorpay";
import { resolveGateway } from "./gateway";

/**
 * Razorpay adapter against a fake Razorpay API (no network). Every webhook is signed with a real HMAC, so the
 * signature checks are the production code path.
 */
const CFG = { keyId: "rzp_test_ABCDEFGH1234", keySecret: "s".repeat(24), webhookSecret: "w".repeat(24), siteUrl: "https://shop.example.in", test: true };
const sign = (body: string, secret = CFG.webhookSecret) => createHmac("sha256", secret).update(body).digest("hex");

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown> | null;
}

function fakeRazorpay() {
  const calls: Call[] = [];
  const links = new Map<string, { id: string; amount: number; currency: string; status: string; reference_id: string; amount_paid: number; payments: { payment_id: string; amount: number; status: string }[] | null }>();
  const refunds: { id: string; payment_id: string; amount: number; receipt: string }[] = [];
  // Unique across tests (a reused payment id would rightly be refused by the order store).
  let n = Math.floor(Math.random() * 1e6) * 1000;
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    calls.push({ method: init?.method ?? "GET", url, headers, body });
    if (headers.authorization !== `Basic ${Buffer.from(`${CFG.keyId}:${CFG.keySecret}`).toString("base64")}`) return json(401, { error: { code: "BAD_REQUEST_ERROR" } });
    let m: RegExpMatchArray | null;
    if (url === "https://api.razorpay.com/v1/payment_links" && init?.method === "POST") {
      const id = `plink_Test${String(++n).padStart(8, "0")}`;
      links.set(id, { id, amount: body!.amount as number, currency: "INR", status: "created", reference_id: body!.reference_id as string, amount_paid: 0, payments: null });
      return json(200, { id, short_url: `https://rzp.io/i/${id.slice(6)}`, status: "created" });
    }
    if ((m = url.match(/\/payment_links\/(plink_\w+)$/))) {
      const l = links.get(m[1]);
      return l ? json(200, l) : json(404, { error: { code: "BAD_REQUEST_ERROR" } });
    }
    if ((m = url.match(/\/payments\/(pay_\w+)\/refunds\?count=100$/))) return json(200, { entity: "collection", items: refunds.filter((r) => r.payment_id === m![1]) });
    if ((m = url.match(/\/payments\/(pay_\w+)\/refund$/))) {
      const id = `rfnd_Test${String(++n).padStart(8, "0")}`;
      refunds.push({ id, payment_id: m[1], amount: body!.amount as number, receipt: body!.receipt as string });
      return json(200, { id, entity: "refund", status: "processed" });
    }
    return json(404, { error: { code: "NOT_FOUND" } });
  }) as typeof fetch;
  const pay = (id: string) => {
    const l = links.get(id)!;
    l.status = "paid";
    l.amount_paid = l.amount;
    l.payments = [{ payment_id: `pay_Paid${id.slice(10)}`, amount: l.amount, status: "captured" }];
    return l;
  };
  return { calls, links, refunds, fetchImpl, pay };
}

const paidEvent = (link: { id: string; amount: number; reference_id: string }, over: Record<string, unknown> = {}) =>
  JSON.stringify({
    entity: "event",
    event: "payment_link.paid",
    contains: ["payment_link", "order", "payment"],
    created_at: Math.floor(Date.now() / 1000),
    payload: { payment_link: { entity: { ...link, currency: "INR", status: "paid", amount_paid: link.amount } }, payment: { entity: { id: "pay_X", amount: link.amount, status: "captured" } } },
    ...over,
  });

describe("Razorpay gateway (payment links)", () => {
  it("config: needs a well-formed key id and both secrets; fails closed otherwise", () => {
    expect(readRazorpayConfig({})).toBeNull();
    expect(readRazorpayConfig({ RAZORPAY_KEY_ID: "rzp_live_ABCDEFGH1234", RAZORPAY_KEY_SECRET: "short", RAZORPAY_WEBHOOK_SECRET: "w".repeat(20) })).toBeNull();
    expect(readRazorpayConfig({ RAZORPAY_KEY_ID: "rzp_live_ABCDEFGH1234", RAZORPAY_KEY_SECRET: "s".repeat(20), RAZORPAY_WEBHOOK_SECRET: "w".repeat(20), SITE_URL: "https://x.in/" })).toMatchObject({ test: false, siteUrl: "https://x.in" });
    // Asked for razorpay but not configured → the refusing gateway, never the demo one.
    expect(resolveGateway({ PAYMENT_GATEWAY: "razorpay", NODE_ENV: "development" }).name).toBe("disabled");
    expect(resolveGateway({ PAYMENT_GATEWAY: "razorpay", RAZORPAY_KEY_ID: CFG.keyId, RAZORPAY_KEY_SECRET: CFG.keySecret, RAZORPAY_WEBHOOK_SECRET: CFG.webhookSecret }).name).toBe("razorpay");
  });

  it("createPayment: INR link with our order number as reference, no customer data, short expiry, return URL", async () => {
    const rz = fakeRazorpay();
    const g = createRazorpayGateway(CFG, rz.fetchImpl);
    const before = Date.now();
    const p = await g.createPayment({ orderNumber: "AH12345678", amount: 149_900, method: "upi" });
    expect(p.paymentId).toMatch(/^plink_/);
    expect(p.redirectUrl).toMatch(/^https:\/\/rzp\.io\/i\//);
    const body = rz.calls[0].body!;
    expect(body).toMatchObject({ amount: 149_900, currency: "INR", accept_partial: false, reference_id: "AH12345678", callback_method: "get", callback_url: "https://shop.example.in/api/payments/return?order=AH12345678", notify: { sms: false, email: false } });
    expect(body).not.toHaveProperty("customer"); // DPDP: no phone / email sent
    expect((body.expire_by as number) * 1000).toBeGreaterThanOrEqual(before + 15 * 60_000);
    expect((body.expire_by as number) * 1000).toBeLessThanOrEqual(Date.now() + LINK_TTL_MS + 1000);
    await expect(g.createPayment({ orderNumber: "AH12345678", amount: 99, method: "upi" })).rejects.toThrow(/₹1/);
    await expect(g.createPayment({ orderNumber: "../x", amount: 10_000, method: "upi" })).rejects.toThrow(/order/);
  });

  it("webhook: valid signature → event; tampered / wrong secret / missing / stale / non-INR → null; other events ignored", async () => {
    const rz = fakeRazorpay();
    const g = createRazorpayGateway(CFG, rz.fetchImpl);
    const { paymentId } = await g.createPayment({ orderNumber: "AH12345678", amount: 149_900, method: "card" });
    const link = { id: paymentId, amount: 149_900, reference_id: "AH12345678" };
    const raw = paidEvent(link);
    const h = (sig: string | null, id = "EvtABC123") => new Headers({ ...(sig ? { "x-razorpay-signature": sig } : {}), "x-razorpay-event-id": id });
    const ev = g.verifyWebhook(raw, h(sign(raw)));
    expect(ev).toMatchObject({ type: "payment.succeeded", paymentId, orderNumber: "AH12345678", amount: 149_900 });
    expect(g.verifyWebhook(raw, h(sign(raw)))).toEqual(ev); // same delivery → same event id (de-duplicated)
    expect(g.verifyWebhook(raw.replace("149900", "100"), h(sign(raw)))).toBeNull();
    expect(g.verifyWebhook(raw, h(sign(raw, "x".repeat(24))))).toBeNull();
    expect(g.verifyWebhook(raw, h(null))).toBeNull();
    const old = paidEvent(link, { created_at: Math.floor(Date.now() / 1000) - 5 * 86_400 });
    expect(g.verifyWebhook(old, h(sign(old)))).toBeNull();
    const usd = JSON.stringify({ ...JSON.parse(raw), payload: { payment_link: { entity: { ...link, currency: "USD", status: "paid", amount_paid: 149_900 } } } });
    expect(g.verifyWebhook(usd, h(sign(usd)))).toBeNull();
    const forged = JSON.stringify({ ...JSON.parse(raw), payload: { payment_link: { entity: { ...link, reference_id: "../../admin", currency: "INR", status: "paid", amount_paid: 1 } } } });
    expect(g.verifyWebhook(forged, h(sign(forged)))).toBeNull();
    const other = JSON.stringify({ event: "payment.authorized", created_at: Math.floor(Date.now() / 1000), payload: {} });
    expect(g.verifyWebhook(other, h(sign(other)))).toBe("ignored");
    const expired = JSON.stringify({ event: "payment_link.expired", created_at: Math.floor(Date.now() / 1000), payload: { payment_link: { entity: { ...link, currency: "INR", status: "expired" } } } });
    expect(g.verifyWebhook(expired, h(sign(expired), "EvtDEF456"))).toMatchObject({ type: "payment.failed", paymentId });
  });

  it("fetchStatus reads the link from the API (pending / succeeded / failed / unknown)", async () => {
    const rz = fakeRazorpay();
    const g = createRazorpayGateway(CFG, rz.fetchImpl);
    const { paymentId } = await g.createPayment({ orderNumber: "AH12345678", amount: 50_000, method: "upi" });
    expect(await g.fetchStatus(paymentId)).toEqual({ status: "pending", amount: 50_000 });
    rz.pay(paymentId);
    expect(await g.fetchStatus(paymentId)).toEqual({ status: "succeeded", amount: 50_000 });
    expect(await g.fetchStatus("plink_Unknown000")).toBeNull();
    expect(await g.fetchStatus("pay_notalink")).toBeNull();
  });

  it("refund: only a captured payment; idempotent per reference (also after a timeout retry); key format", async () => {
    const rz = fakeRazorpay();
    const g = createRazorpayGateway(CFG, rz.fetchImpl);
    const { paymentId } = await g.createPayment({ orderNumber: "AH12345678", amount: 50_000, method: "upi" });
    await expect(g.refund(paymentId, 10_000, "cancel:AH12345678")).rejects.toThrow(/not captured/);
    rz.pay(paymentId);
    const a = await g.refund(paymentId, 10_000, "cancel:AH12345678");
    const b = await g.refund(paymentId, 10_000, "cancel:AH12345678");
    expect(b).toEqual(a);
    expect(rz.refunds).toHaveLength(1);
    const post = rz.calls.find((c) => c.method === "POST" && c.url.endsWith("/refund"))!;
    expect(post.headers["x-refund-idempotency"]).toBe(refundKey("cancel:AH12345678"));
    expect(post.body).toMatchObject({ amount: 10_000, speed: "normal", receipt: refundKey("cancel:AH12345678") });
    expect(refundKey("x")).toMatch(/^[a-f0-9]{32}$/);
    await g.refund(paymentId, 5_000, "return:RT-1");
    expect(rz.refunds).toHaveLength(2);
    await expect(g.refund(paymentId, 50, "tiny")).rejects.toThrow(/₹1/);
  });

  it("API errors surface as failures (never as success)", async () => {
    const g = createRazorpayGateway({ ...CFG, keySecret: "wrong-secret-wrong" }, fakeRazorpay().fetchImpl);
    await expect(g.createPayment({ orderNumber: "AH12345678", amount: 10_000, method: "upi" })).rejects.toThrow(/Razorpay request failed \(401/);
  });
});

// ── End to end through the real routes: place (UPI) → hosted page hop → webhook → order confirmed ───────────
import { POST as linePOST } from "@/app/api/cart/lines/route";
import { POST as addressPOST } from "@/app/api/checkout/addresses/route";
import { POST as placePOST } from "@/app/api/checkout/place/route";
import { POST as quotePOST } from "@/app/api/checkout/quote/route";
import { GET as orderGET } from "@/app/api/orders/[number]/route";
import { POST as otpSend } from "@/app/api/otp/send/route";
import { POST as otpVerify } from "@/app/api/otp/verify/route";
import { GET as goGET } from "@/app/api/payments/go/[order]/route";
import { GET as returnGET } from "@/app/api/payments/return/route";
import { POST as webhookPOST } from "@/app/api/payments/webhook/route";
import { MOCK_PRODUCTS } from "@/lib/commerce/mock/data";
import { rateLimiter } from "@/lib/http/rate-limit";

describe("checkout with Razorpay (routes, fake Razorpay API)", () => {
  const ORIGIN = "http://localhost:3000";
  let ip = 0;
  const req = (path: string, method: string, body?: unknown, cookie?: string, headers: Record<string, string> = {}) =>
    new Request(`${ORIGIN}${path}`, { method, headers: { "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": `203.0.113.${(ip++ % 200) + 1}`, ...(cookie ? { cookie } : {}), ...headers }, body: method === "GET" ? undefined : JSON.stringify(body ?? {}) });
  const cookieOf = (res: Response, name: string) => res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`))?.split(";")[0];
  const product = MOCK_PRODUCTS.find((x) => x.category === "jeans" && x.sizes.some((s) => s.stock >= 5))!;
  const size = product.sizes.find((s) => s.stock >= 5)!.label;
  let rz: ReturnType<typeof fakeRazorpay>;

  beforeEach(() => {
    rz = fakeRazorpay();
    const real = globalThis.fetch;
    vi.stubGlobal("fetch", ((input: RequestInfo | URL, init?: RequestInit) => (String(input).startsWith("https://api.razorpay.com/") ? rz.fetchImpl(input, init) : real(input, init))) as typeof fetch);
    vi.stubEnv("PAYMENT_GATEWAY", "razorpay");
    vi.stubEnv("RAZORPAY_KEY_ID", CFG.keyId);
    vi.stubEnv("RAZORPAY_KEY_SECRET", CFG.keySecret);
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", CFG.webhookSecret);
    vi.stubEnv("SITE_URL", "https://shop.example.in");
    vi.stubEnv("CHECKOUT_ENABLED", "true");
    vi.stubEnv("ACCOUNTS_ENABLED", "true");
    rateLimiter.reset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function placeUpi(phone: string) {
    const sent = await (await otpSend(req("/api/otp/send", "POST", { phone }))).json();
    const session = cookieOf(await otpVerify(req("/api/otp/verify", "POST", { challengeId: sent.challengeId, code: sent.demoCode })), "ah_session")!;
    const cookie = `${session}; ${cookieOf(await linePOST(req("/api/cart/lines", "POST", { productId: product.id, size, quantity: 1 })), "ah_cart")}`;
    const address = (await (await addressPOST(req("/api/checkout/addresses", "POST", { name: "Rzp Buyer", phone: "9876543210", pincode: "411045", line1: "Flat 12, Shanti Apartments, Baner Road", line2: "Baner", landmark: "Near park", city: "Pune", state: "Maharashtra", type: "home" }, cookie))).json()).address;
    const q = await (await quotePOST(req("/api/checkout/quote", "POST", { addressId: address.id, payment: "upi" }, cookie))).json();
    const placed = await (await placePOST(req("/api/checkout/place", "POST", { addressId: address.id, payment: "upi", upiApp: "gpay", expectedTotal: q.payable }, cookie, { "idempotency-key": crypto.randomUUID() }))).json();
    return { session, placed, payable: q.payable as number };
  }

  it("place → same-origin hop → Razorpay page; webhook confirms once; forged return can't confirm", async () => {
    const { session, placed, payable } = await placeUpi("9822200011");
    expect(placed.status).toBe("pending_payment");
    expect(placed.redirectUrl).toBe(`/api/payments/go/${placed.orderNumber}`); // the client never gets a foreign URL
    const p = { params: Promise.resolve({ order: placed.orderNumber }) };
    const hop = await goGET(req(placed.redirectUrl, "GET", undefined, session), p);
    expect(hop.status).toBe(303);
    expect(hop.headers.get("location")).toMatch(/^https:\/\/rzp\.io\/i\//);
    // Someone else (or no session) gets the order page, not the payment link.
    expect((await goGET(req(placed.redirectUrl, "GET"), p)).headers.get("location")).toBe(`${ORIGIN}/checkout/order/${placed.orderNumber}`);

    // A forged "paid" return (query params) while Razorpay says pending: nothing changes.
    const forged = await returnGET(req(`/api/payments/return?order=${placed.orderNumber}&razorpay_payment_link_status=paid&razorpay_signature=${"0".repeat(64)}`, "GET"));
    expect(forged.status).toBe(303);
    const orderNow = async () => (await (await orderGET(req(`/api/orders/${placed.orderNumber}`, "GET", undefined, session), { params: Promise.resolve({ number: placed.orderNumber }) })).json()).order;
    expect((await orderNow()).status).toBe("pending_payment");

    // The signed webhook confirms; a replay is a no-op.
    const linkId = [...rz.links.keys()][0];
    const link = rz.pay(linkId);
    expect(link.amount).toBe(payable);
    const raw = paidEvent(link);
    const hook = () => webhookPOST(new Request(`${ORIGIN}/api/payments/webhook`, { method: "POST", headers: { "x-razorpay-signature": sign(raw), "x-razorpay-event-id": "EvtPaid0001", "x-forwarded-for": "198.51.100.9" }, body: raw }));
    expect((await hook()).status).toBe(200);
    expect((await orderNow()).status).toBe("confirmed");
    expect((await (await hook()).json()).result).toBe("duplicate");
    const bad = await webhookPOST(new Request(`${ORIGIN}/api/payments/webhook`, { method: "POST", headers: { "x-razorpay-signature": "0".repeat(64) }, body: raw }));
    expect(bad.status).toBe(401);
  });

  it("the return route confirms instantly from the API when the webhook is late", async () => {
    const { session, placed } = await placeUpi("9822200012");
    rz.pay([...rz.links.keys()][0]);
    await returnGET(req(`/api/payments/return?order=${placed.orderNumber}`, "GET"));
    const o = (await (await orderGET(req(`/api/orders/${placed.orderNumber}`, "GET", undefined, session), { params: Promise.resolve({ number: placed.orderNumber }) })).json()).order;
    expect(o.status).toBe("confirmed");
  });
});
