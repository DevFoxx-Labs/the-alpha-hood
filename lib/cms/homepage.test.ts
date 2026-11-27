import { beforeEach, describe, expect, it, vi } from "vitest";
import { MOCK_NOW } from "@/lib/commerce/mock/data";
import type { CatalogAdminDeps } from "@/lib/catalog/admin";
import { createMemoryMediaStore } from "@/lib/catalog/media";
import { seedDemoCatalog } from "@/lib/catalog/seed";
import { createMemoryCatalogStore } from "@/lib/catalog/store";
import { parseShopAll, saveCategories, saveCollections, shopAllCategories, taxonomyView } from "@/lib/catalog/taxonomy";
import { createMemoryReviewStore } from "@/lib/reviews/store";
import { applyHomepage, BUILTIN_IMAGES, builtInContent, builtInDrop, envLandingLayout, INTERNAL_HREF_RE, landingLayout, parseAmbassador, parseCampaign, parseHeroSlides, parseHomepage, parseLimited, parsePoints, parseSeo, parseSpotlights } from "./homepage";
import { homepageView, saveHomepage } from "./homepage-admin";
import { MOCK_DROP_HOMEPAGE, MOCK_HOMEPAGE } from "./mock-home";

/**
 * Admin → Homepage (hero, campaign band, SEO block) and Categories → Shop all page. One test per abuse case:
 * script / open-redirect links, images from other hosts, unknown fields, stale saves, and saves of one screen
 * wiping another screen's content.
 */
const PHOTO = `med_${"b".repeat(32)}`;
const slide = (over: Record<string, unknown> = {}) => ({
  id: "drop",
  enabled: true,
  kicker: "Winter drop",
  headline: ["Hood", "up"],
  subline: "Heavyweight hoodies.",
  cta: { label: "Shop the drop", href: "/collections/winter-drop" },
  textTone: "white",
  desktopImage: `/api/media/${PHOTO}`,
  mobileImage: null,
  alt: "Model in a black hoodie",
  fill: "#0a0a0a",
  ...over,
});

let deps: CatalogAdminDeps & { invalidate: ReturnType<typeof vi.fn<() => void>> };
beforeEach(async () => {
  const store = createMemoryCatalogStore();
  await seedDemoCatalog({ catalog: store, reviewStore: createMemoryReviewStore() }, () => {}, new Date(MOCK_NOW));
  const media = createMemoryMediaStore();
  await media.save({ id: PHOTO, type: "image/jpeg", width: 1920, height: 840, bytes: new Uint8Array(), createdAt: new Date(MOCK_NOW).toISOString(), createdBy: "stf_test" });
  deps = { store, media, invalidate: vi.fn<() => void>() };
});

describe("homepage content validation (server side)", () => {
  it("links: same-site paths only — no javascript:, no other hosts, no protocol-relative or backslash tricks", () => {
    for (const bad of ["javascript:alert(1)", "https://evil.example", "//evil.example", "/\\evil.example", "collections/new", "/x\"><script>", "/a b", ""]) {
      expect(INTERNAL_HREF_RE.test(bad), bad).toBe(false);
      expect(() => parseHeroSlides([slide({ cta: { label: "Go now", href: bad } })]), bad).toThrow();
    }
    expect(INTERNAL_HREF_RE.test("/search?q=linen+shirt")).toBe(true);
    expect(INTERNAL_HREF_RE.test("/collections/new-in")).toBe(true);
  });

  it("images: an uploaded photo on our media store or a built-in brand image — never a URL from elsewhere", () => {
    for (const bad of ["https://evil.example/x.jpg", "/api/media/../../etc/passwd", "/api/media/med_123", "data:image/png;base64,AAAA", "/mascot/not-shipped.webp"]) {
      expect(() => parseHeroSlides([slide({ desktopImage: bad })]), bad).toThrow();
    }
    expect(parseHeroSlides([slide({ desktopImage: BUILTIN_IMAGES[0] })])[0].desktopImage).toBe(BUILTIN_IMAGES[0]);
    // An image needs its description (alt text).
    expect(() => parseHeroSlides([slide({ alt: "" })])).toThrow(/description/);
  });

  it("limits and shape: max 6 slides, 1–3 headline lines, unknown fields refused, at least one slide on", () => {
    expect(() => parseHeroSlides(Array.from({ length: 7 }, (_, i) => slide({ id: `s${i}` })))).toThrow(/at most 6/);
    expect(() => parseHeroSlides([slide({ headline: [] })])).toThrow();
    expect(() => parseHeroSlides([slide({ headline: ["a", "b", "c", "d"] })])).toThrow();
    expect(() => parseHeroSlides([slide({ headline: ["x".repeat(25)] })])).toThrow();
    expect(() => parseHeroSlides([slide({ onclick: "alert(1)" })])).toThrow();
    expect(() => parseHeroSlides([slide({ enabled: false })])).toThrow(/at least one/);
    expect(() => parseHeroSlides([slide({ id: "a" }), slide({ id: "a" })])).toThrow(/share the id/);
    expect(() => parseHeroSlides([slide({ startsAt: "2026-12-10T00:00:00Z", endsAt: "2026-12-01T00:00:00Z" })])).toThrow(/after the start/);
  });

  it("text is plain text: control characters stripped, length capped (React escapes it on output)", () => {
    const [s] = parseHeroSlides([slide({ kicker: "Drop\u0000 <b>now</b>" })]);
    expect(s.kicker).not.toContain("\u0000");
    expect(() => parseHeroSlides([slide({ subline: "x".repeat(161) })])).toThrow();
  });

  it("campaign band and SEO block validate the same way", () => {
    const base = builtInContent(MOCK_HOMEPAGE);
    expect(parseCampaign(base.campaign).headline).toEqual(base.campaign.headline);
    expect(() => parseCampaign({ ...base.campaign, image: "https://evil.example/a.png" })).toThrow();
    expect(() => parseCampaign({ ...base.campaign, cta: { label: "Go", href: "javascript:void(0)" } })).toThrow();
    expect(parseSeo(base.seo).groups.length).toBe(base.seo.groups.length);
    expect(() => parseSeo({ ...base.seo, groups: [{ title: "Top", links: [{ label: "Evil", href: "https://evil.example" }] }] })).toThrow();
    expect(() => parseSeo({ ...base.seo, groups: [1, 2, 3, 4].map((i) => ({ title: `G${i}`, links: [{ label: "Tees", href: "/men/t-shirts" }] })) })).toThrow(/at most 3/);
  });
});

describe("storefront: admin content replaces the built-in parts", () => {
  it("hero slides, a switched-off campaign band and the SEO block; other blocks untouched", () => {
    const content = {
      hero: parseHeroSlides([slide(), slide({ id: "off", enabled: false, headline: ["Hidden"] })]),
      campaign: { ...builtInContent(MOCK_HOMEPAGE).campaign, enabled: false },
      seo: parseSeo({ heading: "Shop streetwear online", groups: [{ title: "Popular", links: [{ label: "Baggy jeans", href: "/men/jeans/baggy" }] }], text: ["The Alpha Hood makes streetwear for the ones who lead, designed in India."] }),
    };
    const blocks = applyHomepage(MOCK_HOMEPAGE, content);
    const hero = blocks.find((b) => b.type === "hero");
    expect(hero?.type === "hero" && hero.slides.map((s) => s.headline.join(" "))).toEqual(["Hood up"]);
    expect(hero?.type === "hero" && hero.slides[0].image).toEqual({ desktop: `/api/media/${PHOTO}`, mobile: `/api/media/${PHOTO}`, alt: "Model in a black hoodie" });
    expect(blocks.some((b) => b.type === "campaign_band")).toBe(false);
    const seo = blocks.find((b) => b.type === "seo");
    expect(seo?.type === "seo" && seo.groups[0].links[0]).toEqual({ label: "Baggy jeans", href: "/men/jeans/baggy" });
    expect(blocks.filter((b) => !["hero", "campaign_band", "seo"].includes(b.type))).toEqual(MOCK_HOMEPAGE.filter((b) => !["hero", "campaign_band", "seo"].includes(b.type)));
    expect(applyHomepage(MOCK_HOMEPAGE, undefined)).toBe(MOCK_HOMEPAGE);
  });
});

describe("saving (catalogue documents, optimistic revision)", () => {
  it("saves, returns the next revision, refreshes the store; a stale save is refused (409)", async () => {
    const v = await homepageView(deps);
    const r = await saveHomepage(deps, { revision: v.revision, hero: [slide()] });
    expect(r.revision).toBe(v.revision + 1);
    expect(deps.invalidate).toHaveBeenCalled();
    expect((await homepageView(deps)).content.hero?.[0].headline).toEqual(["Hood", "up"]);
    await expect(saveHomepage(deps, { revision: v.revision, hero: [slide()] })).rejects.toMatchObject({ status: 409 });
  });

  it("an uploaded photo must exist in our media store", async () => {
    const v = await homepageView(deps);
    await expect(saveHomepage(deps, { revision: v.revision, hero: [slide({ desktopImage: `/api/media/med_${"c".repeat(32)}` })] })).rejects.toThrow(/wasn't found/);
  });

  it("null = back to built-in; parts left out keep what is stored", async () => {
    let v = await homepageView(deps);
    await saveHomepage(deps, { revision: v.revision, hero: [slide()], campaign: { ...v.builtIn.campaign, enabled: false } });
    v = await homepageView(deps);
    await saveHomepage(deps, { revision: v.revision, hero: null });
    const after = (await homepageView(deps)).content;
    expect(after.hero).toBeUndefined();
    expect(after.campaign?.enabled).toBe(false);
  });

  it("saving categories or collections never wipes the homepage content or the Shop all list (merge, not replace)", async () => {
    let v = await homepageView(deps);
    await saveHomepage(deps, { revision: v.revision, hero: [slide()] });
    const t = await taxonomyView(deps);
    const img = (i: { art: string; colour: string; alt: string; url?: string }) => ({ art: i.art, colour: i.colour, alt: i.alt, ...(i.url ? { photo: i.url.split("/").pop() } : {}) });
    const body = {
      revision: t.revision,
      tree: t.tree.map((c) => ({ handle: c.handle, title: c.title, image: img(c.image), subcategories: c.subcategories.map((s) => ({ handle: s.handle, title: s.title, image: img(s.image) })) })),
      featured: t.featured.map((f) => ({ handle: f.handle, title: f.title, image: img(f.image), ...(f.href?.split("/")[3] ? { subcategory: f.href.split("/")[3] } : {}) })),
      shopAll: [t.tree[1].handle, t.tree[0].handle],
    };
    await saveCategories(deps, body);
    expect((await homepageView(deps)).content.hero?.[0].id).toBe("drop");
    const t2 = await taxonomyView(deps);
    expect(t2.shopAll).toEqual([t.tree[1].handle, t.tree[0].handle]);
    await saveCollections(deps, { revision: t2.revision, collections: t2.collections.map((c) => ({ handle: c.handle, title: c.title, ...(c.description ? { description: c.description } : {}), ...(c.builder ? { builder: c.builder } : { keepRule: true }) })) });
    v = await homepageView(deps);
    expect(v.content.hero?.[0].id).toBe("drop");
    expect((await taxonomyView(deps)).shopAll).toEqual([t.tree[1].handle, t.tree[0].handle]);
  });
});

describe("brand ambassador + limited edition sections", () => {
  const base = builtInContent(MOCK_HOMEPAGE);

  it("built-in demo sections exist, in the stored shape, and validate", () => {
    expect(base.ambassador.enabled).toBe(true);
    expect(base.limited.enabled).toBe(true);
    expect(parseAmbassador(base.ambassador).ambassadorName).toBe(base.ambassador.ambassadorName);
    expect(parseLimited(base.limited).editionSize).toBe(100);
  });

  it("same rules as the rest: same-site links, own / built-in images, plain text, caps; products ≤ 4 / ≤ 3, no repeats", () => {
    expect(() => parseAmbassador({ ...base.ambassador, cta: { label: "Buy now", href: "https://evil.example" } })).toThrow();
    expect(() => parseAmbassador({ ...base.ambassador, desktopImage: "https://evil.example/a.jpg" })).toThrow();
    expect(() => parseAmbassador({ ...base.ambassador, line1: "x".repeat(17) })).toThrow();
    expect(() => parseAmbassador({ ...base.ambassador, ambassadorName: "" })).toThrow();
    expect(() => parseAmbassador({ ...base.ambassador, productIds: ["a", "b", "c", "d", "e"] })).toThrow(/up to 4/);
    expect(() => parseAmbassador({ ...base.ambassador, productIds: ["a", "a"] })).toThrow(/twice/);
    expect(() => parseAmbassador({ ...base.ambassador, productIds: ["../x"] })).toThrow();
    expect(() => parseAmbassador({ ...base.ambassador, price: 1 })).toThrow(); // never a price from here
    expect(() => parseLimited({ ...base.limited, productIds: ["a", "b", "c", "d"] })).toThrow(/up to 3/);
    for (const bad of [0, -5, 1.5, "100", 100_001]) expect(() => parseLimited({ ...base.limited, editionSize: bad }), String(bad)).toThrow();
    expect(parseLimited({ ...base.limited, editionSize: null }).editionSize).toBeNull();
  });

  it("switched off → not on the page; customised → admin text and picks replace the demo", () => {
    const off = applyHomepage(MOCK_HOMEPAGE, { ambassador: { ...base.ambassador, enabled: false }, limited: { ...base.limited, enabled: false } });
    expect(off.some((b) => b.type === "ambassador" || b.type === "limited_edition")).toBe(false);
    const on = applyHomepage(MOCK_HOMEPAGE, { ambassador: { ...base.ambassador, ambassadorName: "Real Star", productIds: ["p1"] } });
    const amb = on.find((b) => b.type === "ambassador");
    expect(amb?.type === "ambassador" && [amb.ambassadorName, amb.productIds]).toEqual(["Real Star", ["p1"]]);
  });

  it("saving: picked products must be in the catalogue; real ones save", async () => {
    const v = await homepageView(deps);
    await expect(saveHomepage(deps, { revision: v.revision, ambassador: { ...base.ambassador, productIds: ["not_a_product"] } })).rejects.toThrow(/isn't in the catalogue/);
    const real = (await deps.store.listRecords()).slice(0, 2).map((r) => r.id);
    await saveHomepage(deps, { revision: v.revision, ambassador: { ...base.ambassador, productIds: real }, limited: { ...base.limited, productIds: [real[0]] } });
    const after = await homepageView(deps);
    expect(after.content.ambassador?.productIds).toEqual(real);
    expect(Object.keys(after.productTitles).sort()).toEqual([...real].sort());
  });
});

describe("landing page layout switch (full store ↔ exclusive drop)", () => {
  const drop = builtInDrop(MOCK_DROP_HOMEPAGE);

  it("the drop layout has no discount / combo / category / tab / new-arrival blocks — only the drop's sections", () => {
    const types = MOCK_DROP_HOMEPAGE.map((b) => b.type);
    for (const gone of ["promo_band", "offer_tiles", "collection_tiles", "category_rail", "product_tabs", "product_grid"]) expect(types, gone).not.toContain(gone);
    expect(types).toEqual(["hero", "ambassador", "product_spotlight", "product_spotlight", "exclusive_points", "limited_edition", "club_band", "ugc_grid", "trust_strip", "seo"]);
  });

  it("layout must be store, drop or null (follow the environment); default store", () => {
    expect(landingLayout(undefined, {})).toBe("store");
    expect(landingLayout({ layout: "drop" }, {})).toBe("drop");
    expect(() => parseHomepage({ layout: "luxury" }, undefined)).toThrow();
    expect(parseHomepage({ layout: "drop" }, undefined).layout).toBe("drop");
    expect(parseHomepage({ layout: null }, { layout: "drop" }).layout).toBeUndefined();
  });

  it("priority: the admin's choice, else LANDING_LAYOUT, else the full store", () => {
    // admin set → admin wins, whatever the environment says
    expect(landingLayout({ layout: "store" }, { LANDING_LAYOUT: "drop" })).toBe("store");
    expect(landingLayout({ layout: "drop" }, { LANDING_LAYOUT: "store" })).toBe("drop");
    // admin not set → the environment decides
    expect(landingLayout({}, { LANDING_LAYOUT: "drop" })).toBe("drop");
    expect(landingLayout(undefined, { LANDING_LAYOUT: " DROP " })).toBe("drop");
    expect(landingLayout({}, { LANDING_LAYOUT: "store" })).toBe("store");
    // neither / an unknown value → the full store
    expect(landingLayout({}, { LANDING_LAYOUT: "luxury" })).toBe("store");
    expect(landingLayout({}, { LANDING_LAYOUT: "" })).toBe("store");
    expect(envLandingLayout({ LANDING_LAYOUT: "luxury" })).toBeNull();
  });

  it("each layout uses its own hero and SEO; ambassador / limited are shared", () => {
    const content = {
      hero: parseHeroSlides([slide({ id: "store-hero", headline: ["Store"] })]),
      drop: { hero: parseHeroSlides([slide({ id: "drop-hero", headline: ["Drop"] })]) },
      ambassador: { ...builtInContent(MOCK_HOMEPAGE).ambassador, ambassadorName: "Shared Star" },
    };
    const store = applyHomepage(MOCK_HOMEPAGE, content, "store");
    const dropPage = applyHomepage(MOCK_DROP_HOMEPAGE, content, "drop");
    const headline = (bs: typeof store) => bs.find((b) => b.type === "hero")?.type === "hero" && (bs.find((b) => b.type === "hero") as Extract<(typeof bs)[number], { type: "hero" }>).slides[0].headline[0];
    expect(headline(store)).toBe("Store");
    expect(headline(dropPage)).toBe("Drop");
    for (const page of [store, dropPage]) {
      const amb = page.find((b) => b.type === "ambassador");
      expect(amb?.type === "ambassador" && amb.ambassadorName).toBe("Shared Star");
    }
  });

  it("spotlights: the admin's list replaces the demo ones in place; demo category dropped", () => {
    const spotlights = parseSpotlights([{ ...drop.spotlights[0], productId: "p_hoodie" }]);
    const page = applyHomepage(MOCK_DROP_HOMEPAGE, { drop: { spotlights } }, "drop");
    const sps = page.filter((b) => b.type === "product_spotlight");
    expect(sps).toHaveLength(1);
    expect(sps[0].type === "product_spotlight" && [sps[0].productId, sps[0].demoCategory]).toEqual(["p_hoodie", undefined]);
    expect(page.map((b) => b.type).indexOf("product_spotlight")).toBe(MOCK_DROP_HOMEPAGE.map((b) => b.type).indexOf("product_spotlight"));
  });

  it("spotlight / points validation: one product each, no repeats, caps, no price from here", () => {
    const base = { ...drop.spotlights[0], productId: "p_a" };
    expect(() => parseSpotlights([])).toThrow();
    expect(() => parseSpotlights([base, base])).toThrow(/already has a spotlight/);
    expect(() => parseSpotlights([{ ...base, productId: "" }])).toThrow();
    expect(() => parseSpotlights([{ ...base, details: ["a", "b", "c", "d", "e", "f"].map((x) => `detail ${x}`) }])).toThrow();
    expect(() => parseSpotlights([{ ...base, price: 99 }])).toThrow();
    expect(() => parseSpotlights([{ ...base, editionSize: 0 }])).toThrow();
    expect(parseSpotlights([{ ...base, signedBy: "" }])[0].signedBy).toBeNull();
    expect(() => parsePoints({ title: "Why", points: [] })).toThrow();
    expect(() => parsePoints({ title: "Why it's exclusive", points: Array.from({ length: 5 }, (_, i) => ({ title: `P${i}x`, text: "Long enough text" })) })).toThrow();
  });

  it("saving the switch keeps every other part; a spotlight product must exist", async () => {
    let v = await homepageView(deps);
    await saveHomepage(deps, { revision: v.revision, hero: [slide()] });
    v = await homepageView(deps);
    await expect(saveHomepage(deps, { revision: v.revision, layout: "drop", drop: { spotlights: [{ ...drop.spotlights[0], productId: "ghost_product" }] } })).rejects.toThrow(/isn't in the catalogue/);
    const real = (await deps.store.listRecords())[0].id;
    await saveHomepage(deps, { revision: v.revision, layout: "drop", drop: { spotlights: [{ ...drop.spotlights[0], productId: real }] } });
    v = await homepageView(deps);
    expect(v.content.layout).toBe("drop");
    expect(v.content.hero?.[0].id).toBe("drop"); // the full store's hero is kept for switching back
    expect(v.content.drop?.spotlights?.[0].productId).toBe(real);
    // The editor sees the live stock of every colour of the picked style (admin-only view).
    const rec = (await deps.store.listRecords()).find((r) => r.id === real)!;
    const colours = (await deps.store.listRecords()).filter((r) => r.styleId === rec.styleId).length;
    expect(v.stock[real].styleId).toBe(rec.styleId);
    expect(v.stock[real].colours).toHaveLength(colours);
    expect(v.stock[real].colours.every((c) => c.sizes.every((x) => Number.isInteger(x.stock) && x.stock >= 0))).toBe(true);
    await saveHomepage(deps, { revision: v.revision, layout: "store" });
    v = await homepageView(deps);
    expect(v.content.layout).toBe("store");
    expect(v.content.drop?.spotlights?.[0].productId).toBe(real); // and the drop's content is kept too
  });
});

describe("Shop all page categories", () => {
  const tree = [{ handle: "shirts" }, { handle: "jeans" }, { handle: "tees" }];
  it("the admin's list in its order; null = every category; unknown / repeated handles refused", () => {
    expect(shopAllCategories(tree, null).map((c) => c.handle)).toEqual(["shirts", "jeans", "tees"]);
    expect(shopAllCategories(tree, ["tees", "shirts"]).map((c) => c.handle)).toEqual(["tees", "shirts"]);
    expect(shopAllCategories(tree, ["gone", "jeans"]).map((c) => c.handle)).toEqual(["jeans"]);
    const nodes = tree.map((c) => ({ ...c, title: c.handle, image: { art: "tee" as const, colour: "#000000", alt: "" }, subcategories: [] }));
    expect(parseShopAll(undefined, nodes)).toBeUndefined();
    expect(parseShopAll(null, nodes)).toBeNull();
    expect(() => parseShopAll(["jeans", "jeans"], nodes)).toThrow(/twice/);
    expect(() => parseShopAll(["hacked"], nodes)).toThrow();
    expect(() => parseShopAll("jeans", nodes)).toThrow();
  });
});
