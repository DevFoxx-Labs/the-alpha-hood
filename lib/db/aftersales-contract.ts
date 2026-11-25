import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrivacyRequestInput } from "@/lib/privacy/requests";
import type { ReturnRequest } from "@/lib/returns/service";
import { type StoresUnderTest, testTargets } from "./testing";

/**
 * Phase 3 contract: returns, return photos, the DPDP grievance inbox and newsletter subscribers behave the same
 * on memory, MySQL, PostgreSQL and MongoDB. Registered from contract.test.ts (database suites must not run in
 * parallel — they reset the same `_test` database).
 */
const GPS_JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x08, ...new TextEncoder().encode("GPS!!!"), 0xff, 0xdb, 0x00, 0x03, 0x01, 0xff, 0xda, 0x00, 0x02, 0x11, 0xff, 0xd9]);

function aReturn(number: string, extra: Partial<ReturnRequest> = {}): ReturnRequest {
  return {
    number,
    orderNumber: "AH00RET01",
    customerId: "cus_r1",
    items: [{ lineId: "ln_1", quantity: 1 }],
    reason: "size_small" as ReturnRequest["reason"],
    comment: "",
    photoIds: [],
    resolution: "refund",
    refundTo: "source",
    upiId: null,
    pickup: { addressId: "adr_1", pincode: "411045", city: "Pune", date: "2026-11-28", slot: "morning", courier: "demo", awb: "AWB1" },
    amounts: { itemsValue: 100_000, fee: 0, bonus: 0, payable: 100_000 },
    status: "pickup_scheduled",
    timeline: [{ status: "requested", at: "2026-11-26T00:00:00.000Z" }],
    createdAt: new Date().toISOString(),
    ...extra,
  };
}

const request: PrivacyRequestInput = {
  type: "access" as PrivacyRequestInput["type"],
  name: "Data Principal",
  contact: "person@example.com",
  contactKind: "email",
  orderNumber: null,
  details: "Please send me a summary of my data.",
  nominee: null,
};

for (const target of testTargets()) {
  describe(`after-sales contract · ${target.name}`, () => {
    let s: StoresUnderTest;
    beforeAll(async () => {
      s = await target.setup();
    }, 60_000);
    afterAll(async () => {
      await target.teardown();
    });

    it("returns: unique number, lookups, concurrent updates never lose a timeline entry", async () => {
      const t0 = Date.now();
      await s.returns.create(aReturn("RT-A1", { createdAt: new Date(t0).toISOString() }));
      await s.returns.create(aReturn("RT-A2", { createdAt: new Date(t0 + 1000).toISOString(), customerId: "cus_r2" }));
      await expect(s.returns.create(aReturn("RT-A1"))).rejects.toThrow(/Duplicate/);
      expect((await s.returns.get("RT-A1"))?.pickup.awb).toBe("AWB1");
      expect(await s.returns.get("RT-NOPE")).toBeNull();
      expect((await s.returns.listByOrder("AH00RET01")).map((r) => r.number).sort()).toEqual(["RT-A1", "RT-A2"]);
      expect((await s.returns.listByCustomer("cus_r1")).map((r) => r.number)).toEqual(["RT-A1"]);
      expect((await s.returns.listRecent(1)).map((r) => r.number)).toEqual(["RT-A2"]);
      await Promise.all(Array.from({ length: 5 }, (_, i) => s.returns.update("RT-A1", (r) => r.timeline.push({ status: "picked_up", at: `t${i}` }))));
      const after = (await s.returns.get("RT-A1"))!;
      expect(after.timeline).toHaveLength(6);
      const done = await s.returns.update("RT-A1", (r) => (r.status = "completed"));
      expect(done?.status).toBe("completed");
      expect(await s.returns.update("RT-NOPE", () => {})).toBeNull();
    });

    it("photos: metadata stripped, owner-only reads, attach is all-or-nothing and never moves a photo", async () => {
      const mine = await s.photos.save("cus_p1", GPS_JPEG);
      const mine2 = await s.photos.save("cus_p1", GPS_JPEG);
      const theirs = await s.photos.save("cus_p2", GPS_JPEG);
      await expect(s.photos.save("cus_p1", new TextEncoder().encode("<svg onload=alert(1)>"))).rejects.toThrow("bad_type");
      const got = (await s.photos.get("cus_p1", mine.id))!;
      expect(got.type).toBe("image/jpeg");
      expect(new TextDecoder().decode(got.bytes)).not.toContain("GPS");
      expect(got.bytes[0]).toBe(0xff);
      expect(await s.photos.get("cus_p2", mine.id)).toBeNull();
      expect(await s.photos.get("cus_p1", "../../etc/passwd")).toBeNull();
      // A list with someone else's photo attaches nothing at all.
      expect(await s.photos.attach("cus_p1", [mine.id, theirs.id], "RT-P1")).toBe(false);
      expect((await s.photos.get("cus_p1", mine.id))!.attachedTo).toBeNull();
      expect(await s.photos.attach("cus_p1", [mine.id, "img_" + "0".repeat(32)], "RT-P1")).toBe(false);
      // Two returns race for the same photo: exactly one gets it.
      const race = await Promise.all([s.photos.attach("cus_p1", [mine.id, mine2.id], "RT-P1"), s.photos.attach("cus_p1", [mine.id], "RT-P2")]);
      expect(race.filter(Boolean)).toHaveLength(1);
      const owner = (await s.photos.get("cus_p1", mine.id))!.attachedTo!;
      expect(await s.photos.attach("cus_p1", [mine.id], owner)).toBe(true); // same return again: fine
      expect(await s.photos.attach("cus_p1", [mine.id], owner === "RT-P1" ? "RT-P2" : "RT-P1")).toBe(false);
      expect(await s.photos.countRecent("cus_p1", 60_000)).toBe(2);
      expect(await s.photos.countRecent("cus_p1", 60_000, Date.now() + 120_000)).toBe(0);
    });

    it("grievance inbox: reference + DPDP deadlines, per-contact count, status log kept under concurrency", async () => {
      const now = new Date();
      const r = await s.inbox.create(request, now);
      expect(r.reference).toMatch(/^PR-[A-HJ-NP-Z2-9]{8}$/);
      expect(r.status).toBe("received");
      expect(Date.parse(r.acknowledgeBy)).toBeGreaterThan(now.getTime());
      expect(Date.parse(r.resolveBy)).toBeGreaterThan(Date.parse(r.acknowledgeBy));
      await s.inbox.create({ ...request, details: "Second request about my data." }, new Date(now.getTime() + 1000));
      expect(await s.inbox.countRecentByContact("person@example.com", 86_400_000, new Date(now.getTime() + 2000))).toBe(2);
      expect(await s.inbox.countRecentByContact("person@example.com", 86_400_000, new Date(now.getTime() + 2 * 86_400_000))).toBe(0);
      expect(await s.inbox.countRecentByContact("other@example.com", 86_400_000, now)).toBe(0);
      await Promise.all(["a", "b", "c"].map((n) => s.inbox.setStatus(r.reference, "in_progress", "dpo@x", n)));
      const got = (await s.inbox.get(r.reference))!;
      expect(got.status).toBe("in_progress");
      expect(got.log!.map((l) => l.note).sort()).toEqual(["a", "b", "c"]);
      expect(got.details).toBe(request.details);
      expect(await s.inbox.setStatus("PR-NOPE0000", "resolved", "dpo@x", "x")).toBeNull();
      const list = await s.inbox.list();
      expect(list[0].details).toBe("Second request about my data.");
    });

    it("newsletter: racing sign-ups → one subscriber; unsubscribe once; re-subscribe gets a new id", async () => {
      const now = new Date();
      const subs = await Promise.all([1, 2, 3].map(() => s.newsletter.upsert("email", "fan@example.com", now)));
      expect(new Set(subs.map((x) => x.id)).size).toBe(1);
      expect(subs[0]).toMatchObject({ channel: "email", contact: "fan@example.com", status: "pending_confirmation" });
      const wa = await s.newsletter.upsert("whatsapp", "+919800000001", now);
      expect(wa.id).not.toBe(subs[0].id);
      expect(await s.newsletter.unsubscribe(subs[0].id)).toBe(true);
      expect(await s.newsletter.unsubscribe(subs[0].id)).toBe(false);
      expect(await s.newsletter.unsubscribe("nope")).toBe(false);
      const again = await s.newsletter.upsert("email", "fan@example.com", now);
      expect(again.id).not.toBe(subs[0].id);
      expect(again.status).toBe("pending_confirmation");
      expect(await s.newsletter.unsubscribe(subs[0].id)).toBe(false);
      expect(await s.newsletter.unsubscribe(again.id)).toBe(true);
    });

    it("newsletter list: newest first, filters, literal search (no wildcard / regex injection), paging + total", async () => {
      const t = Date.parse("2030-01-01T00:00:00Z");
      const tag = `ls${Date.now().toString(36)}`;
      const a = await s.newsletter.upsert("email", `${tag}.a@example.com`, new Date(t));
      const b = await s.newsletter.upsert("email", `${tag}_b@example.com`, new Date(t + 1000));
      const c = await s.newsletter.upsert("whatsapp", "+919800000077", new Date(t + 2000));
      await s.newsletter.unsubscribe(a.id);

      const mine = await s.newsletter.list({ q: tag, limit: 10, offset: 0 });
      expect(mine.total).toBe(2);
      expect(mine.rows.map((r) => r.id)).toEqual([b.id, a.id]); // newest first
      // `_` and `.` are literal: "<tag>_" matches only b, "<tag>." only a (no LIKE / regex wildcards).
      expect((await s.newsletter.list({ q: `${tag}_`, limit: 10, offset: 0 })).rows.map((r) => r.id)).toEqual([b.id]);
      expect((await s.newsletter.list({ q: `${tag}.`, limit: 10, offset: 0 })).rows.map((r) => r.id)).toEqual([a.id]);
      expect((await s.newsletter.list({ q: "%", limit: 10, offset: 0 })).total).toBe(0);
      expect((await s.newsletter.list({ q: ".*", limit: 10, offset: 0 })).total).toBe(0);
      expect((await s.newsletter.list({ q: tag, status: "unsubscribed", limit: 10, offset: 0 })).rows.map((r) => r.id)).toEqual([a.id]);
      expect((await s.newsletter.list({ channel: "whatsapp", q: "0000077", limit: 10, offset: 0 })).rows.map((r) => r.id)).toEqual([c.id]);
      const page2 = await s.newsletter.list({ q: tag, limit: 1, offset: 1 });
      expect(page2).toMatchObject({ total: 2, rows: [{ id: a.id }] });
    });
  });
}

// ── End to end: return with a photo, privacy request, newsletter + withdrawal — real routes on each database ─
import { vi } from "vitest";
import { POST as linePOST } from "@/app/api/cart/lines/route";
import { POST as addressPOST } from "@/app/api/checkout/addresses/route";
import { POST as placePOST } from "@/app/api/checkout/place/route";
import { POST as quotePOST } from "@/app/api/checkout/quote/route";
import { POST as newsletterPOST } from "@/app/api/newsletter/route";
import { POST as withdrawPOST } from "@/app/api/newsletter/withdraw/route";
import { GET as orderGET } from "@/app/api/orders/[number]/route";
import { POST as returnPOST } from "@/app/api/orders/[number]/returns/route";
import { POST as otpSend } from "@/app/api/otp/send/route";
import { POST as otpVerify } from "@/app/api/otp/verify/route";
import { POST as privacyPOST } from "@/app/api/privacy-requests/route";
import { GET as photoGET } from "@/app/api/returns/photos/[id]/route";
import { POST as photoPOST } from "@/app/api/returns/photos/route";
import { defaultDeps } from "@/lib/checkout/service";
import { MOCK_PRODUCTS } from "@/lib/commerce/mock/data";
import { rateLimiter } from "@/lib/http/rate-limit";
import { advanceFulfilment } from "@/lib/orders/lifecycle";
import { pickupDates } from "@/lib/returns/service";
import { createDbStores } from "./index";

const product = MOCK_PRODUCTS.find((x) => x.category === "shirts" && x.sizes.some((s) => s.stock >= 5))!;
const size = product.sizes.find((s) => s.stock >= 5)!.label;

for (const target of testTargets().filter((t) => t.cfg)) {
  describe(`after-sales API on the own backend · ${target.name}`, () => {
    const ORIGIN = "http://localhost:3000";
    const req = (path: string, method: string, body?: unknown, cookie?: string, headers: Record<string, string> = {}) =>
      new Request(`${ORIGIN}${path}`, {
        method,
        headers: { "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": "198.51.100.42", ...(cookie ? { cookie } : {}), ...headers },
        body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
      });
    const cookieOf = (res: Response, name: string) => res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`))?.split(";")[0];
    const p = <T extends object>(v: T) => ({ params: Promise.resolve(v) });
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

    it("delivered order → private photo upload → damaged return; everything read back from the database", async () => {
      const sent = await (await otpSend(req("/api/otp/send", "POST", { phone: "9811122255" }))).json();
      const session = cookieOf(await otpVerify(req("/api/otp/verify", "POST", { challengeId: sent.challengeId, code: sent.demoCode })), "ah_session")!;
      const cookie = `${session}; ${cookieOf(await linePOST(req("/api/cart/lines", "POST", { productId: product.id, size, quantity: 1 })), "ah_cart")}`;
      const address = (await (await addressPOST(req("/api/checkout/addresses", "POST", ADDRESS, cookie))).json()).address;
      const q = await (await quotePOST(req("/api/checkout/quote", "POST", { addressId: address.id, payment: "cod" }, cookie))).json();
      const placed = await placePOST(req("/api/checkout/place", "POST", { addressId: address.id, payment: "cod", expectedTotal: q.payable }, cookie, { "idempotency-key": crypto.randomUUID() }));
      const number = (await placed.json()).orderNumber as string;
      for (const to of ["packed", "shipped", "delivered"] as const) await advanceFulfilment(defaultDeps(), number, to);

      const up = await photoPOST(
        new Request(`${ORIGIN}/api/returns/photos`, { method: "POST", headers: { origin: ORIGIN, "content-type": "image/jpeg", cookie: session, "x-forwarded-for": "198.51.100.42" }, body: new Blob([GPS_JPEG.slice()]) }),
      );
      expect(up.status).toBe(201);
      const { id } = await up.json();
      const served = await photoGET(req(`/api/returns/photos/${id}`, "GET", undefined, session), p({ id }));
      expect(served.status).toBe(200);
      expect(new TextDecoder().decode(new Uint8Array(await served.arrayBuffer()))).not.toContain("GPS");

      const detail = (await (await orderGET(req(`/api/orders/${number}`, "GET", undefined, session), p({ number }))).json()).order;
      const body = { items: [{ lineId: detail.lines[0].lineId, quantity: 1 }], reason: "damaged", photoIds: [id], resolution: "store_credit", addressId: address.id, date: pickupDates()[0], slot: "morning" };
      const created = await returnPOST(req(`/api/orders/${number}/returns`, "POST", body, session), p({ number }));
      expect(created.status).toBe(201);
      const ret = (await created.json()).return;

      const fresh = createDbStores(target.cfg!);
      const stored = (await fresh.returns.get(ret.number))!;
      expect(stored).toMatchObject({ orderNumber: number, reason: "damaged", status: "pickup_scheduled" });
      expect((await fresh.photos.get(stored.customerId, id))!.attachedTo).toBe(ret.number);
      // The same unit can't be returned twice, and the photo is already used.
      expect((await returnPOST(req(`/api/orders/${number}/returns`, "POST", body, session), p({ number }))).status).toBeGreaterThanOrEqual(400);
    }, 60_000);

    it("privacy request and newsletter sign-up + one-click withdrawal persist in the database", async () => {
      const res = await privacyPOST(req("/api/privacy-requests", "POST", { type: "erasure", name: "Db Person", contact: "db-person@example.com", details: "Please erase my personal data.", declaration: true }));
      expect(res.status).toBe(201);
      const { reference } = await res.json();
      const fresh = createDbStores(target.cfg!);
      expect(await fresh.inbox.get(reference)).toMatchObject({ type: "erasure", contact: "db-person@example.com", status: "received" });

      const sub = await newsletterPOST(req("/api/newsletter", "POST", { channel: "email", contact: "db-fan@example.com", consent: true }));
      expect(sub.status).toBe(201);
      const vid = cookieOf(sub, "ah_vid")!;
      const visitorId = vid.split("=")[1];
      const granted = (await fresh.ledger.listByVisitor(visitorId)).find((r) => r.purpose === "marketing_email")!;
      expect(granted.status).toBe("granted");
      const w = await withdrawPOST(req("/api/newsletter/withdraw", "POST", {}, vid));
      expect(await w.json()).toEqual({ withdrawn: 1 });
      // Unsubscribed in the database: a fresh sign-up gets a new subscriber id.
      const again = await fresh.newsletter.upsert("email", "db-fan@example.com", new Date());
      expect(again.id).not.toBe(granted.subscriber_id);
      expect((await fresh.ledger.listByVisitor(visitorId)).map((r) => r.status)).toEqual(["granted", "withdrawn"]);
    }, 60_000);
  });
}
