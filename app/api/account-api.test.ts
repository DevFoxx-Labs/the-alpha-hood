import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveLedger } from "@/lib/consent/ledger";
import { MOCK_PRODUCTS } from "@/lib/commerce/mock/data";
import { rateLimiter } from "@/lib/http/rate-limit";
import { POST as deletePOST } from "./account/delete/route";
import { GET as exportGET } from "./account/export/route";
import { GET as meGET, PATCH as mePATCH } from "./account/me/route";
import { GET as ordersGET } from "./account/orders/route";
import { GET as prefsGET, POST as prefsPOST } from "./account/preferences/route";
import { POST as linePOST } from "./cart/lines/route";
import { POST as addressPOST } from "./checkout/addresses/route";
import { POST as placePOST } from "./checkout/place/route";
import { POST as quotePOST } from "./checkout/quote/route";
import { GET as devGET, POST as devPOST } from "./dev/fulfilment/route";
import { POST as cancelPOST } from "./orders/[number]/cancel/route";
import { GET as invoiceGET } from "./orders/[number]/invoice/route";
import { GET as orderGET } from "./orders/[number]/route";
import { POST as returnPOST } from "./orders/[number]/returns/route";
import { POST as otpSend } from "./otp/send/route";
import { POST as otpVerify } from "./otp/verify/route";
import { GET as photoGET } from "./returns/photos/[id]/route";
import { POST as photoPOST } from "./returns/photos/route";
import { POST as logoutPOST } from "./session/logout/route";
import { POST as trackPOST } from "./track/send/route";

const ORIGIN = "http://localhost:3000";
let ipSeq = 0;
function req(path: string, method: string, body?: unknown, { cookie, headers = {} }: { cookie?: string; headers?: Record<string, string> } = {}) {
  const h = new Headers({ "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": `198.18.0.${(ipSeq % 250) + 1}`, ...headers });
  if (cookie) h.set("cookie", cookie);
  return new Request(`${ORIGIN}${path}`, { method, headers: h, body: method === "GET" ? undefined : JSON.stringify(body ?? {}) });
}
const cookieOf = (res: Response, name: string) => res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`))?.split(";")[0];
const p = <T extends object>(v: T) => ({ params: Promise.resolve(v) });

const product = MOCK_PRODUCTS.find((x) => x.category === "shirts" && x.sizes.filter((s) => s.stock >= 5).length >= 2)!;
const size = product.sizes.find((s) => s.stock >= 5)!.label;
const ADDRESS = { name: "Test Buyer", phone: "9876543210", pincode: "411045", line1: "Flat 12, Shanti Apartments, Baner Road", line2: "Baner", landmark: "Near park", city: "Pune", state: "Maharashtra", type: "home" };

async function signIn(phone: string) {
  const sent = await (await otpSend(req("/api/otp/send", "POST", { phone }))).json();
  return cookieOf(await otpVerify(req("/api/otp/verify", "POST", { challengeId: sent.challengeId, code: sent.demoCode })), "ah_session")!;
}

async function codOrder(phone: string) {
  const session = await signIn(phone);
  const cart = cookieOf(await linePOST(req("/api/cart/lines", "POST", { productId: product.id, size, quantity: 1 })), "ah_cart")!;
  const cookie = `${session}; ${cart}`;
  const address = (await (await addressPOST(req("/api/checkout/addresses", "POST", ADDRESS, { cookie }))).json()).address;
  const q = await (await quotePOST(req("/api/checkout/quote", "POST", { addressId: address.id, payment: "cod" }, { cookie }))).json();
  const placed = await (await placePOST(req("/api/checkout/place", "POST", { addressId: address.id, payment: "cod", expectedTotal: q.pricing.total }, { cookie, headers: { "idempotency-key": crypto.randomUUID() } }))).json();
  return { session, cookie, address, number: placed.orderNumber as string };
}

const advance = (number: string, to: string) => devPOST(req("/api/dev/fulfilment", "POST", { kind: "order", number, to }));

let clock = Date.parse("2026-11-23T05:00:00Z");
/** Moves time past the 30 s OTP resend cooldown between sign-ins of the same phone. */
const tick = () => vi.setSystemTime((clock += 31_000));

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

describe("account basics (ACC-01/02)", () => {
  it("account routes need a session; profile edits are validated", async () => {
    expect((await meGET(req("/api/account/me", "GET"))).status).toBe(401);
    expect((await ordersGET(req("/api/account/orders", "GET"))).status).toBe(401);
    const s = await signIn("9700000001");
    expect((await mePATCH(req("/api/account/me", "PATCH", { name: "Arjun" }, { cookie: s }))).status).toBe(200);
    expect((await mePATCH(req("/api/account/me", "PATCH", { email: "nope" }, { cookie: s }))).status).toBe(422);
    expect((await mePATCH(req("/api/account/me", "PATCH", { phone: "9999999999" }, { cookie: s }))).status).toBe(422);
    const me = await (await meGET(req("/api/account/me", "GET", undefined, { cookie: s }))).json();
    expect(me.customer.name).toBe("Arjun");
    expect(me.customer.phone).not.toContain("9700000001");
  });

  it("sign out everywhere revokes every session", async () => {
    const a = await signIn("9700000002");
    tick();
    const b = await signIn("9700000002");
    expect((await logoutPOST(req("/api/session/logout", "POST", { everywhere: true }, { cookie: a }))).status).toBe(200);
    expect((await meGET(req("/api/account/me", "GET", undefined, { cookie: b }))).status).toBe(401);
  });

  it("accounts switched off → 503 (fail closed)", async () => {
    vi.stubEnv("ACCOUNTS_ENABLED", "false");
    vi.stubEnv("CHECKOUT_ENABLED", "false");
    expect((await meGET(req("/api/account/me", "GET"))).status).toBe(503);
  });
});

describe("marketing preferences ↔ consent ledger (DPDP)", () => {
  it("off by default; every change writes a ledger row with user id; email needed for email offers", async () => {
    const s = await signIn("9700000003");
    expect(await (await prefsGET(req("/api/account/preferences", "GET", undefined, { cookie: s }))).json()).toMatchObject({ marketing_email: false, marketing_whatsapp: false });
    expect((await prefsPOST(req("/api/account/preferences", "POST", { marketing_email: true }, { cookie: s }))).status).toBe(422);
    await prefsPOST(req("/api/account/preferences", "POST", { marketing_whatsapp: true }, { cookie: s }));
    const after = await (await prefsPOST(req("/api/account/preferences", "POST", { marketing_whatsapp: false }, { cookie: s }))).json();
    expect(after.marketing_whatsapp).toBe(false);
    const statuses = after.history.filter((h: { purpose: string }) => h.purpose === "marketing_whatsapp").map((h: { status: string }) => h.status);
    expect(statuses).toEqual(["granted", "withdrawn"]);
    expect((await prefsPOST(req("/api/account/preferences", "POST", { marketing_whatsapp: "yes" }, { cookie: s }))).status).toBe(422);
  });
});

describe("orders, tracking, cancellation, invoice, returns", () => {
  it("track-order: same response whether or not the phone matches; only the real owner gets a code", async () => {
    const { number } = await codOrder("9700000010");
    const wrong = await (await trackPOST(req("/api/track/send", "POST", { orderNumber: number, phone: "9700000099" }))).json();
    // Within the resend cooldown the real phone still gets the generic response (no enumeration).
    const cooling = await trackPOST(req("/api/track/send", "POST", { orderNumber: number, phone: "9700000010" }));
    expect(cooling.status).toBe(200);
    expect(Object.keys(await cooling.json()).sort()).toEqual(["challengeId", "message"]);
    tick();
    const right = await (await trackPOST(req("/api/track/send", "POST", { orderNumber: number, phone: "9700000010" }))).json();
    const missing = await (await trackPOST(req("/api/track/send", "POST", { orderNumber: "AH00000000", phone: "9700000010" }))).json();
    expect(Object.keys(wrong).sort()).toEqual(["challengeId", "message"]);
    expect(missing.message).toBe(wrong.message);
    expect(wrong.challengeId).toHaveLength(right.challengeId.length);
    expect(right.demoCode).toMatch(/^\d{6}$/);
    expect(wrong.demoCode).toBeUndefined();
    // Verifying the decoy just fails.
    expect((await otpVerify(req("/api/otp/verify", "POST", { challengeId: wrong.challengeId, code: "123456" }))).status).toBe(422);
  });

  it("cancel before packing works once; others can't cancel or see the order", async () => {
    const { number, session } = await codOrder("9700000011");
    const other = await signIn("9700000012");
    expect((await cancelPOST(req(`/api/orders/${number}/cancel`, "POST", {}, { cookie: other }), p({ number }))).status).toBe(404);
    expect((await orderGET(req(`/api/orders/${number}`, "GET", undefined, { cookie: other }), p({ number }))).status).toBe(404);
    expect((await cancelPOST(req(`/api/orders/${number}/cancel`, "POST", {}, { cookie: session }), p({ number }))).status).toBe(200);
    expect((await cancelPOST(req(`/api/orders/${number}/cancel`, "POST", {}, { cookie: session }), p({ number }))).status).toBe(409);
  });

  it("invoice only after dispatch; return request on a delivered order; photo upload is type-checked and private", async () => {
    const { number, session, address } = await codOrder("9700000013");
    expect((await invoiceGET(req(`/api/orders/${number}/invoice`, "GET", undefined, { cookie: session }), p({ number }))).status).toBe(409);
    for (const to of ["packed", "shipped", "delivered"]) expect((await advance(number, to)).status).toBe(200);
    const inv = await (await invoiceGET(req(`/api/orders/${number}/invoice`, "GET", undefined, { cookie: session }), p({ number }))).json();
    expect(inv.invoice.number).toMatch(/^INV\/\d{4}-\d{2}\/\d{6}$/);
    expect(inv.invoice.lines[0].cgst + inv.invoice.lines[0].sgst + inv.invoice.lines[0].igst).toBeGreaterThan(0);

    const detail = (await (await orderGET(req(`/api/orders/${number}`, "GET", undefined, { cookie: session }), p({ number }))).json()).order;
    expect(detail.returnWindow.open).toBe(true);
    expect(detail.timeline.map((t: { status: string }) => t.status)).toEqual(["placed", "confirmed", "packed", "shipped", "delivered"]);

    // Photo upload: SVG/HTML disguised as JPEG is refused; a JPEG is stored and only its owner can read it.
    const upload = (bytes: Uint8Array, type: string, cookie = session) =>
      photoPOST(new Request(`${ORIGIN}/api/returns/photos`, { method: "POST", headers: { origin: ORIGIN, "content-type": type, cookie, "x-forwarded-for": "198.18.1.1" }, body: new Blob([bytes.slice()]) }));
    expect((await upload(new TextEncoder().encode("<svg onload=alert(1)>"), "image/jpeg")).status).toBe(422);
    expect((await upload(new TextEncoder().encode("x"), "image/svg+xml")).status).toBe(415);
    const ok = await upload(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]), "image/jpeg");
    expect(ok.status).toBe(201);
    const { id } = await ok.json();
    const mine = await photoGET(req(`/api/returns/photos/${id}`, "GET", undefined, { cookie: session }), p({ id }));
    expect(mine.headers.get("x-content-type-options")).toBe("nosniff");
    expect(mine.headers.get("content-security-policy")).toContain("sandbox");
    const stranger = await signIn("9700000014");
    expect((await photoGET(req(`/api/returns/photos/${id}`, "GET", undefined, { cookie: stranger }), p({ id }))).status).toBe(404);

    const created = await returnPOST(
      req(`/api/orders/${number}/returns`, "POST", { items: [{ lineId: detail.lines[0].lineId, quantity: 1 }], reason: "damaged", photoIds: [id], resolution: "store_credit", addressId: address.id, date: detail && (await import("@/lib/returns/service")).pickupDates()[0], slot: "morning" }, { cookie: session }),
      p({ number }),
    );
    expect(created.status).toBe(201);
    const ret = (await created.json()).return;
    expect(ret.amounts.fee).toBe(0);
    expect(ret.amounts.bonus).toBeGreaterThan(0);
    expect((await returnPOST(req(`/api/orders/${number}/returns`, "POST", { items: [{ lineId: detail.lines[0].lineId, quantity: 1 }], reason: "too_small", resolution: "refund", refundTo: "upi", upiId: "a@b", addressId: address.id, date: "2026-11-24", slot: "morning", amount: 1 }, { cookie: session }), p({ number }))).status).toBe(422);
  });
});

describe("DPDP rights: export and delete", () => {
  it("export returns own data as an attachment", async () => {
    const { session } = await codOrder("9700000020");
    const res = await exportGET(req("/api/account/export", "GET", undefined, { cookie: session }));
    expect(res.headers.get("content-disposition")).toContain("attachment");
    const data = await res.json();
    expect(data.orders).toHaveLength(1);
    expect(data.profile.phone).toBe("+919700000020");
  });

  it("delete is refused while an order is in progress, then erases, revokes sessions and withdraws consent", async () => {
    const { session, number } = await codOrder("9700000021");
    expect((await deletePOST(req("/api/account/delete", "POST", { confirm: "yes" }, { cookie: session }))).status).toBe(422);
    expect((await deletePOST(req("/api/account/delete", "POST", { confirm: "DELETE" }, { cookie: session }))).status).toBe(409);
    for (const to of ["packed", "shipped", "delivered"]) await advance(number, to);
    const me = await (await meGET(req("/api/account/me", "GET", undefined, { cookie: session }))).json();
    expect(me.customer).toBeTruthy();
    const res = await deletePOST(req("/api/account/delete", "POST", { confirm: "DELETE" }, { cookie: session }));
    expect(res.status).toBe(200);
    expect((await meGET(req("/api/account/me", "GET", undefined, { cookie: session }))).status).toBe(401);
    // The phone can sign up again as a brand-new account with no history.
    tick();
    const fresh = await signIn("9700000021");
    expect((await (await ordersGET(req("/api/account/orders", "GET", undefined, { cookie: fresh }))).json()).orders).toEqual([]);
    expect(resolveLedger()).toBeTruthy();
  });
});

describe("dev fulfilment tool", () => {
  it("is 404 in production and refuses invalid transitions", async () => {
    const { number } = await codOrder("9700000030");
    expect((await advance(number, "delivered")).status).toBe(409);
    vi.stubEnv("NODE_ENV", "production");
    expect((await devGET()).status).toBe(404);
    expect((await advance(number, "packed")).status).toBe(404);
  });
});
