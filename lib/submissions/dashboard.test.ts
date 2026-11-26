import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE as addrDELETE, PATCH as addrPATCH } from "@/app/api/account/addresses/[id]/route";
import { POST as addrDefault } from "@/app/api/account/addresses/[id]/default/route";
import { POST as addrPOST } from "@/app/api/account/addresses/route";
import { GET as feedbackGET, POST as feedbackPOST } from "@/app/api/account/feedback/route";
import { GET as myReviewsGET, POST as reviewPOST } from "@/app/api/account/reviews/route";
import { GET as geoReverse } from "@/app/api/geo/reverse/route";
import { POST as otpSend } from "@/app/api/otp/send/route";
import { POST as otpVerify } from "@/app/api/otp/verify/route";
import { parseAddress } from "@/lib/checkout/address";
import { createMemoryCustomerStore, resolveCustomers } from "@/lib/customers/store";
import { clearGeoCache, reverseGeocode } from "@/lib/geo/geocode";
import { rateLimiter } from "@/lib/http/rate-limit";
import { createMemoryReviewStore, reviewsFromStore } from "@/lib/reviews/store";
import { createMemoryMediaStore } from "@/lib/catalog/media";
import { createMemoryPhotoStore } from "@/lib/returns/photos";
import { NOTIFY_EVENTS } from "@/lib/notify/catalog";
import { renderEmail } from "@/lib/notify/email-templates";
import type { Order } from "@/lib/orders/store";
import { answerFeedback, sendFeedback } from "./feedback";
import { authorName, decideReview, deleteReview, editReview, publicReview, replyToReview, reviewable, submitReview } from "./reviews";
import { createMemorySubmissionStore } from "./store";

const ADDRESS = { name: "Asha Kulkarni", phone: "9876543210", pincode: "411045", line1: "Flat 302, Shanti Apartments", line2: "Baner Road", landmark: "Near City Mall", city: "Pune", state: "Maharashtra", type: "home" };

describe("addresses", () => {
  it("validation: professional fields, alternate number, instructions, someone else, map pin inside India only", () => {
    const a = parseAddress({ ...ADDRESS, alternatePhone: "9123456780", instructions: "Call before delivery", forSomeoneElse: true, isDefault: true, location: { lat: 18.5596123456, lng: 73.7799123456 } });
    expect(a).toMatchObject({ phone: "+919876543210", alternatePhone: "+919123456780", instructions: "Call before delivery", forSomeoneElse: true, isDefault: true, location: { lat: 18.559612, lng: 73.779912 } });
    expect(parseAddress(ADDRESS)).toMatchObject({ alternatePhone: "", forSomeoneElse: false, isDefault: false, location: null });
    expect(() => parseAddress({ ...ADDRESS, alternatePhone: "9876543210" })).toThrow(/same as the main/);
    expect(() => parseAddress({ ...ADDRESS, location: { lat: 51.5, lng: -0.12 } })).toThrow(/India/);
    expect(() => parseAddress({ ...ADDRESS, location: { lat: "18.5", lng: 73.7 } })).toThrow();
    expect(() => parseAddress({ ...ADDRESS, location: { lat: 18.5, lng: 73.7, note: "x" } })).toThrow(/Unknown field/);
    expect(() => parseAddress({ ...ADDRESS, customerId: "cus_other" })).toThrow(/Unknown field/);
    // "For me" with the phone left empty uses the customer's own verified number; "someone else" must give one.
    expect(parseAddress({ ...ADDRESS, phone: "" }, "+919000000001").phone).toBe("+919000000001");
    expect(() => parseAddress({ ...ADDRESS, phone: "", forSomeoneElse: true }, "+919000000001")).toThrow(/mobile/);
  });

  it("store: first address is default; one default only; edit is owner-scoped; removing the default promotes the next", async () => {
    const s = createMemoryCustomerStore();
    const a = (await s.findOrCreateByPhone("+919000000101")).customer;
    const b = (await s.findOrCreateByPhone("+919000000102")).customer;
    const first = await s.addAddress(a.id, parseAddress(ADDRESS));
    expect(first.isDefault).toBe(true);
    const second = await s.addAddress(a.id, parseAddress({ ...ADDRESS, name: "Ravi K", isDefault: true }));
    expect((await s.get(a.id))!.addresses.filter((x) => x.isDefault).map((x) => x.id)).toEqual([second.id]);
    expect(await s.updateAddress(b.id, first.id, parseAddress({ ...ADDRESS, city: "Mumbai" }))).toBeNull(); // someone else's
    expect(await s.setDefaultAddress(b.id, first.id)).toBe(false);
    expect((await s.updateAddress(a.id, first.id, parseAddress({ ...ADDRESS, city: "Mumbai" })))!.city).toBe("Mumbai");
    expect(await s.removeAddress(a.id, second.id)).toBe(true);
    expect((await s.get(a.id))!.addresses.map((x) => [x.id, x.isDefault])).toEqual([[first.id, true]]);
  });
});

describe("reverse geocoding (server-side)", () => {
  afterEach(() => clearGeoCache());
  it("OpenStreetMap: only the rounded pin is sent, with an identifying user agent; results are cached; outside India refused", async () => {
    const calls: { url: string; ua?: string }[] = [];
    const fetcher = (async (url: string, init: RequestInit) => {
      calls.push({ url, ua: (init.headers as Record<string, string>)["user-agent"] });
      return new Response(JSON.stringify({ address: { postcode: "411045", city: "Pune", state: "Maharashtra", suburb: "Baner", road: "Baner Road" } }));
    }) as unknown as typeof fetch;
    const s = await reverseGeocode(18.559612345, 73.779912345, { fetcher, env: { SITE_URL: "https://shop.example.in" } });
    expect(s).toEqual({ pincode: "411045", city: "Pune", state: "Maharashtra", area: "Baner, Baner Road" });
    expect(new URL(calls[0].url).origin).toBe("https://nominatim.openstreetmap.org");
    expect(new URL(calls[0].url).searchParams.get("lat")).toBe("18.5596");
    expect(calls[0].ua).toContain("TheAlphaHoodStore");
    await reverseGeocode(18.55961, 73.77991, { fetcher, env: {} });
    expect(calls).toHaveLength(1); // same ~11 m cell → cache
    expect(await reverseGeocode(51.5, -0.1, { fetcher })).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it("Google when chosen with a key; a provider error returns null (the customer types the address)", async () => {
    const fetcher = (async (url: string) => {
      expect(new URL(url).origin).toBe("https://maps.googleapis.com");
      return new Response(JSON.stringify({ status: "OK", results: [{ address_components: [{ long_name: "560001", types: ["postal_code"] }, { long_name: "Bengaluru", types: ["locality"] }, { long_name: "Karnataka", types: ["administrative_area_level_1"] }, { long_name: "MG Road", types: ["route"] }] }] }));
    }) as unknown as typeof fetch;
    const env = { MAP_GEOCODER: "google", GOOGLE_MAPS_API_KEY: "AIza" + "x".repeat(35) };
    expect(await reverseGeocode(12.9716, 77.5946, { fetcher, env })).toEqual({ pincode: "560001", city: "Bengaluru", state: "Karnataka", area: "MG Road" });
    const down = (async () => new Response("", { status: 503 })) as unknown as typeof fetch;
    expect(await reverseGeocode(13.0, 77.6, { fetcher: down, env })).toBeNull();
  });
});

describe("reviews (verified purchase, moderated)", () => {
  const delivered = (number: string, customerId: string): Order =>
    ({
      number,
      customerId,
      deliveredAt: "2026-11-20T10:00:00.000Z",
      lines: [{ lineId: "ln_1", productId: "prd_1", title: "Heavyweight Tee — Black", size: "M", image: { art: "tee", colour: "#111", alt: "" } }],
    }) as unknown as Order;

  const setup = () => {
    const submissions = createMemorySubmissionStore();
    const published = createMemoryReviewStore([]);
    const orders = new Map<string, Order>([["AH00000001", delivered("AH00000001", "cus_a")], ["AH00000002", { ...delivered("AH00000002", "cus_a"), deliveredAt: null } as Order]]);
    const deps = {
      submissions,
      published,
      photos: createMemoryPhotoStore(),
      media: createMemoryMediaStore(),
      notify: async () => undefined,
      orders: { get: async (n: string) => orders.get(n) ?? null, listByCustomer: async (c: string) => [...orders.values()].filter((o) => o.customerId === c) },
      customers: { get: async () => ({ name: "Asha Kulkarni" }) as never },
      catalog: { getProductById: async () => ({ handle: "heavyweight-tee-black", styleId: "style_01", category: "t-shirts" }) as never },
    };
    return { submissions, published, deps };
  };
  const body = { orderNumber: "AH00000001", lineId: "ln_1", rating: 4, title: "Great tee", body: "Heavy, soft and keeps its shape after washing.", fit: "true" };

  it("only the buyer of a delivered item can review it, once; it shows on the product page only after approval", async () => {
    const { deps, published } = setup();
    expect(await reviewable("cus_a", deps)).toHaveLength(1);
    await expect(submitReview("cus_b", body, deps)).rejects.toMatchObject({ status: 404 }); // someone else's order
    await expect(submitReview("cus_a", { ...body, orderNumber: "AH00000002" }, deps)).rejects.toMatchObject({ code: "not_delivered" });
    await expect(submitReview("cus_a", { ...body, rating: 6 }, deps)).rejects.toThrow(/1 to 5/);
    await expect(submitReview("cus_a", { ...body, body: "short" }, deps)).rejects.toThrow();
    await expect(submitReview("cus_a", { ...body, verified: true }, deps)).rejects.toThrow(/Unknown field/);
    const s = await submitReview("cus_a", body, deps);
    expect(s).toMatchObject({ status: "pending", doc: { author: "Asha K.", styleId: "style_01" } });
    await expect(submitReview("cus_a", body, deps)).rejects.toMatchObject({ code: "already_reviewed" });
    expect(await reviewable("cus_a", deps)).toHaveLength(0);
    const pdp = reviewsFromStore(published);
    expect(await pdp.summary("style_01", "t-shirts")).toBeNull(); // not yet published

    await decideReview(s.id, "approve", "stf_1", undefined, deps);
    expect((await pdp.summary("style_01", "t-shirts"))?.summary).toMatchObject({ count: 1, average: 4 });
    expect((await pdp.list({ styleId: "style_01" }, { sort: "recent", page: 1 })).reviews[0]).toMatchObject({ author: "Asha K.", verified: true, title: "Great tee" });
    await expect(decideReview(s.id, "reject", "stf_2", "late", deps)).rejects.toMatchObject({ code: "already_decided" });

    // Edit: off the page until re-approved. Delete: gone.
    await editReview("cus_a", s.id, { rating: 2, title: "Shrank a bit", body: "After three washes it shrank half a size.", fit: "small" }, deps);
    expect(await pdp.summary("style_01", "t-shirts")).toBeNull();
    await expect(editReview("cus_b", s.id, { rating: 5, title: "Hijack", body: "Somebody else's review edited." }, deps)).rejects.toMatchObject({ status: 404 });
    await decideReview(s.id, "approve", "stf_1", undefined, deps);
    expect((await pdp.summary("style_01", "t-shirts"))?.summary.average).toBe(2);
    await expect(deleteReview("cus_b", s.id, deps)).rejects.toMatchObject({ status: 404 }); // someone else's review
    expect(await deleteReview("cus_a", s.id, deps)).toBe(true);
    expect(await pdp.summary("style_01", "t-shirts")).toBeNull();
  });

  it("rejecting needs a reason the customer sees; parallel decisions decide once", async () => {
    const { deps } = setup();
    const s = await submitReview("cus_a", body, deps);
    await expect(decideReview(s.id, "reject", "stf_1", "", deps)).rejects.toThrow();
    const race = await Promise.allSettled([decideReview(s.id, "reject", "stf_1", "Contains a phone number", deps), decideReview(s.id, "approve", "stf_2", undefined, deps)]);
    expect(race.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(authorName("  ")).toBe("Verified buyer");
    expect(authorName("ravi")).toBe("ravi");
    expect(authorName("<b>Ravi</b> Sharma")).toBe("bRavib S.");
  });
});

describe("review photos, store replies and notifications", () => {
  const delivered = { number: "AH00000001", customerId: "cus_a", deliveredAt: "2026-11-20T10:00:00.000Z", lines: [{ lineId: "ln_1", productId: "prd_1", title: "Heavyweight Tee — Black", size: "M", image: { art: "tee", colour: "#111", alt: "" } }] } as unknown as Order;
  const make = () => {
    const submissions = createMemorySubmissionStore();
    const published = createMemoryReviewStore([]);
    const photos = createMemoryPhotoStore();
    const media = createMemoryMediaStore();
    const sent: [string, string, Record<string, string>][] = [];
    const deps = {
      submissions,
      published,
      photos,
      media,
      notify: async (c: string, t: string, r: Record<string, string>) => void sent.push([c, t, r]),
      orders: { get: async (n: string) => (n === "AH00000001" ? delivered : null), listByCustomer: async () => [delivered] },
      customers: { get: async () => ({ name: "Asha Kulkarni" }) as never },
      catalog: { getProductById: async () => ({ handle: "heavyweight-tee-black", styleId: "style_01", category: "t-shirts" }) as never },
    };
    return { submissions, published, photos, media, sent, deps };
  };
  // A real (tiny) PNG: signature + IHDR 2×3 + a text chunk that must be stripped + IEND.
  const chunk = (type: string, data: number[]) => [0, 0, 0, data.length, ...new TextEncoder().encode(type), ...data, 0, 0, 0, 0];
  const png = () => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk("IHDR", [0, 0, 0, 2, 0, 0, 0, 3, 8, 2, 0, 0, 0]), ...chunk("tEXt", [...new TextEncoder().encode("GPS")]), ...chunk("IEND", [])]);
  const body = { orderNumber: "AH00000001", lineId: "ln_1", rating: 5, title: "Great tee", body: "Heavy, soft and keeps its shape after washing.", fit: "true" };

  it("photos: own uploads only, max 3, not one already used for a return; refused photos leave no review behind", async () => {
    const { deps, photos, submissions } = make();
    const mine = await photos.save("cus_a", png());
    const theirs = await photos.save("cus_b", png());
    const onReturn = await photos.save("cus_a", png());
    await photos.attach("cus_a", [onReturn.id], "RT00000001");
    await expect(submitReview("cus_a", { ...body, photos: [theirs.id] }, deps)).rejects.toMatchObject({ status: 422, code: "bad_photos" });
    await expect(submitReview("cus_a", { ...body, photos: [onReturn.id] }, deps)).rejects.toMatchObject({ code: "bad_photos" });
    expect(await submissions.listByCustomer("review", "cus_a")).toHaveLength(0); // nothing half-saved
    await expect(submitReview("cus_a", { ...body, photos: [mine.id, mine.id, mine.id, mine.id] }, deps)).rejects.toThrow(/up to 3/);
    await expect(submitReview("cus_a", { ...body, photos: ["../etc/passwd"] }, deps)).rejects.toThrow(/up to 3/);
    const s = await submitReview("cus_a", { ...body, photos: [mine.id] }, deps);
    expect(publicReview(s)).toMatchObject({ photoIds: [mine.id], reply: null });
    expect(publicReview(s)).not.toHaveProperty("mediaIds");
    // The uploaded photo can't now be put on a return (or another review).
    expect(await photos.attach("cus_a", [mine.id], "RT00000002")).toBe(false);
  });

  it("approve: public copies of the photos go on the product page and the customer is told; reject tells them too", async () => {
    const { deps, photos, media, sent, published } = make();
    const ph = await photos.save("cus_a", png());
    const s = await submitReview("cus_a", { ...body, photos: [ph.id] }, deps);
    const approved = await decideReview(s.id, "approve", "stf_1", undefined, deps);
    expect(approved.doc.mediaIds).toHaveLength(1);
    const m = await media.get(approved.doc.mediaIds![0]);
    expect(m).toMatchObject({ type: "image/png", width: 2, height: 3, createdBy: `review:${s.id}` });
    expect(new TextDecoder().decode(m!.bytes)).not.toContain("GPS");
    const shown = (await reviewsFromStore(published).list({ styleId: "style_01" }, { sort: "recent", page: 1 })).reviews[0];
    expect(shown.photos).toEqual([expect.objectContaining({ url: `/api/media/${approved.doc.mediaIds![0]}`, alt: "Customer photo 1" })]);
    expect(sent).toEqual([["cus_a", "review_published", { handle: "heavyweight-tee-black" }]]);

    const other = make();
    const r = await submitReview("cus_a", body, other.deps);
    await decideReview(r.id, "reject", "stf_1", "Contains a phone number", other.deps);
    expect(other.sent).toEqual([["cus_a", "review_rejected", {}]]);
  });

  it("store reply: only on a published review, shown on the product page and to the customer; emailed once; edit/delete take reply and public photos off", async () => {
    const { deps, photos, media, sent, published } = make();
    const ph = await photos.save("cus_a", png());
    const s = await submitReview("cus_a", { ...body, photos: [ph.id] }, deps);
    await expect(replyToReview(s.id, "Thanks!", "stf_1", deps)).rejects.toMatchObject({ code: "not_published" });
    await expect(replyToReview("sub_" + "0".repeat(24), "Thanks!", "stf_1", deps)).rejects.toMatchObject({ status: 404 });
    const ok = await decideReview(s.id, "approve", "stf_1", undefined, deps);
    sent.length = 0;
    await expect(replyToReview(s.id, "x", "stf_1", deps)).rejects.toThrow();
    const replied = await replyToReview(s.id, "Thank you, Asha — glad it fits!", "stf_1", deps);
    expect(publicReview(replied).reply).toEqual({ text: "Thank you, Asha — glad it fits!", at: expect.any(String) });
    expect(JSON.stringify(publicReview(replied))).not.toContain("stf_1"); // no staff ids to the customer
    const pdp = async () => (await reviewsFromStore(published).list({ styleId: "style_01" }, { sort: "recent", page: 1 })).reviews;
    expect((await pdp())[0].reply?.text).toBe("Thank you, Asha — glad it fits!");
    await replyToReview(s.id, "Thanks again — updated.", "stf_1", deps);
    expect(sent.map((x) => x[1])).toEqual(["review_replied"]); // replacing a reply doesn't email again
    await replyToReview(s.id, "", "stf_1", deps);
    expect((await pdp())[0].reply ?? null).toBeNull();

    // Edit → back to the check: the page copy, its public photos and the reply come off.
    const mid = ok.doc.mediaIds![0];
    const edited = await editReview("cus_a", s.id, { rating: 4, title: "Still great", body: "Second look after a month of wearing it." }, deps);
    expect(edited).toMatchObject({ status: "pending", doc: { photoIds: [ph.id], reply: null } });
    expect(await media.get(mid)).toBeNull();
    expect(await pdp()).toHaveLength(0);
    const again = await decideReview(s.id, "approve", "stf_1", undefined, deps);
    expect(await deleteReview("cus_a", s.id, deps)).toBe(true);
    expect(await media.get(again.doc.mediaIds![0])).toBeNull();
  });

  it("notifications: email only, switchable by the owner, each email links where the customer acts", () => {
    for (const t of ["review_published", "review_rejected", "review_replied", "feedback_answered"] as const) {
      expect(NOTIFY_EVENTS[t]).toMatchObject({ group: "reviews", channels: { email: true } });
      expect(NOTIFY_EVENTS[t].channels).not.toHaveProperty("sms");
    }
    const to = "asha@example.in";
    expect(renderEmail("review_published", { handle: "heavyweight-tee-black" }, to).text).toContain("/products/heavyweight-tee-black");
    expect(renderEmail("review_replied", { handle: "heavyweight-tee-black" }, to)).toMatchObject({ subject: "We replied to your review" });
    expect(() => renderEmail("review_replied", {}, to)).toThrow(/handle/);
    expect(renderEmail("review_rejected", {}, to).text).toContain("/account/reviews");
    expect(renderEmail("feedback_answered", {}, to).text).toContain("/account/help");
    expect(renderEmail("feedback_answered", {}, to).text).not.toContain("out for delivery"); // the reply itself stays in the account
  });
});

describe("help & feedback", () => {
  it("own orders only; replies are stored and shown; open messages are capped", async () => {
    const submissions = createMemorySubmissionStore();
    const orders = { get: async (n: string) => (n === "AH00000009" ? ({ customerId: "cus_a" } as Order) : null) };
    await expect(sendFeedback("cus_b", { topic: "order", orderNumber: "AH00000009", message: "Where is my parcel please?" }, { submissions, orders })).rejects.toThrow(/isn't one of your orders/);
    await expect(sendFeedback("cus_a", { topic: "nope", message: "Hello there team!" }, { submissions, orders })).rejects.toThrow();
    const m = await sendFeedback("cus_a", { topic: "order", orderNumber: "ah00000009", rating: 3, message: "Where is my parcel please?" }, { submissions, orders });
    expect(m.doc).toMatchObject({ orderNumber: "AH00000009", rating: 3 });
    const told: string[] = [];
    const notify = async (c: string, t: string) => void told.push(`${c}:${t}`);
    const answered = await answerFeedback(m.id, { reply: "It's out for delivery today.", status: "resolved" }, "stf_1", { submissions, notify });
    expect(answered).toMatchObject({ status: "resolved", doc: { reply: "It's out for delivery today.", repliedBy: "stf_1" } });
    expect(told).toEqual(["cus_a:feedback_answered"]);
    await answerFeedback(m.id, { reply: "It's out for delivery today.", status: "resolved" }, "stf_1", { submissions, notify });
    await answerFeedback(m.id, { status: "open" }, "stf_1", { submissions, notify });
    expect(told).toHaveLength(1); // same reply / status change only → no second email
    for (let i = 0; i < 10; i++) await sendFeedback("cus_c", { topic: "other", message: `Message number ${i} for you` }, { submissions, orders });
    await expect(sendFeedback("cus_c", { topic: "other", message: "One more message here" }, { submissions, orders })).rejects.toMatchObject({ status: 429 });
  });
});

describe("through the routes", () => {
  let n = 0;
  const req = (url: string, method: string, body?: unknown, cookie?: string) =>
    new Request(`http://localhost:3000${url}`, { method, headers: { "content-type": "application/json", origin: "http://localhost:3000", "x-forwarded-for": `100.97.0.${(++n % 250) + 1}`, ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const p = <T extends object>(v: T) => ({ params: Promise.resolve(v) });
  const cookieOf = (res: Response, name: string) => res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`))?.split(";")[0];
  beforeEach(() => {
    rateLimiter.reset();
    vi.stubEnv("CHECKOUT_ENABLED", "true");
    vi.stubEnv("ACCOUNTS_ENABLED", "true");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  async function signIn(phone: string) {
    const sent = await (await otpSend(req("/api/otp/send", "POST", { phone }))).json();
    return cookieOf(await otpVerify(req("/api/otp/verify", "POST", { challengeId: sent.challengeId, code: sent.demoCode })), "ah_session")!;
  }

  it("address book: add (for me, phone from the account) → edit → default → remove; another customer gets 404; signed out 401", async () => {
    const me = await signIn("9822200055");
    const other = await signIn("9822200066");
    expect((await addrPOST(req("/api/account/addresses", "POST", ADDRESS))).status).toBe(401);
    const created = await (await addrPOST(req("/api/account/addresses", "POST", { ...ADDRESS, phone: "", location: { lat: 18.5596, lng: 73.7799 } }, me))).json();
    expect(created.address).toMatchObject({ phone: "+919822200055", isDefault: true, location: { lat: 18.5596, lng: 73.7799 } });
    const id = created.address.id as string;
    const gift = await (await addrPOST(req("/api/account/addresses", "POST", { ...ADDRESS, name: "Mom", phone: "9123456789", forSomeoneElse: true }, me))).json();
    expect(gift.address).toMatchObject({ forSomeoneElse: true, isDefault: false });
    expect((await addrPATCH(req(`/api/account/addresses/${id}`, "PATCH", { ...ADDRESS, city: "Mumbai" }, other), p({ id }))).status).toBe(404);
    expect((await addrDefault(req(`/api/account/addresses/${id}/default`, "POST", {}, other), p({ id }))).status).toBe(404);
    expect((await (await addrPATCH(req(`/api/account/addresses/${id}`, "PATCH", { ...ADDRESS, city: "Mumbai" }, me), p({ id }))).json()).address.city).toBe("Mumbai");
    expect((await addrDefault(req(`/api/account/addresses/${gift.address.id}/default`, "POST", {}, me), p({ id: gift.address.id }))).status).toBe(200);
    const customer = (await resolveCustomers().findByPhone("+919822200055"))!;
    expect(customer.addresses.find((a) => a.isDefault)?.name).toBe("Mom");
    expect((await addrDELETE(req(`/api/account/addresses/${id}`, "DELETE", {}, other), p({ id }))).status).toBe(404);
    expect((await addrDELETE(req(`/api/account/addresses/${id}`, "DELETE", {}, me), p({ id }))).status).toBe(200);
  });

  it("geocoding route: signed-in only, India only", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ address: { postcode: "411045", city: "Pune", state: "Maharashtra" } })));
    expect((await geoReverse(req("/api/geo/reverse?lat=18.5&lng=73.8", "GET"))).status).toBe(401);
    const me = await signIn("9822200077");
    expect((await geoReverse(req("/api/geo/reverse?lat=51.5&lng=0", "GET", undefined, me))).status).toBe(422);
    const ok = await geoReverse(req("/api/geo/reverse?lat=18.5&lng=73.8", "GET", undefined, me));
    expect((await ok.json()).suggestion).toMatchObject({ city: "Pune", pincode: "411045" });
  });

  it("reviews and feedback routes: signed out 401; nothing to review without a delivered order; feedback round trip", async () => {
    expect((await myReviewsGET(req("/api/account/reviews", "GET"))).status).toBe(401);
    expect((await feedbackPOST(req("/api/account/feedback", "POST", { topic: "other", message: "Hello there team!" }))).status).toBe(401);
    const me = await signIn("9822200088");
    expect(await (await myReviewsGET(req("/api/account/reviews", "GET", undefined, me))).json()).toEqual({ reviews: [], toReview: [] });
    expect((await reviewPOST(req("/api/account/reviews", "POST", { orderNumber: "AH99999999", lineId: "ln_1", rating: 5, title: "Nice", body: "This is long enough to be a review." }, me))).status).toBe(404);
    expect((await feedbackPOST(req("/api/account/feedback", "POST", { topic: "suggestion", rating: 5, message: "Please add more colours in the hoodies." }, me))).status).toBe(201);
    const list = await (await feedbackGET(req("/api/account/feedback", "GET", undefined, me))).json();
    expect(list.messages).toHaveLength(1);
    expect(list.messages[0]).toMatchObject({ status: "open", topicLabel: "A suggestion", rating: 5 });
    expect(list.topics.length).toBeGreaterThan(4);
  });
});
