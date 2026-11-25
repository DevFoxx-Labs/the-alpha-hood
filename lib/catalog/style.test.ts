import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_SNAPSHOT } from "@/lib/commerce/mock";
import { MOCK_NOW } from "@/lib/commerce/mock/data";
import { priceCart } from "@/lib/pricing/price-cart";
import { createMemoryReviewStore } from "@/lib/reviews/store";
import { type CatalogAdminDeps, validGtin } from "./admin";
import { createMemoryMediaStore } from "./media";
import { createOwnCatalog } from "./own";
import { hangerShots } from "./rail";
import { seedDemoCatalog } from "./seed";
import { createMemoryCatalogStore } from "./store";
import { getStyle, saveStyle, styleRows } from "./style";

const PHOTO = `med_${"c".repeat(32)}`;
let deps: CatalogAdminDeps & { invalidate: ReturnType<typeof vi.fn<() => void>> };
const now = new Date(MOCK_NOW);
const own = () => createOwnCatalog(deps.store, createMemoryReviewStore(), { now: () => MOCK_NOW, ttlMs: 0 });

beforeEach(async () => {
  const store = createMemoryCatalogStore();
  await seedDemoCatalog({ catalog: store, reviewStore: createMemoryReviewStore() }, () => {}, now);
  const media = createMemoryMediaStore();
  await media.save({ id: PHOTO, type: "image/png", width: 800, height: 800, bytes: new Uint8Array(), createdAt: now.toISOString(), createdBy: "stf_test" });
  deps = { store, media, invalidate: vi.fn<() => void>() };
});

// Valid EAN-13s (GS1 check digit).
const EAN = ["4006381333931", "8901234567890", "5901234123457"];

function colour(name: string, hex: string, code: string, over: Record<string, unknown> = {}) {
  return {
    colour: { name, hex },
    colourFamily: "black",
    sku: `AH-OVR-${code}`,
    price: 149_900,
    mrp: 199_900,
    costPrice: 60_000,
    sizes: [
      { label: "M", stock: 4, sku: `AH-OVR-${code}-M` },
      { label: "L", stock: 0, sku: `AH-OVR-${code}-L` },
    ],
    photos: [],
    status: "active",
    ...over,
  };
}

function styleBody(over: Record<string, unknown> = {}, variants: unknown[] = [colour("Black", "#111111", "BLK"), colour("Olive", "#59603f", "OLV")]) {
  return {
    baseTitle: "Heavy Overshirt",
    category: "shirts",
    subcategory: "overshirts",
    art: "shirt",
    attributes: { fit: "relaxed", fabric: "cotton" },
    tags: ["overshirt"],
    description: "A heavyweight cotton overshirt for layering.",
    specs: [{ label: "Collar", value: "Spread" }],
    sizeChart: "tops",
    legal: { manufacturer: "Test Manufacturer, Pune", countryOfOrigin: "India", netQuantity: "1 N (one piece)" },
    hsn: "6205",
    weightGrams: 450,
    dimensionsCm: { length: 30, width: 25, height: 4 },
    variants,
    ...over,
  };
}

/** The editor's PUT body for a loaded style. */
async function editBody(styleId: string, edit: (b: ReturnType<typeof styleBody> & { variants: Record<string, unknown>[] }) => void = () => {}) {
  const s = (await getStyle(deps, styleId, true))!;
  const b = {
    ...styleBody(),
    baseTitle: s.baseTitle,
    variants: s.variants.map((v) => ({ id: v.id, version: v.version, colour: v.colour, colourFamily: v.colourFamily, handle: v.handle, sku: v.sku, price: v.price, mrp: v.mrp, costPrice: v.costPrice, sizes: v.sizes, photos: v.photos, status: v.status })),
  };
  edit(b);
  return b;
}

describe("style editor: create", () => {
  it("creates every colour in one go, and the store shows both colours as swatches of one product", async () => {
    const r = await saveStyle(deps, null, styleBody(), now);
    expect(r.styleId).toMatch(/^style_[0-9a-f]{12}$/);
    expect(r.created).toHaveLength(2);
    expect(deps.invalidate).toHaveBeenCalledTimes(1);

    const black = await own().reader.getProduct("heavy-overshirt-black");
    expect(black?.title).toBe("Heavy Overshirt — Black");
    expect(black?.colours.map((c) => c.name).sort()).toEqual(["Black", "Olive"]);
    expect(black?.hsn).toBe("6205");
    expect(black?.sizes).toEqual([{ label: "M", stock: 4 }, { label: "L", stock: 0 }]);
  });

  it("never sends cost price, package data or size codes to the storefront", async () => {
    await saveStyle(deps, null, styleBody(), now);
    const shown = JSON.stringify(await own().reader.getProduct("heavy-overshirt-black"));
    for (const secret of ["costPrice", "60000", "weightGrams", "dimensionsCm", "AH-OVR-BLK-M", "version", "status"]) expect(shown, secret).not.toContain(secret);
    const listed = JSON.stringify(await own().reader.listProducts({ limit: 200 }));
    expect(listed).not.toContain("costPrice");
  });

  it("cost price is only returned to staff who edit the catalogue", async () => {
    const { styleId } = await saveStyle(deps, null, styleBody(), now);
    expect((await getStyle(deps, styleId, true))!.variants[0].costPrice).toBe(60_000);
    expect(JSON.stringify(await getStyle(deps, styleId, false))).not.toContain("costPrice");
  });

  it("allow-lists every field (per colour, per size and shared)", async () => {
    const bad: [Record<string, unknown>, unknown[] | undefined, RegExp][] = [
      [{}, [colour("Black", "#111111", "BLK", { sizes: [{ label: "M", stock: 1, barcode: "4006381333932" }] })], /check digit/],
      [{}, [colour("Black", "#111111", "BLK", { sizes: [{ label: "M", stock: 1, sku: "x" }] })], /SKU for size M/],
      [{}, [colour("Black", "#111111", "BLK", { sizes: [{ label: "M", stock: 1, sku: "AH-DUP-1" }, { label: "L", stock: 1, sku: "AH-DUP-1" }] })], /used twice/],
      [{}, [colour("Black", "#111111", "BLK", { costPrice: -1 })], /Cost price/],
      [{}, [colour("Black", "#111111", "BLK", { costPrice: 1.5 })], /Cost price/],
      [{}, [colour("Black", "#111111", "BLK", { seo: { title: "x".repeat(71) } })], /SEO title/],
      [{}, [colour("Black", "#111111", "BLK", { isFeatured: true })], /Unknown field/],
      [{}, [colour("Black", "#111111", "BLK", { id: "prd_not_in_this_style", version: 1 })], /doesn't belong/],
      [{}, [colour("Black", "#111111", "BLK", { version: 3 })], /new colour has no version/],
      [{}, [colour("Black", "#111111", "BLK"), colour("black", "#111111", "BL2")], /listed twice/],
      [{}, [colour("Black", "#111111", "BLK"), colour("Olive", "#59603f", "OLV", { handle: "heavy-overshirt-black" })], /another colour uses/],
      [{}, [], /1–12 colours/],
      [{ hsn: "61" }, undefined, /HSN/],
      [{ gstClass: "luxury" }, undefined, /GST class/],
      [{ weightGrams: 0 }, undefined, /Weight/],
      [{ dimensionsCm: { length: 10, width: 10 } }, undefined, /Height/],
      [{ title: "Sneaky" }, undefined, /Unknown field/],
      [{ styleId: "style_other" }, undefined, /Unknown field/],
      [{ baseTitle: "x" }, undefined, /Product name/],
      [{ category: "drinks" }, undefined, /category/],
    ];
    for (const [over, variants, msg] of bad) await expect(saveStyle(deps, null, styleBody(over, variants), now), msg.source).rejects.toThrow(msg);
    expect((await deps.store.listRecords()).some((r) => r.sku.startsWith("AH-OVR"))).toBe(false);
  });

  it("PLP-08 tags on-hanger photos front / back / side; the storefront rail can turn them", async () => {
    const ids = ["d", "e"].map((c) => `med_${c.repeat(32)}`);
    for (const id of ids) await deps.media!.save({ id, type: "image/png", width: 645, height: 1000, bytes: new Uint8Array(), createdAt: now.toISOString(), createdBy: "stf_test" });
    const photos = [
      { id: PHOTO, alt: "Heavy Overshirt in black, front on a hanger", view: "front" },
      { id: ids[0], alt: "Heavy Overshirt in black, side on a hanger", view: "side" },
      { id: ids[1], alt: "Heavy Overshirt in black, detail" },
    ];
    const { styleId } = await saveStyle(deps, null, styleBody({}, [colour("Black", "#111111", "BLK", { photos })]), now);
    const black = (await own().reader.getProduct("heavy-overshirt-black"))!;
    const shots = hangerShots(black);
    expect(shots?.front.url).toBe(`/api/media/${PHOTO}`);
    expect(shots?.side.url).toBe(`/api/media/${ids[0]}`);
    expect(shots?.back).toBeUndefined();
    // Round trip through the editor keeps the tags (and nothing is invented for the untagged photo).
    expect((await getStyle(deps, styleId, true))!.variants[0].photos).toEqual(photos);
  });

  it("PLP-08 refuses a made-up photo view or the same view twice", async () => {
    const twice = [{ id: PHOTO, alt: "Front on a hanger", view: "front" }];
    await expect(saveStyle(deps, null, styleBody({}, [colour("Black", "#111111", "BLK", { photos: [{ ...twice[0], view: "top" }] })]), now)).rejects.toThrow(/photo view/);
    const other = `med_${"f".repeat(32)}`;
    await deps.media!.save({ id: other, type: "image/png", width: 800, height: 800, bytes: new Uint8Array(), createdAt: now.toISOString(), createdBy: "stf_test" });
    await expect(saveStyle(deps, null, styleBody({}, [colour("Black", "#111111", "BLK", { photos: [...twice, { id: other, alt: "Also front", view: "front" }] })]), now)).rejects.toThrow(/Only one photo can be the front/);
    await expect(saveStyle(deps, null, styleBody({}, [colour("Black", "#111111", "BLK", { photos: [{ ...twice[0], url: "https://evil.example/x.png" }] })]), now)).rejects.toThrow(/Unknown field/);
  });

  it("size SKUs and barcodes are unique across the catalogue", async () => {
    await saveStyle(deps, null, styleBody({}, [colour("Black", "#111111", "BLK", { sizes: [{ label: "M", stock: 1, barcode: EAN[0] }] })]), now);
    const other = { baseTitle: "Other Shirt" };
    await expect(saveStyle(deps, null, styleBody(other, [colour("Red", "#aa0000", "RED", { sizes: [{ label: "M", stock: 1, barcode: EAN[0] }] })]), now)).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/Barcode/) });
    await expect(saveStyle(deps, null, styleBody(other, [colour("Red", "#aa0000", "RED", { sizes: [{ label: "M", stock: 1, sku: "AH-OVR-BLK" }] })]), now)).rejects.toMatchObject({ status: 409 });
    const demo = DEMO_SNAPSHOT.products[0];
    await expect(saveStyle(deps, null, styleBody(other, [colour("Red", "#aa0000", "RED", { sizes: [{ label: "M", stock: 1, sku: demo.sku }] })]), now)).rejects.toMatchObject({ status: 409 });
    await expect(saveStyle(deps, null, styleBody(other, [colour("Red", "#aa0000", "RED", { sku: demo.sku })]), now)).rejects.toMatchObject({ status: 409 });
  });
});

describe("style editor: edit", () => {
  it("shared fields reach every colour; a new colour joins; an archived colour leaves the store", async () => {
    const { styleId } = await saveStyle(deps, null, styleBody(), now);
    await saveStyle(
      deps,
      styleId,
      await editBody(styleId, (b) => {
        b.description = "Now in a brushed heavyweight cotton.";
        b.variants[1].status = "archived";
        b.variants.push(colour("Sand", "#c8b79a", "SND", { sizes: [{ label: "M", stock: 2, barcode: EAN[1] }] }));
      }),
      now,
    );
    const s = (await getStyle(deps, styleId, true))!;
    expect(s.variants.map((v) => v.colour.name)).toEqual(["Black", "Olive", "Sand"]);
    expect(s.variants.map((v) => v.version)).toEqual([2, 2, 1]);
    expect(s.shared.description).toBe("Now in a brushed heavyweight cotton.");
    expect((await deps.store.listRecords()).filter((r) => r.styleId === styleId).every((r) => r.description === s.shared.description)).toBe(true);
    expect((await own().reader.getProduct("heavy-overshirt-black"))!.colours.map((c) => c.name).sort()).toEqual(["Black", "Sand"]);
    expect(await own().reader.getProduct("heavy-overshirt-olive")).toBeNull();
  });

  it("existing sizes keep their live stock; a new size takes its opening stock", async () => {
    const { styleId } = await saveStyle(deps, null, styleBody(), now);
    await saveStyle(
      deps,
      styleId,
      await editBody(styleId, (b) => {
        b.variants[0].sizes = [{ label: "M", stock: 999 }, { label: "L", stock: 999 }, { label: "XL", stock: 7 }];
      }),
      now,
    );
    expect((await own().reader.getProduct("heavy-overshirt-black"))!.sizes).toEqual([{ label: "M", stock: 4 }, { label: "L", stock: 0 }, { label: "XL", stock: 7 }]);
  });

  it("refuses to drop a colour, to edit another style's colour through this one, and to move a live web address", async () => {
    const { styleId } = await saveStyle(deps, null, styleBody(), now);
    await expect(saveStyle(deps, styleId, await editBody(styleId, (b) => b.variants.pop()), now)).rejects.toThrow(/Archive a colour/);
    const demo = (await deps.store.listRecords()).find((r) => r.styleId !== styleId)!;
    await expect(saveStyle(deps, styleId, await editBody(styleId, (b) => b.variants.push({ ...colour("Hijack", "#000000", "HJK"), id: demo.id, version: demo.version })), now)).rejects.toThrow(/doesn't belong/);
    expect((await deps.store.getRecord(demo.id))!.version).toBe(demo.version);
    await expect(saveStyle(deps, styleId, await editBody(styleId, (b) => (b.variants[0].handle = "cheap-overshirt")), now)).rejects.toThrow(/can't change/);
    await expect(saveStyle(deps, "style_missing", await editBody(styleId), now)).rejects.toMatchObject({ status: 404 });
  });

  it("a draft colour's web address can still change", async () => {
    const { styleId } = await saveStyle(deps, null, styleBody({}, [colour("Black", "#111111", "BLK", { status: "draft" })]), now);
    await saveStyle(deps, styleId, await editBody(styleId, (b) => (b.variants[0].handle = "overshirt-black")), now);
    expect((await getStyle(deps, styleId, true))!.variants[0].handle).toBe("overshirt-black");
  });

  it("stale or racing saves: exactly one wins and the loser writes NOTHING (no half-saved colours)", async () => {
    const { styleId } = await saveStyle(deps, null, styleBody(), now);
    const a = await editBody(styleId, (b) => (b.variants[0].price = 129_900));
    const b = await editBody(styleId, (x) => {
      x.variants[1].price = 119_900;
      x.variants.push(colour("Rust", "#8a3b12", "RST"));
    });
    const race = await Promise.allSettled([saveStyle(deps, styleId, a, now), saveStyle(deps, styleId, b, now)]);
    expect(race.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((race.find((r) => r.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ code: "version_conflict", status: 409 });
    const records = (await deps.store.listRecords()).filter((r) => r.styleId === styleId);
    const winnerWasA = records.find((r) => r.colour.name === "Black")!.price === 129_900;
    expect(records.some((r) => r.colour.name === "Rust")).toBe(!winnerWasA);
    expect(records.find((r) => r.colour.name === "Olive")!.price).toBe(winnerWasA ? 149_900 : 119_900);
  });
});

describe("products list, GST and barcodes", () => {
  it("lists one row per style, searchable by size SKU and barcode", async () => {
    const { styleId } = await saveStyle(deps, null, styleBody({}, [colour("Black", "#111111", "BLK", { sizes: [{ label: "M", stock: 3, barcode: EAN[2] }] }), colour("Olive", "#59603f", "OLV", { status: "draft" })]), now);
    const records = await deps.store.listRecords();
    const all = styleRows(records, new Map(), "", null);
    expect(all.length).toBe(new Set(records.map((r) => r.styleId)).size);
    const [row] = styleRows(records, new Map(), EAN[2], null);
    expect(row).toMatchObject({ styleId, title: "Heavy Overshirt", status: "active", stock: 7, price: { min: 149_900, max: 149_900 } });
    expect(row.colours.map((c) => c.status)).toEqual(["active", "draft"]);
    expect(styleRows(records, new Map(), "AH-OVR-OLV", "archived")).toEqual([]);
  });

  it("the product's GST class and HSN drive the cart's tax line", () => {
    const line = { lineId: "l1", productId: "p1", category: "shirts", quantity: 1, unitPrice: 100_000, unitMrp: 100_000 };
    expect(priceCart({ lines: [line] }).lines[0]).toMatchObject({ gstRate: 5, hsn: "61/62" });
    expect(priceCart({ lines: [{ ...line, gstClass: "eyewear" }] }).lines[0]).toMatchObject({ gstRate: 18, hsn: "9004" });
    expect(priceCart({ lines: [{ ...line, hsn: "6205" }] }).lines[0]).toMatchObject({ gstRate: 5, hsn: "6205" });
  });

  it("validates GS1 check digits", () => {
    for (const code of [...EAN, "96385074", "036000291452"]) expect(validGtin(code), code).toBe(true);
    for (const code of ["4006381333932", "1234567", "abcdefghijklm", "400638133393"]) expect(validGtin(code), code).toBe(false);
  });
});
