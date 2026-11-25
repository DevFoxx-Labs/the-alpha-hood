import { beforeEach, describe, expect, it, vi } from "vitest";
import { MOCK_NOW } from "@/lib/commerce/mock/data";
import { createMemoryReviewStore } from "@/lib/reviews/store";
import { csvCell } from "@/lib/security/csv-cell";
import type { CatalogAdminDeps } from "./admin";
import { bulkUpdate } from "./bulk";
import { CSV_COLUMNS, exportCatalogCsv, importCatalogCsv, parseCsv } from "./csv";
import { createMemoryMediaStore } from "./media";
import { createOwnCatalog } from "./own";
import { seedDemoCatalog } from "./seed";
import { createMemoryCatalogStore } from "./store";
import { getStyle, saveStyle } from "./style";

let deps: CatalogAdminDeps & { invalidate: ReturnType<typeof vi.fn<() => void>> };
const now = new Date(MOCK_NOW);
const own = () => createOwnCatalog(deps.store, createMemoryReviewStore(), { now: () => MOCK_NOW, ttlMs: 0 });

beforeEach(async () => {
  const store = createMemoryCatalogStore();
  await seedDemoCatalog({ catalog: store, reviewStore: createMemoryReviewStore() }, () => {}, now);
  deps = { store, media: createMemoryMediaStore(), invalidate: vi.fn<() => void>() };
});

/** CSV text from objects (only the columns given, in CSV_COLUMNS order). */
function csv(rows: Record<string, string | number>[], columns = CSV_COLUMNS.filter((c) => rows.some((r) => c in r))) {
  return [columns.join(","), ...rows.map((r) => columns.map((c) => csvCell(r[c] ?? "")).join(","))].join("\r\n");
}

const base = {
  product_name: "Canvas Chore Jacket",
  category: "jackets",
  description: "A sturdy canvas chore jacket with four pockets.",
  size_chart: "tops",
  placeholder_art: "jacket",
  manufacturer: "Test Manufacturer, Pune",
  country_of_origin: "India",
  net_quantity: "1 N (one piece)",
  hsn: "6201",
  tags: "workwear | canvas",
  specs: "Pockets: Four | Closure: Buttons",
  fit: "relaxed",
};
const colourRow = (colour: string, hex: string, code: string, size: string, extra: Record<string, string | number> = {}) => ({
  ...base,
  colour,
  colour_hex: hex,
  colour_family: "brown",
  status: "active",
  colour_sku: `AH-CHR-${code}`,
  price_inr: "2499.50",
  mrp_inr: "3299",
  cost_price_inr: "900",
  size,
  size_sku: `AH-CHR-${code}-${size}`,
  stock: 5,
  ...extra,
});
const NEW_FILE = csv([colourRow("Tan", "#a67b4f", "TAN", "M"), colourRow("Tan", "#a67b4f", "TAN", "L"), colourRow("Black", "#111111", "BLK", "M")]);

describe("CSV parser", () => {
  it("handles quotes, escaped quotes, commas, newlines in cells, CRLF and a BOM", () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi""\nthere"\n')).toEqual([["a", "b"], ["x, y", 'say "hi"\nthere']]);
    expect(() => parseCsv('a\n"open')).toThrow(/unclosed quote/);
    expect(() => parseCsv("a\n1\n2\n3", 2)).toThrow(/At most 1 rows/);
  });
});

describe("CSV export", () => {
  it("one row per size, formula-safe, cost only for editors, and stock is the live stock", async () => {
    const all = await deps.store.listRecords();
    const { csv: out, rows } = await exportCatalogCsv(deps, true);
    expect(rows).toBe(all.reduce((n, r) => n + r.sizes.length, 0));
    const table = parseCsv(out);
    expect(table[0]).toEqual([...CSV_COLUMNS]);
    expect((await exportCatalogCsv(deps, false)).csv.split("\r\n")[0]).not.toContain("cost_price_inr");

    await saveStyle(deps, null, { ...styleish(), baseTitle: "=HYPERLINK(\"http://evil\")" }, now);
    const guarded = (await exportCatalogCsv(deps, true)).csv;
    expect(guarded).toContain(`"'=HYPERLINK(""http://evil"")"`);
  });

  it("export → import of the same file changes nothing", async () => {
    const { csv: out } = await exportCatalogCsv(deps, true);
    const plan = await importCatalogCsv(deps, out, false, now);
    expect(plan.errors).toEqual([]);
    expect(plan.totals).toMatchObject({ create: 0, update: 0, errors: 0 });
    expect(plan.totals.unchanged).toBe(new Set((await deps.store.listRecords()).map((r) => r.styleId)).size);
  });
});

function styleish() {
  return {
    baseTitle: "Guard Test",
    category: "shirts",
    art: "shirt",
    description: "A shirt used to test the export.",
    sizeChart: "tops",
    legal: { manufacturer: "Test Manufacturer, Pune", countryOfOrigin: "India", netQuantity: "1 N (one piece)" },
    variants: [{ colour: { name: "Ink", hex: "#111111" }, colourFamily: "black", sku: "AH-GRD-INK", price: 99_900, mrp: 99_900, sizes: [{ label: "M", stock: 1 }], photos: [], status: "draft" }],
  };
}

describe("CSV import", () => {
  it("plans without writing, then creates the product with its colours and sizes", async () => {
    const before = (await deps.store.listRecords()).length;
    const plan = await importCatalogCsv(deps, NEW_FILE, false, now);
    expect(plan).toMatchObject({ ok: true, applied: false, totals: { rows: 3, create: 1, update: 0, errors: 0 } });
    expect(plan.groups[0]).toMatchObject({ rows: "2–4", title: "Canvas Chore Jacket", action: "create", colours: 2, sizes: 3 });
    expect((await deps.store.listRecords()).length).toBe(before);

    const done = await importCatalogCsv(deps, NEW_FILE, true, now);
    expect(done).toMatchObject({ ok: true, applied: true, totals: { create: 1 } });
    const tan = (await deps.store.listRecords()).find((r) => r.sku === "AH-CHR-TAN")!;
    expect(tan).toMatchObject({ title: "Canvas Chore Jacket — Tan", price: 249_950, mrp: 329_900, costPrice: 90_000, hsn: "6201", tags: ["workwear", "canvas"], status: "active" });
    expect(tan.specs).toEqual([{ label: "Pockets", value: "Four" }, { label: "Closure", value: "Buttons" }]);
    expect(tan.sizes).toEqual([{ label: "M", stock: 5, sku: "AH-CHR-TAN-M" }, { label: "L", stock: 5, sku: "AH-CHR-TAN-L" }]);
    expect((await own().reader.getProduct(tan.handle))!.colours).toHaveLength(2);

    // Re-running the same file is safe: matched by colour SKU, nothing changes.
    const again = await importCatalogCsv(deps, NEW_FILE, false, now);
    expect(again.totals).toMatchObject({ create: 0, update: 0, unchanged: 1 });
  });

  it("updates an existing product; left-out columns, photos, live stock and other colours stay", async () => {
    await importCatalogCsv(deps, NEW_FILE, true, now);
    const sid = (await deps.store.listRecords()).find((r) => r.sku === "AH-CHR-TAN")!.styleId;
    // Only a few columns: price of Tan changes, a new XL size; Black isn't in the file.
    const update = csv([
      { style_id: sid, product_name: "Canvas Chore Jacket", colour: "Tan", colour_sku: "AH-CHR-TAN", price_inr: "1999", size: "M", stock: 999 },
      { style_id: sid, product_name: "Canvas Chore Jacket", colour: "Tan", colour_sku: "AH-CHR-TAN", price_inr: "1999", size: "L" },
      { style_id: sid, product_name: "Canvas Chore Jacket", colour: "Tan", colour_sku: "AH-CHR-TAN", price_inr: "1999", size: "XL", stock: 3 },
    ]);
    const r = await importCatalogCsv(deps, update, true, now);
    expect(r.errors).toEqual([]);
    expect(r.totals.update).toBe(1);
    const s = (await getStyle(deps, sid, true))!;
    const tan = s.variants.find((v) => v.colour.name === "Tan")!;
    expect(tan.price).toBe(199_900);
    expect(tan.costPrice).toBe(90_000); // column not in the file → kept
    expect(tan.sizes.map((x) => [x.label, x.stock, x.sku ?? null])).toEqual([["M", 5, "AH-CHR-TAN-M"], ["L", 5, "AH-CHR-TAN-L"], ["XL", 3, null]]);
    expect(s.variants.find((v) => v.colour.name === "Black")!.price).toBe(249_950);
    expect(s.shared.description).toBe(base.description);
  });

  it("reports row-level errors and applies nothing when any row is wrong", async () => {
    const before = await deps.store.listRecords();
    const bad = csv([
      colourRow("Tan", "#a67b4f", "TAN", "M"),
      colourRow("Tan", "#a67b4f", "TAN", "L", { price_inr: "24,99" }),
      { ...colourRow("Rust", "#8a3b12", "RST", "M"), product_name: "Other Jacket", colour_sku: "AH-CHR-TAN" },
      { ...colourRow("Ink", "#111111", "INK", "M"), product_name: "Third Jacket", style_id: "style_made_up" },
      { ...colourRow("Ink", "#111111", "INK", "M"), product_name: "Fourth Jacket", description: "short" },
    ]);
    const r = await importCatalogCsv(deps, bad, true, now);
    expect(r.ok).toBe(false);
    expect(r.applied).toBe(false);
    const text = r.errors.join("\n");
    expect(text).toMatch(/Row 5: style_id .* doesn't exist/);
    expect(text).toMatch(/Rows 2–3 .*differs from row 2|price_inr: enter rupees/);
    expect(text).toMatch(/Description/);
    expect(await deps.store.listRecords()).toEqual(before);
  });

  it("refuses unknown columns, missing required columns, duplicate codes across products and size caps", async () => {
    await expect(importCatalogCsv(deps, "product_name,colour,colour_sku,size,is_admin\nA,B,C,M,1", false, now)).rejects.toThrow(/Unknown column: is_admin/);
    await expect(importCatalogCsv(deps, "product_name,colour\nA,B", false, now)).rejects.toThrow(/Missing columns: colour_sku, size/);
    await expect(importCatalogCsv(deps, "", false, now)).rejects.toThrow(/Choose a CSV/);
    await expect(importCatalogCsv(deps, "x".repeat(2_500_001), false, now)).rejects.toThrow(/2.5 MB/);
    const dup = csv([colourRow("Tan", "#a67b4f", "TAN", "M", { barcode: "4006381333931" }), { ...colourRow("Sand", "#c8b79a", "SND", "M", { barcode: "4006381333931" }), product_name: "Another Jacket" }]);
    const r = await importCatalogCsv(deps, dup, false, now);
    expect(r.errors.join("\n")).toMatch(/Barcode 4006381333931 is already used/);
  });

  it("strips the formula guard on import so a guarded value round-trips", async () => {
    const r = await importCatalogCsv(deps, csv([colourRow("Tan", "#a67b4f", "TAN", "M", { seo_title: "-50% canvas" })]), true, now);
    expect(r.ok).toBe(true);
    expect((await deps.store.listRecords()).find((x) => x.sku === "AH-CHR-TAN")!.seo).toEqual({ title: "-50% canvas" });
  });
});

describe("bulk actions", () => {
  async function twoStyles() {
    await importCatalogCsv(deps, NEW_FILE, true, now);
    await importCatalogCsv(deps, csv([{ ...colourRow("Grey", "#777777", "GRY", "M"), product_name: "Second Jacket", colour_sku: "AH-SEC-GRY", size_sku: "AH-SEC-GRY-M", status: "draft" }]), true, now);
    const rs = await deps.store.listRecords();
    return [rs.find((r) => r.sku === "AH-CHR-TAN")!.styleId, rs.find((r) => r.sku === "AH-SEC-GRY")!.styleId];
  }

  it("publish / unpublish / archive change every colour of the selected products in one go", async () => {
    const [a, b] = await twoStyles();
    expect(await bulkUpdate(deps, { action: "publish", styleIds: [a, b] }, now)).toEqual({ action: "publish", products: 1, colours: 1 });
    expect(await own().reader.getProduct("second-jacket-grey")).not.toBeNull();
    expect(await bulkUpdate(deps, { action: "archive", styleIds: [a, b] }, now)).toMatchObject({ products: 2, colours: 3 });
    expect(await own().reader.getProduct("canvas-chore-jacket-tan")).toBeNull();
    expect(await bulkUpdate(deps, { action: "archive", styleIds: [a] }, now)).toMatchObject({ products: 0, colours: 0 });
    expect(deps.invalidate).toHaveBeenCalled();
  });

  it("category and tags; invalid input refused", async () => {
    const [a] = await twoStyles();
    await bulkUpdate(deps, { action: "category", styleIds: [a], category: "shirts", subcategory: "overshirts" }, now);
    expect((await deps.store.listRecords()).filter((r) => r.styleId === a).every((r) => r.category === "shirts" && r.subcategory === "overshirts")).toBe(true);
    await bulkUpdate(deps, { action: "add_tag", styleIds: [a], tag: "Summer" }, now);
    expect((await deps.store.listRecords()).find((r) => r.styleId === a)!.tags).toContain("summer");
    await bulkUpdate(deps, { action: "remove_tag", styleIds: [a], tag: "summer" }, now);
    expect((await deps.store.listRecords()).find((r) => r.styleId === a)!.tags).not.toContain("summer");

    const bad: [Record<string, unknown>, RegExp][] = [
      [{ action: "delete", styleIds: [a] }, /Choose an action/],
      [{ action: "publish", styleIds: [] }, /Select 1–100/],
      [{ action: "publish", styleIds: Array.from({ length: 101 }, (_, i) => `style_${i}`) }, /Select 1–100/],
      [{ action: "publish", styleIds: ["../x"] }, /Unknown product/],
      [{ action: "publish", styleIds: ["style_gone"] }, /no longer exists/],
      [{ action: "category", styleIds: [a], category: "drinks" }, /category/],
      [{ action: "category", styleIds: [a], category: "jeans", subcategory: "overshirts" }, /sub-category/],
      [{ action: "add_tag", styleIds: [a], tag: "<b>" }, /Tag/],
      [{ action: "publish", styleIds: [a], price: 1 }, /Unknown field/],
    ];
    for (const [body, msg] of bad) await expect(bulkUpdate(deps, body, now), msg.source).rejects.toThrow(msg);
  });

  it("all or nothing: one changed product makes the whole action fail and nothing changes", async () => {
    const [a, b] = await twoStyles();
    const store = deps.store;
    // Someone saves product b between our read and our write.
    const original = store.writeMany.bind(store);
    store.writeMany = async (ins, reps) => {
      const rb = (await store.listRecords()).find((r) => r.styleId === b)!;
      await original([], [{ record: { ...rb, version: rb.version + 1 }, expectedVersion: rb.version }]);
      return original(ins, reps);
    };
    await expect(bulkUpdate(deps, { action: "archive", styleIds: [a, b] }, now)).rejects.toMatchObject({ status: 409 });
    expect((await store.listRecords()).filter((r) => r.styleId === a).every((r) => r.status !== "archived")).toBe(true);
  });
});
