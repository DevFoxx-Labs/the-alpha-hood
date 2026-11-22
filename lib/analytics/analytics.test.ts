import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { serializeChoice } from "@/lib/consent/cookie";
import type { Order } from "@/lib/orders/store";
import { attributionFrom } from "./attribution";
import { resetAnalyticsForTests, track } from "./client";
import { itemFromProduct, purchaseEventId, safeSearchTerm, toGa4, toMeta } from "./events";
import { flushServerEvents, ga4RefundEvent, metaPurchaseEvent, normalisePhone, pendingServerEvents, queuePurchase, queueRefund, readServerAnalytics, resetServerEventsForTests } from "./server";

const VERSION = "2026-11-24";
const consentCookie = (analytics: boolean, advertising: boolean) =>
  `ah_consent=${encodeURIComponent(serializeChoice({ version: VERSION, analytics, advertising, decidedAt: 1_700_000_000 }))}`;
const TRACKING = { ga4Id: "G-TEST1234", metaPixelId: "1234567890", googleAdsId: "AW-1234567", googleAdsPurchaseLabel: "abcDEF12", cookiesVersion: VERSION };
const item = itemFromProduct({ id: "p_1", title: "Black tee", category: "t-shirts", price: 79_900 }, { size: "M", quantity: 2 });

// ── Minimal browser stand-in (vitest runs in node) ───────────────────────────────────────────────
type Win = { dataLayer?: unknown[][]; gtag?: unknown; fbq?: ((...a: unknown[]) => void) & { queue?: unknown[][] }; localStorage: Storage };
function browser(cookie: string) {
  const store = new Map<string, string>();
  const g = globalThis as unknown as { window?: Win; document?: unknown };
  g.window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    },
  };
  g.document = { cookie, getElementById: () => ({ textContent: JSON.stringify(TRACKING) }) };
  resetAnalyticsForTests();
  return { win: g.window!, store };
}
const gtagEvents = (w: Win) => (w.dataLayer ?? []).map((a) => Array.from(a as unknown as unknown[])).filter((a) => a[0] === "event");
const fbqCalls = (w: Win) => (w.fbq?.queue ?? []).filter((a) => a[0] === "track");

afterEach(() => {
  const g = globalThis as unknown as { window?: unknown; document?: unknown };
  delete g.window;
  delete g.document;
});

describe("ANL-01 browser events are consent-gated", () => {
  it("no choice / rejected → nothing is queued, stored or sent", () => {
    for (const cookie of ["", consentCookie(false, false)]) {
      const { win, store } = browser(cookie);
      track("add_to_cart", { item });
      track("purchase", { orderNumber: "AH1", value: 1000, tax: 0, shipping: 0, items: [item], paymentType: "upi" });
      expect(win.dataLayer).toBeUndefined();
      expect(win.fbq).toBeUndefined();
      expect(store.size).toBe(0);
    }
  });

  it("a choice made under an older Cookie Policy version counts as no choice", () => {
    const { win } = browser(`ah_consent=${encodeURIComponent(serializeChoice({ version: "2026-11-22", analytics: true, advertising: true, decidedAt: 1 }))}`);
    track("add_to_cart", { item });
    expect(win.dataLayer).toBeUndefined();
  });

  it("analytics only → GA4 gets it, Meta and Google Ads don't", () => {
    const { win } = browser(consentCookie(true, false));
    track("add_to_cart", { item });
    track("purchase", { orderNumber: "AH2", value: 159_800, tax: 0, shipping: 0, items: [item], paymentType: "upi" });
    const events = gtagEvents(win);
    expect(events.map((e) => e[1])).toEqual(["add_to_cart", "purchase"]);
    expect(events.some((e) => e[1] === "conversion")).toBe(false);
    expect(win.fbq).toBeUndefined();
  });

  it("advertising only → Meta Pixel + Google Ads conversion, no GA4 event; purchase counted once with the CAPI event id", () => {
    const { win } = browser(consentCookie(false, true));
    const purchase = { orderNumber: "AH3", value: 159_800, tax: 0, shipping: 0, items: [item], paymentType: "upi" };
    track("purchase", purchase);
    track("purchase", purchase); // refresh of the confirmation page
    const meta = fbqCalls(win).filter((c) => c[1] !== "PageView");
    expect(meta).toHaveLength(1);
    expect(meta[0][1]).toBe("Purchase");
    expect(meta[0][3]).toEqual({ eventID: purchaseEventId("AH3") });
    const g = gtagEvents(win);
    expect(g.map((e) => e[1])).toEqual(["conversion"]);
    expect((g[0][2] as { send_to: string }).send_to).toBe("AW-1234567/abcDEF12");
  });
});

describe("ANL-01 event payloads carry no personal data", () => {
  it("search terms that look like a phone number or email are dropped", () => {
    expect(safeSearchTerm("Baggy Jeans")).toBe("baggy jeans");
    expect(safeSearchTerm("98765 43210")).toBeNull();
    expect(safeSearchTerm("me@example.com")).toBeNull();
    expect(toGa4("search", { query: "9876543210", results: 0 })).toBeNull();
    expect(toMeta("search", { query: "a@b.co", results: 0 })).toBeNull();
  });

  it("GA4 values are rupees from paise; personal-looking coupon codes are dropped", () => {
    const ga = toGa4("begin_checkout", { value: 159_850, items: [item], coupon: "PHONE9876543210" })!;
    expect(ga.value).toBe(1598.5);
    expect(ga).not.toHaveProperty("coupon");
    expect(toGa4("begin_checkout", { value: 1, items: [], coupon: "ALPHA10" })!.coupon).toBe("ALPHA10");
  });
});

// ── Server side ──────────────────────────────────────────────────────────────────────────────────
const SERVER_ENV = { META_PIXEL_ID: "1234567890", META_CAPI_TOKEN: "EAAB".padEnd(40, "x"), GA4_MEASUREMENT_ID: "G-TEST1234", GA4_API_SECRET: "secretsecret" };
function order(attribution: Order["attribution"]): Order {
  return {
    id: "o1",
    number: "AH100",
    customerId: "cus_1",
    confirmedAt: "2026-11-24T10:00:00.000Z",
    address: { phone: "9876543210", name: "Ravi Kumar", line1: "1 MG Road", pincode: "560001" },
    pricing: { total: 159_800 },
    lines: [{ productId: "p_1", quantity: 2, net: 159_800 }],
    attribution,
  } as unknown as Order;
}
const req = (cookie: string) => new Request("http://localhost:3000/api/checkout/place", { headers: { cookie, "user-agent": "UA/1.0", "x-forwarded-for": "203.0.113.5" } });

describe("ANL-01 consent snapshot at placement", () => {
  it("no consent → nothing stored", () => {
    expect(attributionFrom(req(""), VERSION)).toBeNull();
    expect(attributionFrom(req(consentCookie(false, false)), VERSION)).toBeNull();
  });

  it("analytics only → GA client id, never IP / UA / Meta cookies", () => {
    const a = attributionFrom(req(`${consentCookie(true, false)}; _ga=GA1.1.111.222; _fbp=fb.1.1700000000000.123`), VERSION)!;
    expect(a).toMatchObject({ analytics: true, advertising: false, gaClientId: "111.222" });
    expect(a.ip).toBeUndefined();
    expect(a.userAgent).toBeUndefined();
    expect(a.fbp).toBeUndefined();
  });

  it("advertising → Meta cookies, IP and UA; malformed cookies are ignored", () => {
    const a = attributionFrom(req(`${consentCookie(false, true)}; _fbp=fb.1.1700000000000.123; _fbc=<script>`), VERSION)!;
    expect(a).toMatchObject({ advertising: true, fbp: "fb.1.1700000000000.123", ip: "203.0.113.5", userAgent: "UA/1.0" });
    expect(a.fbc).toBeUndefined();
    expect(a.gaClientId).toBeUndefined();
  });
});

describe("ANL-01 server events (Conversions API / Measurement Protocol)", () => {
  beforeEach(() => resetServerEventsForTests());

  it("fail closed: no secret → not configured, nothing queued", () => {
    expect(readServerAnalytics({ META_PIXEL_ID: "1234567890" }).meta).toBeNull();
    expect(readServerAnalytics({ GA4_MEASUREMENT_ID: "G-TEST1234" }).ga4).toBeNull();
    queuePurchase(order({ analytics: true, advertising: true, cookiesVersion: VERSION, capturedAt: "" }), {});
    expect(pendingServerEvents()).toHaveLength(0);
  });

  it("purchase goes to Meta only with advertising consent; contact data only as SHA-256", () => {
    const cfg = readServerAnalytics(SERVER_ENV).meta!;
    expect(metaPurchaseEvent(order(null), cfg)).toBeNull();
    expect(metaPurchaseEvent(order({ analytics: true, advertising: false, cookiesVersion: VERSION, capturedAt: "" }), cfg)).toBeNull();
    const e = metaPurchaseEvent(order({ analytics: false, advertising: true, cookiesVersion: VERSION, capturedAt: "", ip: "203.0.113.5" }), cfg)!;
    const body = JSON.stringify(e.body);
    expect(body).not.toMatch(/9876543210|Ravi|MG Road|560001|cus_1/);
    expect(normalisePhone("+91 98765-43210")).toBe("919876543210");
    const data = (e.body as { data: { event_id: string; user_data: { ph: string[] }; custom_data: { value: number } }[] }).data[0];
    expect(data.event_id).toBe(purchaseEventId("AH100"));
    expect(data.user_data.ph[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(data.custom_data.value).toBe(1598);
  });

  it("refund goes to GA4 only with analytics consent and a client id; once per refund reference", async () => {
    const cfg = readServerAnalytics(SERVER_ENV).ga4!;
    expect(ga4RefundEvent(order({ analytics: false, advertising: true, cookiesVersion: VERSION, capturedAt: "" }), 500, "r1", cfg)).toBeNull();
    expect(ga4RefundEvent(order({ analytics: true, advertising: false, cookiesVersion: VERSION, capturedAt: "" }), 500, "r1", cfg)).toBeNull();
    const o = order({ analytics: true, advertising: false, cookiesVersion: VERSION, capturedAt: "", gaClientId: "111.222" });
    queueRefund(o, 50_000, "cancel:AH100", SERVER_ENV);
    queueRefund(o, 50_000, "cancel:AH100", SERVER_ENV);
    expect(pendingServerEvents()).toHaveLength(1);
    const calls: string[] = [];
    const ok = (async (url: string) => (calls.push(String(url)), new Response("{}", { status: 200 }))) as unknown as typeof fetch;
    expect(await flushServerEvents(ok)).toEqual({ sent: 1, failed: 0 });
    expect(calls[0]).toMatch(/^https:\/\/www\.google-analytics\.com\/mp\/collect\?/);
    queueRefund(o, 50_000, "cancel:AH100", SERVER_ENV); // already sent → not queued again
    expect(pendingServerEvents()).toHaveLength(0);
  });

  it("a failing or slow provider never throws into the order flow", async () => {
    queuePurchase(order({ analytics: false, advertising: true, cookiesVersion: VERSION, capturedAt: "" }), SERVER_ENV);
    const boom = (async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    expect(await flushServerEvents(boom)).toEqual({ sent: 0, failed: 1 });
  });
});
