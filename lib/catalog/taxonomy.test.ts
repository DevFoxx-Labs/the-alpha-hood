import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_SNAPSHOT } from "@/lib/commerce/mock";
import { MOCK_NOW } from "@/lib/commerce/mock/data";
import { createMemoryReviewStore } from "@/lib/reviews/store";
import { type CatalogAdminDeps, createProduct } from "./admin";
import { type CollectionRule, matchesRule } from "./collection-rules";
import { createMemoryMediaStore } from "./media";
import { createOwnCatalog } from "./own";
import { seedDemoCatalog } from "./seed";
import { createMemoryCatalogStore } from "./store";
import { builderFromRule, previewCollection, ruleFromBuilder, saveCategories, saveCollections, taxonomyView } from "./taxonomy";

const PHOTO = `med_${"a".repeat(32)}`;
let deps: CatalogAdminDeps & { invalidate: ReturnType<typeof vi.fn<() => void>> };

beforeEach(async () => {
  const store = createMemoryCatalogStore();
  await seedDemoCatalog({ catalog: store, reviewStore: createMemoryReviewStore() }, () => {}, new Date(MOCK_NOW));
  const media = createMemoryMediaStore();
  await media.save({ id: PHOTO, type: "image/png", width: 800, height: 800, bytes: new Uint8Array(), createdAt: new Date(MOCK_NOW).toISOString(), createdBy: "stf_test" });
  deps = { store, media, invalidate: vi.fn<() => void>() };
});

const img = (i: { art: string; colour: string; alt: string; url?: string }) => ({ art: i.art, colour: i.colour, alt: i.alt, ...(i.url ? { photo: i.url.split("/").pop() } : {}) });

/** The category screen's PUT body for the current state, with optional edits. */
async function categoriesBody(edit: (b: { tree: Record<string, unknown>[]; featured: Record<string, unknown>[] }) => void = () => {}) {
  const v = await taxonomyView(deps);
  const body = {
    revision: v.revision,
    tree: v.tree.map((c) => ({ handle: c.handle, title: c.title, image: img(c.image), subcategories: c.subcategories.map((s) => ({ handle: s.handle, title: s.title, image: img(s.image) })) })) as Record<string, unknown>[],
    featured: v.featured.map((f) => ({ handle: f.handle, title: f.title, image: img(f.image), ...(f.href?.split("/")[3] ? { subcategory: f.href.split("/")[3] } : {}) })) as Record<string, unknown>[],
  };
  edit(body);
  return body;
}

async function collectionsBody(edit: (list: Record<string, unknown>[]) => Record<string, unknown>[] = (l) => l) {
  const v = await taxonomyView(deps);
  return { revision: v.revision, collections: edit(v.collections.map((c) => ({ handle: c.handle, title: c.title, description: c.description, ...(c.builder ? { builder: c.builder } : { keepRule: true }) }))) };
}

const capes = { handle: "capes", title: "Capes", image: { art: "jacket", colour: "#222222", alt: "Capes" }, subcategories: [{ handle: "long-capes", title: "Long capes", image: { art: "jacket", colour: "#333333", alt: "Long capes", photo: PHOTO } }] };

describe("category tree + homepage rail", () => {
  it("shows usage per category and round-trips every demo collection rule through the builder", async () => {
    const v = await taxonomyView(deps);
    expect(v.revision).toBe(0);
    expect(v.usage.jeans).toBe(DEMO_SNAPSHOT.products.filter((p) => p.category === "jeans").length);
    for (const c of DEMO_SNAPSHOT.collections) {
      const b = builderFromRule(c.rule);
      expect(b, c.handle).not.toBeNull();
      expect(ruleFromBuilder(b!), c.handle).toEqual(c.rule);
    }
  });

  it("adds, reorders and renames; the store shows the new tree and products can use the new category", async () => {
    const body = await categoriesBody((b) => {
      b.tree.push(capes);
      b.tree.reverse();
      b.tree.find((c) => c.handle === "jeans")!.title = "Denim";
    });
    expect((await saveCategories(deps, body)).revision).toBe(1);
    expect(deps.invalidate).toHaveBeenCalled();
    const docs = (await deps.store.getDocs())!;
    expect(docs.revision).toBe(1);
    expect(docs.tree[0].handle).toBe("capes");
    expect(docs.tree[0].subcategories[0].image.url).toBe(`/api/media/${PHOTO}`);
    expect(docs.tree.find((c) => c.handle === "jeans")!.title).toBe("Denim");
    expect(docs.collections).toEqual(DEMO_SNAPSHOT.collections); // untouched

    const own = createOwnCatalog(deps.store, createMemoryReviewStore(), { now: () => MOCK_NOW, ttlMs: 0 });
    expect((await own.reader.listCategoryTree())[0].handle).toBe("capes");
    const product = DEMO_SNAPSHOT.products[0];
    const made = await createProduct(deps, {
      title: "Wool Cape — Black",
      sku: "AH-CAPE-1",
      category: "capes",
      subcategory: "long-capes",
      price: 299_900,
      mrp: 349_900,
      colour: { name: "Black", hex: "#111111" },
      colourFamily: "black",
      sizes: [{ label: "M", stock: 2 }],
      art: "jacket",
      description: "A long wool cape for cold evenings.",
      sizeChart: "tops",
      legal: product.legal,
      status: "active",
    });
    expect(made.category).toBe("capes");
  });

  it("refuses a stale save (409) and lets exactly one of two racing saves win", async () => {
    const body = await categoriesBody();
    const race = await Promise.allSettled([saveCategories(deps, body), saveCategories(deps, body)]);
    expect(race.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((race.find((r) => r.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ code: "version_conflict", status: 409 });
    await expect(saveCategories(deps, body)).rejects.toMatchObject({ status: 409 });
  });

  it("won't remove a category or sub-category that products use", async () => {
    await expect(saveCategories(deps, await categoriesBody((b) => ((b.tree = b.tree.filter((c) => c.handle !== "jeans")), (b.featured = b.featured.filter((f) => f.handle !== "jeans")))))).rejects.toThrow(/used by \d+ product/);
    const withSub = DEMO_SNAPSHOT.products.find((p) => p.subcategory)!;
    await expect(
      saveCategories(
        deps,
        await categoriesBody((b) => {
          const c = b.tree.find((x) => x.handle === withSub.category)!;
          c.subcategories = (c.subcategories as { handle: string }[]).filter((s) => s.handle !== withSub.subcategory);
          b.featured = b.featured.filter((f) => f.subcategory !== withSub.subcategory);
        }),
      ),
    ).rejects.toThrow(/Sub-category .* used by/);
    // A renamed handle is a removal of the old one.
    await expect(saveCategories(deps, await categoriesBody((b) => ((b.tree.find((c) => c.handle === "jeans")!.handle = "denim"), (b.featured = b.featured.filter((f) => f.handle !== "jeans")))))).rejects.toThrow(/used by/);
    expect((await deps.store.getDocs())!.revision).toBeUndefined();
  });

  it("won't remove an unused category that a collection rule still points at", async () => {
    await saveCategories(deps, await categoriesBody((b) => b.tree.push(capes)));
    await saveCollections(deps, await collectionsBody((l) => [...l, { handle: "cape-season", title: "Cape season", builder: { match: "all", conditions: [{ type: "category", values: ["capes"] }] } }]));
    await expect(saveCategories(deps, await categoriesBody((b) => (b.tree = b.tree.filter((c) => c.handle !== "capes"))))).rejects.toThrow(/Collection “Cape season” uses “capes”/);
  });

  it("allow-lists every field on the server", async () => {
    const bad: [(b: { tree: Record<string, unknown>[]; featured: Record<string, unknown>[] }) => void, RegExp][] = [
      [(b) => b.tree.push({ ...capes, handle: "../admin" }), /handle/],
      [(b) => b.tree.push({ ...capes, handle: "jeans" }), /Two categories/],
      [(b) => b.tree.push({ ...capes, isHidden: true }), /Unknown field/],
      [(b) => b.tree.push({ ...capes, image: { ...capes.image, art: "rocket" } }), /drawing/],
      [(b) => b.tree.push({ ...capes, image: { ...capes.image, colour: "red" } }), /hex/],
      [(b) => b.tree.push({ ...capes, image: { ...capes.image, photo: `med_${"b".repeat(32)}` } }), /wasn't found/],
      [(b) => b.tree.push({ ...capes, image: { ...capes.image, photo: "https://evil.example/x.png" } }), /unknown photo/],
      [(b) => b.tree.push({ ...capes, image: { ...capes.image, url: "javascript:alert(1)" } }), /Unknown field/],
      [(b) => b.tree.push({ ...capes, title: "x" }), /name/],
      [(b) => b.featured.push({ handle: "nope", title: "Nope", image: capes.image }), /choose a category/],
      [(b) => b.featured.push({ handle: "jeans", title: "Jeans", image: capes.image, subcategory: "polos" }), /sub-category of/],
      [(b) => b.featured.push({ handle: "jeans", title: "Jeans", image: capes.image, href: "https://evil.example" }), /Unknown field/],
      [(b) => (b.tree = []), /1–60 categories/],
    ];
    for (const [edit, msg] of bad) await expect(saveCategories(deps, await categoriesBody(edit)), msg.source).rejects.toThrow(msg);
    await expect(saveCategories(deps, { ...(await categoriesBody()), revision: -1 })).rejects.toThrow(/revision/);
    expect((await deps.store.getDocs())!.revision).toBeUndefined(); // nothing was written
  });

  it("a rail tile for a sub-category links to its page", async () => {
    const cat = DEMO_SNAPSHOT.tree.find((c) => c.subcategories.length)!;
    await saveCategories(deps, await categoriesBody((b) => (b.featured = [{ handle: cat.handle, title: "Tile", image: capes.image, subcategory: cat.subcategories[0].handle }])));
    expect((await deps.store.getDocs())!.featured).toEqual([{ handle: cat.handle, title: "Tile", image: { art: "jacket", colour: "#222222", alt: "Capes" }, href: `/men/${cat.handle}/${cat.subcategories[0].handle}` }]);
  });
});

describe("collections", () => {
  it("stores a builder as a rule, previews it and the storefront lists the matching products", async () => {
    const builder = { match: "all", conditions: [{ type: "attribute", key: "fit", values: ["oversized"] }, { type: "category", values: ["jeans"], exclude: true }] };
    await saveCollections(deps, await collectionsBody((l) => [...l, { handle: "big-fits", title: "Big fits", description: "Room to move.", builder }]));
    const stored = (await deps.store.getDocs())!.collections.find((c) => c.handle === "big-fits")!;
    expect(stored.rule).toEqual({ all: [{ attribute: "fit", values: ["oversized"] }, { not: { category: ["jeans"] } }] });

    const expected = DEMO_SNAPSHOT.products.filter((p) => p.attributes.fit === "oversized" && p.category !== "jeans");
    const preview = await previewCollection(deps, { builder }, MOCK_NOW);
    expect(preview.count).toBe(expected.length);
    expect(preview.count).toBeGreaterThan(0);

    const own = createOwnCatalog(deps.store, createMemoryReviewStore(), { now: () => MOCK_NOW, ttlMs: 0 });
    expect((await own.reader.listCollections()).some((c) => c.handle === "big-fits")).toBe(true);
  });

  it("hand-picked products match only those products", async () => {
    const [a, b] = DEMO_SNAPSHOT.products;
    const preview = await previewCollection(deps, { builder: { match: "any", conditions: [{ type: "productIds", values: [a.id, b.id] }] } }, MOCK_NOW);
    expect(preview.count).toBe(2);
    expect(matchesRule(a, { productIds: [b.id] }, MOCK_NOW)).toBe(false);
  });

  it("keeps an imported rule the builder can't show, and refuses keepRule for a new collection", async () => {
    const docs = (await deps.store.getDocs())!;
    const deep: CollectionRule = { all: [{ any: [{ badge: "NEW" }, { maxPrice: 99_900 }] }, { category: ["jeans"] }] };
    await deps.store.putDocs({ ...docs, collections: [...docs.collections, { handle: "deep", title: "Deep", rule: deep }] });
    const v = await taxonomyView(deps);
    expect(v.collections.find((c) => c.handle === "deep")!.builder).toBeNull();
    await saveCollections(deps, { revision: v.revision, collections: v.collections.map((c) => ({ handle: c.handle, title: c.title, ...(c.builder ? { builder: c.builder } : { keepRule: true }) })) });
    expect((await deps.store.getDocs())!.collections.find((c) => c.handle === "deep")!.rule).toEqual(deep);
    await expect(saveCollections(deps, await collectionsBody((l) => [...l, { handle: "fresh", title: "Fresh", keepRule: true }]))).rejects.toThrow(/add at least one condition/);
  });

  it("won't remove a collection that combos or storefront links use", async () => {
    await expect(saveCollections(deps, await collectionsBody((l) => l.filter((c) => c.handle !== "combo-tees")))).rejects.toThrow(/Combo/);
    const v = await taxonomyView(deps);
    expect(v.collections.find((c) => c.handle === "combo-tees")!.usedBy.length).toBeGreaterThan(0);
    // An unlinked one can go.
    await saveCollections(deps, await collectionsBody((l) => [...l, { handle: "one-off", title: "One-off", builder: { match: "all", conditions: [{ type: "badge", value: "NEW" }] } }]));
    await saveCollections(deps, await collectionsBody((l) => l.filter((c) => c.handle !== "one-off")));
    expect((await deps.store.getDocs())!.collections.some((c) => c.handle === "one-off")).toBe(false);
  });

  it("allow-lists rule conditions and values", async () => {
    const withRule = (builder: unknown, extra: Record<string, unknown> = {}) => collectionsBody((l) => [...l, { handle: "probe", title: "Probe", builder, ...extra }]);
    const bad: [unknown, RegExp, Record<string, unknown>?][] = [
      [{ match: "all", conditions: [{ type: "eval", values: ["x"] }] }, /choose a condition/],
      [{ match: "some", conditions: [{ type: "badge", value: "NEW" }] }, /all conditions/],
      [{ match: "all", conditions: [] }, /1–12 conditions/],
      [{ match: "all", conditions: [{ type: "category", values: ["drinks"] }] }, /doesn't exist/],
      [{ match: "all", conditions: [{ type: "attribute", key: "__proto__", values: ["x"] }] }, /attribute/],
      [{ match: "all", conditions: [{ type: "attribute", key: "fit", values: ["<script>"] }] }, /doesn't exist/],
      [{ match: "all", conditions: [{ type: "productIds", values: ["prd_made_up"] }] }, /doesn't exist/],
      [{ match: "all", conditions: [{ type: "minPercentOff", amount: 95 }] }, /between 1 and 90/],
      [{ match: "all", conditions: [{ type: "maxPrice", amount: 1.5 }] }, /whole number/],
      [{ match: "all", conditions: [{ type: "sizeInStock", value: "HUGE" }] }, /size/],
      [{ match: "all", conditions: [{ type: "badge", value: "NEW", exclude: true }] }, /includes products/],
      [{ match: "all", conditions: [{ type: "badge", value: "NEW", where: "1=1" }] }, /Unknown field/],
      [{ match: "all", conditions: [{ type: "badge", value: "NEW" }] }, /handle/, { handle: "Bad Handle" }],
      [{ match: "all", conditions: [{ type: "badge", value: "NEW" }] }, /Two collections/, { handle: "sale" }],
    ];
    for (const [builder, msg, extra] of bad) await expect(saveCollections(deps, await withRule(builder, extra)), msg.source).rejects.toThrow(msg);
    expect((await deps.store.getDocs())!.revision).toBeUndefined();
  });
});
