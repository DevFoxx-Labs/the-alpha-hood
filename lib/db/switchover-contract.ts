import { deflateSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createProduct } from "@/lib/catalog/admin";
import { applyImport, parseCategories, planImport } from "@/lib/catalog/import";
import { imageSize, MediaError, prepareProductPhoto } from "@/lib/catalog/media";
import { DEMO_SNAPSHOT } from "@/lib/commerce/mock";
import { blockers, configChecks, dataChecks, urlUsesTls } from "@/lib/ops/readiness";
import { productBody } from "./catalog-contract";
import { getMongo } from "./mongo";
import { getSqlDb } from "./sql";
import { type StoresUnderTest, testTargets } from "./testing";

/**
 * Phase 6 (switch-over) contract: retention clean-up, product photos, real-catalogue import and the go-live
 * readiness checks. Registered from contract.test.ts.
 */

/** A real, decodable PNG of w × h (grey), with a tEXt chunk that must be stripped. */
export function pngOf(w: number, h: number, text = "GPS:12.97,77.59"): Uint8Array {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // greyscale
  const raw = Buffer.alloc((w + 1) * h, 0x80);
  for (let y = 0; y < h; y++) raw[y * (w + 1)] = 0;
  return new Uint8Array(
    Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("tEXt", Buffer.from(text)), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]),
  );
}

describe("product photo intake (pure)", () => {
  it("accepts a real PNG, strips text chunks, reads its size; refuses tiny, huge, fake and oversized files", () => {
    const item = prepareProductPhoto(pngOf(800, 1000), "stf_x");
    expect(item).toMatchObject({ type: "image/png", width: 800, height: 1000, createdBy: "stf_x" });
    expect(item.id).toMatch(/^med_[a-f0-9]{32}$/);
    expect(Buffer.from(item.bytes).toString("latin1")).not.toContain("GPS");
    const err = (f: () => unknown) => {
      try {
        f();
      } catch (e) {
        return e instanceof MediaError ? e.code : "other";
      }
      return "none";
    };
    expect(err(() => prepareProductPhoto(pngOf(100, 100), "s"))).toBe("bad_dimensions");
    // Header claims 60000 px (decompression bomb) — refused from the header alone.
    const bomb = pngOf(800, 800);
    new DataView(bomb.buffer).setUint32(16, 60_000);
    expect(err(() => prepareProductPhoto(bomb, "s"))).toBe("bad_dimensions");
    expect(err(() => prepareProductPhoto(new TextEncoder().encode("<svg onload=alert(1)>"), "s"))).toBe("bad_type");
    expect(err(() => prepareProductPhoto(new Uint8Array(9 * 1024 * 1024), "s"))).toBe("bad_size");
    // JPEG size from the SOF0 header.
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x03, 0x20, 0x02, 0x58, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9]);
    expect(imageSize(jpeg, "image/jpeg")).toEqual({ width: 600, height: 800 });
  });
});

describe("go-live readiness checks (pure)", () => {
  const good = {
    NODE_ENV: "production",
    DATABASE_DRIVER: "postgres",
    DATABASE_URL: "postgres://app:pw@db.example.com:5432/alpha_hood?sslmode=require",
    COMMERCE_PROVIDER: "own",
    OTP_PEPPER: "p".repeat(40),
    SECRET_BOX_KEY: Buffer.alloc(32, 1).toString("base64"),
    CRON_SECRET: "c".repeat(40),
    SITE_URL: "https://www.thealphahood.in",
    LEGAL_ENTITY_NAME: "Alpha Hood Pvt Ltd",
    LEGAL_REGISTERED_ADDRESS: "Pune",
    GRIEVANCE_OFFICER_NAME: "A Person",
    GRIEVANCE_OFFICER_EMAIL: "grievance@thealphahood.in",
    SUPPORT_EMAIL: "help@thealphahood.in",
  };
  it("a complete production environment has no config blockers", () => {
    expect(blockers(configChecks(good))).toEqual([]);
  });
  it("each missing piece is a blocker", () => {
    const ids = (env: Record<string, string | undefined>) => blockers(configChecks(env)).map((c) => c.id);
    expect(ids({ ...good, DATABASE_URL: "postgres://app:pw@db.example.com:5432/alpha_hood" })).toContain("database_tls");
    expect(ids({ ...good, COMMERCE_PROVIDER: "mock" })).toContain("commerce_own");
    expect(ids({ ...good, ALLOW_MOCK_DATA: "true" })).toContain("no_mock_data");
    expect(ids({ ...good, ALLOW_MOCK_PAYMENTS: "true" })).toContain("no_mock_payments");
    expect(ids({ ...good, SECRET_BOX_KEY: "short" })).toContain("secret_box");
    expect(ids({ ...good, OTP_PEPPER: "x" })).toContain("otp_pepper");
    expect(ids({ ...good, SITE_URL: "http://localhost:3000" })).toContain("site_url");
    expect(ids({ ...good, GRIEVANCE_OFFICER_NAME: "[TO BE PROVIDED]" })).toContain("legal_grievance_officer_name");
    expect(ids({ ...good, DATABASE_DRIVER: undefined, DATABASE_URL: undefined })).toContain("database");
  });
  it("TLS detection per engine", () => {
    expect(urlUsesTls({ driver: "mongodb", url: "mongodb+srv://u:p@c.mongodb.net/x" })).toBe(true);
    expect(urlUsesTls({ driver: "mongodb", url: "mongodb://u:p@db.example.com/x" })).toBe(false);
    expect(urlUsesTls({ driver: "mysql", url: "mysql://u:p@db.example.com/x?ssl={\"rejectUnauthorized\":true}" })).toBe(true);
    expect(urlUsesTls({ driver: "mysql", url: "mysql://u:p@127.0.0.1/x_dev" })).toBe(true);
  });
  it("data checks: demo data, pending migrations and no MFA owner block the launch", () => {
    const ok = { pendingMigrations: [], demoProducts: 0, demoReviews: 0, activeProducts: 40, ownersWithMfa: 1, setupTokenStillSet: false };
    expect(blockers(dataChecks(ok))).toEqual([]);
    expect(blockers(dataChecks({ ...ok, demoProducts: 68 })).map((c) => c.id)).toEqual(["demo_products"]);
    expect(blockers(dataChecks({ ...ok, demoReviews: 1 })).map((c) => c.id)).toEqual(["demo_reviews"]);
    expect(blockers(dataChecks({ ...ok, pendingMigrations: ["x"] })).map((c) => c.id)).toEqual(["migrations"]);
    expect(blockers(dataChecks({ ...ok, ownersWithMfa: 0 })).map((c) => c.id)).toEqual(["owner_mfa"]);
  });
});

for (const target of testTargets()) {
  describe(`switch-over contract · ${target.name}`, () => {
    let s: StoresUnderTest;
    const deps = () => ({ store: s.catalog, media: s.media, invalidate: () => {} });
    beforeAll(async () => {
      s = await target.setup();
      await s.catalog.putDocs({ tree: DEMO_SNAPSHOT.tree, featured: DEMO_SNAPSHOT.featured, collections: DEMO_SNAPSHOT.collections });
    }, 60_000);
    afterAll(async () => {
      await target.teardown();
    });

    it("media: stored once, read back byte-identical; products may reference only uploaded photos", async () => {
      const item = prepareProductPhoto(pngOf(700, 900), "stf_media");
      await s.media.save(item);
      const back = (await s.media.get(item.id))!;
      expect(back).toMatchObject({ type: "image/png", width: 700, height: 900 });
      expect(Buffer.from(back.bytes).equals(Buffer.from(item.bytes))).toBe(true);
      expect(await s.media.get("../etc")).toBeNull();
      expect([...(await s.media.existing([item.id, "med_" + "0".repeat(32), "nope"]))]).toEqual([item.id]);

      const withPhoto = await createProduct(deps(), productBody({ sku: "AH-PH-1", title: "Photo Tee — Black", photos: [{ id: item.id, alt: "Photo Tee in black, front" }] }));
      expect(withPhoto.images).toEqual([{ url: `/api/media/${item.id}`, alt: "Photo Tee in black, front", art: "shirt", colour: "#5b7fa6", view: "front" }]);
      await expect(createProduct(deps(), productBody({ sku: "AH-PH-2", title: "Ghost Tee", photos: [{ id: "med_" + "f".repeat(32), alt: "made up" }] }))).rejects.toThrow(/photo wasn't found/);
      await expect(createProduct(deps(), productBody({ sku: "AH-PH-3", title: "Bad Tee", photos: [{ id: "https://evil.example/x.jpg", alt: "remote" }] }))).rejects.toThrow(/Unknown photo/);
    });

    it("catalogue import: dry run writes nothing; apply creates then updates by SKU; bad rows block the whole file", async () => {
      const file = {
        products: [
          productBody({ sku: "AH-IMP-1", title: "Import Shirt — Rust" }),
          productBody({ sku: "AH-IMP-2", title: "Import Shirt — Sand", price: 99_900 }),
        ],
      };
      const plan = await planImport(deps(), file);
      expect(plan).toMatchObject({ create: ["AH-IMP-1", "AH-IMP-2"], update: [], errors: [] });
      expect((await s.catalog.listRecords()).some((r) => r.sku === "AH-IMP-1")).toBe(false);
      expect((await applyImport(deps(), file)).errors).toEqual([]);
      const again = await applyImport(deps(), { products: [productBody({ sku: "AH-IMP-1", title: "Import Shirt — Rust", price: 109_900 })] });
      expect(again).toMatchObject({ create: [], update: ["AH-IMP-1"], errors: [] });
      expect((await s.catalog.listRecords()).find((r) => r.sku === "AH-IMP-1")).toMatchObject({ price: 109_900, version: 2 });

      const bad = await applyImport(deps(), { products: [productBody({ sku: "AH-IMP-3", title: "Fine Shirt" }), productBody({ sku: "AH-IMP-4", title: "Bad Shirt", price: 900_000 }), productBody({ sku: "AH-IMP-3", title: "Dup Shirt" })] });
      expect(bad.errors.map((e) => e.sku)).toEqual(["AH-IMP-4", "AH-IMP-3"]);
      expect((await s.catalog.listRecords()).some((r) => r.sku === "AH-IMP-3")).toBe(false); // nothing written
    });

    it("category import is validated (handles, duplicates, featured must exist, rules)", async () => {
      expect(() => parseCategories({ tree: [{ handle: "Shirts!", title: "Shirts" }] })).toThrow(/handle/);
      expect(() => parseCategories({ tree: [{ handle: "a", title: "Aa" }, { handle: "a", title: "Ab" }] })).toThrow(/duplicate/);
      expect(() => parseCategories({ tree: [{ handle: "a", title: "Aa" }], featured: [{ handle: "b", title: "Bb" }] })).toThrow(/isn't in the tree/);
      expect(() => parseCategories({ tree: [{ handle: "a", title: "Aa" }], extra: 1 })).toThrow(/unknown field/);
      const docs = parseCategories({ tree: [{ handle: "shirts", title: "Shirts", subcategories: [{ handle: "linen", title: "Linen" }] }], featured: [{ handle: "shirts", title: "Shirts", href: "javascript:alert(1)" }], collections: [{ handle: "sale", title: "Sale", rule: { minPercentOff: 30 } }] });
      expect(docs.featured[0]).not.toHaveProperty("href"); // only /men/... links survive
      expect(docs.tree[0].image.colour).toMatch(/^#[0-9a-f]{6}$/i);
      const r = await planImport(deps(), { categories: docs, products: [productBody({ sku: "AH-CAT-1", title: "Cat Shirt", category: "shirts", subcategory: "checks" })] });
      expect(r.categories).toBe("replace");
      expect(r.errors[0].message).toMatch(/sub-category/); // validated against the NEW tree
    });

    it("retention: expired rows are purged, live ones kept, money/consent records untouched", async () => {
      if (!target.cfg) {
        expect(await s.maintenance.purgeExpired()).toEqual({});
        return;
      }
      const now = new Date("2026-12-01T00:00:00Z");
      const old = new Date(now.getTime() - 200 * 86_400_000);
      const soon = new Date(now.getTime() + 3_600_000);
      // Seed one expired + one live row per kind, straight into the database.
      if (target.cfg.driver === "mongodb") {
        const db = (await getMongo(target.cfg)).db;
        await db.collection("sessions").insertMany([{ _id: "s_old" as never, customer_id: "c", created_at: old, expires_at: old }, { _id: "s_live" as never, customer_id: "c", created_at: old, expires_at: soon }]);
        await db.collection("carts").insertMany([{ _id: "cart_old" as never, doc: {}, version: 1, updated_at: old }, { _id: "cart_live" as never, doc: {}, version: 1, updated_at: now }]);
        await db.collection("return_photos").insertMany([{ _id: "img_old" as never, owner_id: "c", created_at: old, attached_to: null }, { _id: "img_kept" as never, owner_id: "c", created_at: old, attached_to: "RT-1" }]);
        await db.collection("rate_limits").insertMany([{ _id: "r_old" as never, count: 3, resetAt: old.getTime() }, { _id: "r_live" as never, count: 3, resetAt: soon.getTime() }]);
      } else {
        const db = getSqlDb(target.cfg);
        await db.insertInto("sessions").values([{ token_hash: "a".repeat(64), customer_id: "c", created_at: old, expires_at: old }, { token_hash: "b".repeat(64), customer_id: "c", created_at: old, expires_at: soon }]).execute();
        await db.insertInto("carts").values([{ id: "cart_old", doc: "{}", version: 1, updated_at: old }, { id: "cart_live", doc: "{}", version: 1, updated_at: now }]).execute();
        await db.insertInto("return_photos").values([{ id: "img_old", owner_id: "c", type: "image/png", bytes: Buffer.from([1]), created_at: old, attached_to: null }, { id: "img_kept", owner_id: "c", type: "image/png", bytes: Buffer.from([1]), created_at: old, attached_to: "RT-1" }]).execute();
        await db.insertInto("rate_limits").values([{ key_hash: "c".repeat(64), count: 3, reset_at: old.getTime() }, { key_hash: "d".repeat(64), count: 3, reset_at: soon.getTime() }]).execute();
      }
      await s.ledger.append({ user_id: "c", visitor_id: null, subscriber_id: null, purpose: "terms_privacy", status: "granted", method: "checkbox", source: "web", notice_version: "v", ip_address: "1.1.1.1", user_agent: "t" } as never, old).catch(() => undefined);
      const before = (await s.ledger.listByUser("c")).length;
      const r = await s.maintenance.purgeExpired(now);
      expect(r).toMatchObject({ sessions: 1, carts: 1, return_photos: 1, rate_limits: 1 });
      expect(await s.maintenance.purgeExpired(now)).toMatchObject({ sessions: 0, carts: 0, return_photos: 0, rate_limits: 0 }); // idempotent
      expect((await s.ledger.listByUser("c")).length).toBe(before); // consent proof kept
    });
  });
}

// ── End to end: staff uploads a photo, attaches it, the store serves it publicly with safe headers ──────
import { vi } from "vitest";
import { POST as mediaPOST } from "@/app/api/admin/media/route";
import { POST as catalogPOST } from "@/app/api/admin/catalog/route";
import { POST as loginPOST } from "@/app/api/admin/login/route";
import { POST as setupPOST } from "@/app/api/admin/setup/route";
import { POST as totpEnrol } from "@/app/api/admin/totp/enrol/route";
import { POST as totpVerify } from "@/app/api/admin/totp/verify/route";
import { GET as cronGET } from "@/app/api/cron/sweep/route";
import { GET as mediaGET } from "@/app/api/media/[id]/route";
import { GET as byIdsGET } from "@/app/api/products/by-ids/route";
import { totpAt } from "@/lib/admin/crypto";
import { resolveStaffStore } from "@/lib/admin/staff";
import { seedDemoCatalog } from "@/lib/catalog/seed";
import { rateLimiter } from "@/lib/http/rate-limit";

for (const target of testTargets().filter((t) => t.cfg)) {
  describe(`product photos + cron end to end · ${target.name}`, () => {
    const ORIGIN = "http://localhost:3000";
    let n = 0;
    const headersFor = (cookie?: string, extra: Record<string, string> = {}) => ({ origin: ORIGIN, "x-forwarded-for": `198.51.100.${150 + (n++ % 90)}`, ...(cookie ? { cookie } : {}), ...extra });
    const req = (path: string, method: string, body?: unknown, cookie?: string) =>
      new Request(`${ORIGIN}${path}`, { method, headers: { "content-type": "application/json", ...headersFor(cookie) }, body: method === "GET" ? undefined : JSON.stringify(body ?? {}) });
    const p = <T extends object>(v: T) => ({ params: Promise.resolve(v) });

    beforeAll(async () => {
      const s = await target.setup();
      await seedDemoCatalog(s, () => {});
      vi.stubEnv("DATABASE_DRIVER", target.cfg!.driver);
      vi.stubEnv("DATABASE_URL", target.cfg!.url);
      vi.stubEnv("COMMERCE_PROVIDER", "own");
      vi.stubEnv("CRON_SECRET", "s".repeat(40));
      rateLimiter.reset();
    }, 120_000);
    afterAll(async () => {
      vi.unstubAllEnvs();
      await target.teardown();
    });

    it("upload → attach → public, immutable, sniff-proof photo; cron purges and reports counts only", async () => {
      const email = "owner-media@example.test";
      const password = "correct horse battery staple";
      if ((await resolveStaffStore().count()) === 0) expect((await setupPOST(req("/api/admin/setup", "POST", { email, name: "Owner", password }))).status).toBe(201);
      const { ticket } = await (await loginPOST(req("/api/admin/login", "POST", { email, password }))).json();
      const { secret } = await (await totpEnrol(req("/api/admin/totp/enrol", "POST", { ticket }))).json();
      const signed = await totpVerify(req("/api/admin/totp/verify", "POST", { ticket, code: totpAt(secret, Math.floor(Date.now() / 30_000)) }));
      const admin = signed.headers.getSetCookie().find((c) => c.startsWith("ah_admin="))!.split(";")[0];

      const upload = (bytes: Uint8Array, type: string, cookie?: string) =>
        mediaPOST(new Request(`${ORIGIN}/api/admin/media`, { method: "POST", headers: { "content-type": type, ...headersFor(cookie) }, body: new Blob([bytes.slice()]) }));
      expect((await upload(pngOf(800, 800), "image/png")).status).toBe(401); // staff only
      expect((await upload(new TextEncoder().encode("<svg onload=alert(1)>"), "image/png", admin)).status).toBe(422);
      expect((await upload(pngOf(200, 200), "image/png", admin)).status).toBe(422);
      const ok = await upload(pngOf(800, 1000), "image/png", admin);
      expect(ok.status).toBe(201);
      const media = await ok.json();
      expect(media).toMatchObject({ width: 800, height: 1000, url: `/api/media/${media.id}` });

      const created = await catalogPOST(req("/api/admin/catalog", "POST", productBody({ sku: "AH-E2E-PH", title: "E2E Photo Shirt — Rust", photos: [{ id: media.id, alt: "E2E Photo Shirt, front" }] }), admin));
      expect(created.status).toBe(201);
      const { product } = await created.json();
      const shopper = (await (await byIdsGET(req(`/api/products/by-ids?ids=${product.id}`, "GET"))).json()).products[0];
      expect(shopper.images[0]).toMatchObject({ url: `/api/media/${media.id}`, alt: "E2E Photo Shirt, front" });

      const served = await mediaGET(req(`/api/media/${media.id}`, "GET"), p({ id: media.id }));
      expect(served.status).toBe(200);
      expect(served.headers.get("content-type")).toBe("image/png");
      expect(served.headers.get("cache-control")).toContain("immutable");
      expect(served.headers.get("x-content-type-options")).toBe("nosniff");
      expect(served.headers.get("content-security-policy")).toContain("sandbox");
      expect(Buffer.from(await served.arrayBuffer()).toString("latin1")).not.toContain("GPS");
      expect((await mediaGET(req("/api/media/../../etc", "GET"), p({ id: "../../etc" }))).status).toBe(404);

      expect((await cronGET(req("/api/cron/sweep", "GET"))).status).toBe(401);
      const cron = await cronGET(new Request(`${ORIGIN}/api/cron/sweep`, { headers: { authorization: `Bearer ${"s".repeat(40)}` } }));
      expect(cron.status).toBe(200);
      const body = await cron.json();
      expect(Object.values(body.purged).every((v) => typeof v === "number")).toBe(true);
      expect(JSON.stringify(body)).not.toMatch(/cus_|@|\+91/);
    }, 120_000);
  });
}
