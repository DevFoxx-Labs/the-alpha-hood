import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type CatalogAdminDeps, createProduct, updateProduct } from "@/lib/catalog/admin";
import { createOwnCatalog } from "@/lib/catalog/own";
import { parseQuery } from "@/lib/catalog/query";
import { seedDemoCatalog } from "@/lib/catalog/seed";
import { createMockAdapter, DEMO_SNAPSHOT } from "@/lib/commerce/mock";
import { MOCK_NOW } from "@/lib/commerce/mock/data";
import { summarise } from "@/lib/reviews/summary";
import { reviewsFromStore } from "@/lib/reviews/store";
import { MOCK_REVIEWS } from "@/lib/commerce/mock/data";
import { type StoresUnderTest, testTargets } from "./testing";

/**
 * Phase 4 contract: the catalogue + reviews behave the same on memory, MySQL, PostgreSQL and MongoDB, and the
 * own-backend storefront reads EXACTLY what the demo catalogue serves once it's seeded (same products, swatches,
 * ratings, collections, search). Registered from contract.test.ts (database suites run one after another).
 */
const mock = createMockAdapter();
const query = parseQuery(new URLSearchParams(), { search: false });
const searchQuery = parseQuery(new URLSearchParams(), { search: true });

export function productBody(over: Record<string, unknown> = {}) {
  return {
    title: "Contract Linen Shirt — Sea Blue",
    sku: "AH-SHI-900-SEA",
    category: "shirts",
    subcategory: "linen",
    price: 149_900,
    mrp: 199_900,
    colour: { name: "Sea Blue", hex: "#5B7FA6" },
    colourFamily: "blue",
    sizes: [
      { label: "M", stock: 3 },
      { label: "L", stock: 0 },
    ],
    art: "shirt",
    attributes: { fit: "regular", fabric: "linen", sleeve: "full" },
    tags: ["summer", "linen"],
    description: "A breathable linen shirt for warm days.",
    specs: [{ label: "Collar", value: "Spread" }],
    sizeChart: "tops",
    legal: { manufacturer: "Contract Manufacturer, Pune", countryOfOrigin: "India", netQuantity: "1 N (one piece)" },
    status: "active",
    ...over,
  };
}

for (const target of testTargets()) {
  describe(`catalogue contract · ${target.name}`, () => {
    let s: StoresUnderTest;
    let own: ReturnType<typeof createOwnCatalog>;
    let deps: CatalogAdminDeps;
    beforeAll(async () => {
      s = await target.setup();
      await seedDemoCatalog(s, () => {}, new Date(MOCK_NOW));
      own = createOwnCatalog(s.catalog, s.reviewStore, { now: () => MOCK_NOW, ttlMs: 60_000 });
      deps = { store: s.catalog, invalidate: own.invalidate };
    }, 120_000);
    afterAll(async () => {
      await target.teardown();
    });

    it("seeded: every product, swatch, rating, category and collection matches the demo catalogue", async () => {
      for (const p of DEMO_SNAPSHOT.products) expect(await own.reader.getProduct(p.handle), p.handle).toEqual(await mock.getProduct(p.handle));
      expect(await own.reader.listCategoryTree()).toEqual(await mock.listCategoryTree());
      expect(await own.reader.listCategories()).toEqual(await mock.listCategories());
      expect(await own.reader.listCollections()).toEqual(await mock.listCollections());
      expect(await own.reader.listProducts({ limit: 60 })).toEqual(await mock.listProducts({ limit: 60 }));
      for (const c of ["new-in", "sale", "plus-size", "weekend-uniform", "combo-tees"]) {
        expect(await own.reader.searchCatalog({ kind: "collection", collection: c }, query), c).toEqual(await mock.searchCatalog({ kind: "collection", collection: c }, query));
      }
      expect(await own.reader.searchCatalog({ kind: "search", q: "oversized black" }, searchQuery)).toEqual(await mock.searchCatalog({ kind: "search", q: "oversized black" }, searchQuery));
      expect(await own.reader.suggest("flanel")).toEqual(await mock.suggest("flanel"));
      // Seeding twice changes nothing.
      expect((await seedDemoCatalog(s, () => {}, new Date(MOCK_NOW))).products).toBe(0);
      expect(await own.reader.getProduct("../admin")).toBeNull();
    }, 60_000);

    it("reviews: same summary as the demo, one helpful vote per voter even when votes race", async () => {
      const rv = reviewsFromStore(s.reviewStore);
      const style = MOCK_REVIEWS[0].styleId;
      expect((await rv.summary(style, "x"))?.summary).toEqual(summarise(MOCK_REVIEWS.filter((r) => r.styleId === style)));
      const id = MOCK_REVIEWS[0].id;
      const base = MOCK_REVIEWS[0].helpful;
      const race = await Promise.all([1, 2, 3].map(() => rv.voteHelpful(id, "vis_1")));
      expect(race.filter((x) => x !== null)).toEqual([base + 1]);
      expect(await rv.voteHelpful(id, "vis_2")).toBe(base + 2);
      expect(await rv.voteHelpful("rv_nope", "vis_1")).toBeNull();
      expect(await rv.summary("style_none", "co-ords")).toBeNull();
    });

    it("admin: create (draft hidden, active shown), join a style, refuse stale edits and taken handles/SKUs", async () => {
      const draft = await createProduct(deps, productBody({ status: "draft" }));
      expect(draft.id).toMatch(/^prd_[0-9a-f]{20}$/);
      expect(draft.handle).toBe("contract-linen-shirt-sea-blue");
      expect(await own.reader.getProduct(draft.handle)).toBeNull(); // drafts never reach the storefront
      expect(await mock.getProduct(draft.handle)).toBeNull();

      const live = await updateProduct(deps, draft.id, { ...productBody({ status: "active", price: 129_900 }), version: 1 });
      expect(live.version).toBe(2);
      const shown = (await own.reader.getProduct(draft.handle))!;
      expect(shown.price).toBe(129_900);
      expect(shown.sizes).toEqual([{ label: "M", stock: 3 }, { label: "L", stock: 0 }]);
      expect(shown.colours).toEqual([{ name: "Sea Blue", hex: "#5b7fa6", handle: draft.handle }]);

      // A second colour of the same style: both pages show both swatches.
      const sand = await createProduct(deps, productBody({ title: "Contract Linen Shirt — Sand", sku: "AH-SHI-900-SND", colour: { name: "Sand", hex: "#c8b79a" }, colourFamily: "beige", styleId: live.styleId }));
      expect((await own.reader.getProduct(draft.handle))!.colours.map((c) => c.name).sort()).toEqual(["Sand", "Sea Blue"]);
      expect((await own.reader.getProduct(sand.handle))!.colours).toHaveLength(2);

      // Two editors save the same version at once: exactly one wins, the other is told to reload.
      const edits = await Promise.allSettled([
        updateProduct(deps, live.id, { ...productBody({ price: 119_900 }), version: 2 }),
        updateProduct(deps, live.id, { ...productBody({ price: 109_900 }), version: 2 }),
      ]);
      expect(edits.filter((e) => e.status === "fulfilled")).toHaveLength(1);
      expect((edits.find((e) => e.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ code: "version_conflict", status: 409 });

      await expect(createProduct(deps, productBody({ sku: "AH-SHI-901-NEW" }))).rejects.toMatchObject({ code: "conflict" }); // same handle
      await expect(createProduct(deps, productBody({ title: "Another Shirt" }))).rejects.toMatchObject({ code: "conflict" }); // same SKU
      await expect(createProduct(deps, productBody({ title: "Joiner", sku: "AH-JOIN-1", styleId: "style_made_up" }))).rejects.toThrow(/style/);
      await expect(updateProduct(deps, "prd_missing", { ...productBody(), version: 1 })).rejects.toMatchObject({ code: "not_found" });

      // Archive: off the storefront, still in the admin list (orders point at it).
      const cur = (await s.catalog.getRecord(live.id))!;
      await updateProduct(deps, live.id, { ...productBody({ status: "archived" }), version: cur.version });
      expect(await own.reader.getProduct(draft.handle)).toBeNull();
      expect((await s.catalog.listRecords()).some((r) => r.id === live.id && r.status === "archived")).toBe(true);
      expect((await own.reader.getProduct(sand.handle))!.colours).toHaveLength(1);
    });

    it("admin input is allow-listed on the server", async () => {
      const bad: [Record<string, unknown>, RegExp][] = [
        [{ price: 300_000 }, /higher than the MRP/],
        [{ price: 1.5 }, /whole number/],
        [{ price: -100 }, /whole number/],
        [{ category: "drinks" }, /category/],
        [{ subcategory: "baggy" }, /sub-category/],
        [{ colour: { name: "X", hex: "red" } }, /hex/],
        [{ sizes: [{ label: "M", stock: 1 }, { label: "M", stock: 2 }] }, /twice/],
        [{ sizes: [{ label: "HUGE", stock: 1 }] }, /size/],
        [{ attributes: { fit: "<script>" } }, /fit/],
        [{ handle: "../../etc" }, /handle/],
        [{ sku: "x" }, /SKU/],
        [{ status: "deleted" }, /status/],
        [{ isAdmin: true }, /Unknown field/],
        [{ art: "rocket" }, /drawing/],
        [{ tags: ["<b>"] }, /Tags/],
      ];
      for (const [over, msg] of bad) await expect(createProduct(deps, productBody({ title: "Validation Probe", sku: "AH-VAL-1", ...over })), JSON.stringify(over)).rejects.toThrow(msg);
      expect((await s.catalog.listRecords()).some((r) => r.sku === "AH-VAL-1")).toBe(false);
    });

    it("category documents: replaceDocs is compare-and-set on the revision (one of two racing saves wins)", async () => {
      const docs = (await s.catalog.getDocs())!;
      const base = docs.revision ?? 0;
      const next = { ...docs, revision: base + 1 };
      const race = await Promise.all([s.catalog.replaceDocs(next, base), s.catalog.replaceDocs({ ...next, featured: [] }, base)]);
      expect(race.filter(Boolean)).toHaveLength(1);
      expect((await s.catalog.getDocs())!.revision).toBe(base + 1);
      expect(await s.catalog.replaceDocs(next, base)).toBe(false); // stale
      expect(await s.catalog.replaceDocs({ ...docs, revision: base + 2 }, base + 1)).toBe(true);
      expect((await s.catalog.getDocs())!.tree).toEqual(docs.tree);
    });
  });
}

// ── End to end: COMMERCE_PROVIDER=own — admin creates a product, shoppers find it, buy it, stock moves ─────
import { GET as catalogGET, POST as catalogPOST } from "@/app/api/admin/catalog/route";
import { GET as productGET, PATCH as productPATCH } from "@/app/api/admin/catalog/[id]/route";
import { POST as loginPOST } from "@/app/api/admin/login/route";
import { POST as setupPOST } from "@/app/api/admin/setup/route";
import { POST as totpEnrol } from "@/app/api/admin/totp/enrol/route";
import { POST as totpVerify } from "@/app/api/admin/totp/verify/route";
import { POST as linePOST } from "@/app/api/cart/lines/route";
import { POST as addressPOST } from "@/app/api/checkout/addresses/route";
import { POST as placePOST } from "@/app/api/checkout/place/route";
import { POST as quotePOST } from "@/app/api/checkout/quote/route";
import { GET as byIdsGET } from "@/app/api/products/by-ids/route";
import { POST as otpSend } from "@/app/api/otp/send/route";
import { POST as otpVerify } from "@/app/api/otp/verify/route";
import { totpAt } from "@/lib/admin/crypto";
import { resolveAudit } from "@/lib/admin/audit";
import { resolveStaffStore } from "@/lib/admin/staff";
import { commerce } from "@/lib/commerce";
import { rateLimiter } from "@/lib/http/rate-limit";

for (const target of testTargets().filter((t) => t.cfg)) {
  describe(`own-backend store end to end · ${target.name}`, () => {
    const ORIGIN = "http://localhost:3000";
    let n = 0;
    const req = (path: string, method: string, body?: unknown, cookie?: string, headers: Record<string, string> = {}) =>
      new Request(`${ORIGIN}${path}`, {
        method,
        headers: { "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": `198.51.100.${50 + (n++ % 100)}`, ...(cookie ? { cookie } : {}), ...headers },
        body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
      });
    const cookieOf = (res: Response, name: string) => res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`))?.split(";")[0];
    const p = <T extends object>(v: T) => ({ params: Promise.resolve(v) });

    async function ownerCookie() {
      const email = "owner-db@example.test";
      const password = "correct horse battery staple";
      if ((await resolveStaffStore().count()) === 0) expect((await setupPOST(req("/api/admin/setup", "POST", { email, name: "Owner", password }))).status).toBe(201);
      const { ticket } = await (await loginPOST(req("/api/admin/login", "POST", { email, password }))).json();
      const { secret } = await (await totpEnrol(req("/api/admin/totp/enrol", "POST", { ticket }))).json();
      const res = await totpVerify(req("/api/admin/totp/verify", "POST", { ticket, code: totpAt(secret, Math.floor(Date.now() / 30_000)) }));
      expect(res.status).toBe(200);
      return cookieOf(res, "ah_admin")!;
    }

    beforeAll(async () => {
      const s = await target.setup();
      await seedDemoCatalog(s, () => {});
      vi.stubEnv("DATABASE_DRIVER", target.cfg!.driver);
      vi.stubEnv("DATABASE_URL", target.cfg!.url);
      vi.stubEnv("COMMERCE_PROVIDER", "own");
      vi.stubEnv("ACCOUNTS_ENABLED", "true");
      vi.stubEnv("CHECKOUT_ENABLED", "true");
      vi.stubEnv("COD_ENABLED", "true");
      rateLimiter.reset();
    }, 120_000);
    afterAll(async () => {
      vi.unstubAllEnvs();
      await target.teardown();
    });

    it("admin creates + publishes a product → storefront shows it → COD order takes the stock", async () => {
      expect(commerce.name).toBe("own");
      const admin = await ownerCookie();
      // No admin cookie → refused; the list is editable on the own backend.
      expect((await catalogPOST(req("/api/admin/catalog", "POST", productBody()))).status).toBe(401);
      const list = await (await catalogGET(req("/api/admin/catalog", "GET", undefined, admin))).json();
      expect(list.editable).toBe(true);
      expect(list.total).toBe(DEMO_SNAPSHOT.products.length);
      expect(list.options.tree.length).toBeGreaterThan(5);

      const created = await catalogPOST(req("/api/admin/catalog", "POST", productBody({ status: "draft", sku: "AH-E2E-001", title: "E2E Overshirt — Rust" }), admin));
      expect(created.status).toBe(201);
      const { product } = await created.json();
      const shopper = async () => (await (await byIdsGET(req(`/api/products/by-ids?ids=${product.id}`, "GET"))).json()).products;
      expect(await shopper()).toEqual([]); // draft: invisible

      const loaded = (await (await productGET(req(`/api/admin/catalog/${product.id}`, "GET", undefined, admin), p({ id: product.id }))).json()).product;
      const publish = await productPATCH(req(`/api/admin/catalog/${product.id}`, "PATCH", { ...productBody({ status: "active", sku: "AH-E2E-001", title: "E2E Overshirt — Rust" }), version: loaded.version }, admin), p({ id: product.id }));
      expect(publish.status).toBe(200);
      const stale = await productPATCH(req(`/api/admin/catalog/${product.id}`, "PATCH", { ...productBody({ sku: "AH-E2E-001", title: "E2E Overshirt — Rust" }), version: loaded.version }, admin), p({ id: product.id }));
      expect(stale.status).toBe(409);
      const visible = await shopper();
      expect(visible).toHaveLength(1);
      expect(visible[0]).toMatchObject({ price: 149_900, sizes: [{ label: "M", stock: 3 }, { label: "L", stock: 0 }] });
      const actions = (await resolveAudit().list({ limit: 50 })).map((a) => a.action);
      expect(actions).toEqual(expect.arrayContaining(["catalog.create", "catalog.update"]));

      // A shopper buys 2 of the 3 units; the sold-out size can't be added.
      const sent = await (await otpSend(req("/api/otp/send", "POST", { phone: "9811122266" }))).json();
      const session = cookieOf(await otpVerify(req("/api/otp/verify", "POST", { challengeId: sent.challengeId, code: sent.demoCode })), "ah_session")!;
      expect((await linePOST(req("/api/cart/lines", "POST", { productId: product.id, size: "L", quantity: 1 }))).status).toBe(409);
      const bag = await linePOST(req("/api/cart/lines", "POST", { productId: product.id, size: "M", quantity: 2 }));
      const cookie = `${session}; ${cookieOf(bag, "ah_cart")}`;
      const address = (await (await addressPOST(req("/api/checkout/addresses", "POST", { name: "Db Buyer", phone: "9876543210", pincode: "411045", line1: "Flat 12, Shanti Apartments, Baner Road", line2: "Baner", landmark: "Near park", city: "Pune", state: "Maharashtra", type: "home" }, cookie))).json()).address;
      const q = await (await quotePOST(req("/api/checkout/quote", "POST", { addressId: address.id, payment: "cod" }, cookie))).json();
      expect(q.pricing.goodsTotal ?? q.pricing.subtotal ?? 0).toBeGreaterThan(0);
      const placed = await placePOST(req("/api/checkout/place", "POST", { addressId: address.id, payment: "cod", expectedTotal: q.payable }, cookie, { "idempotency-key": crypto.randomUUID() }));
      expect([200, 201]).toContain(placed.status);
      expect(await commerce.inventory.available(product.id, "M")).toBe(1);
    }, 120_000);
  });
}
