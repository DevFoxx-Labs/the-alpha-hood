import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryAlertStore } from "@/lib/alerts/service";
import { type CommerceAdapter, CommerceError } from "@/lib/commerce/types";
import { MOCK_NOW } from "@/lib/commerce/mock/data";
import { ValidationError } from "@/lib/http/guard";
import { createMemoryReviewStore } from "@/lib/reviews/store";
import { type CatalogAdminDeps, CatalogAdminError } from "./admin";
import { demandFor, setStyleHold } from "./hold";
import { holdInventory } from "./hold-inventory";
import { createOwnCatalog } from "./own";
import { seedDemoCatalog } from "./seed";
import { createMemoryCatalogStore, type ProductRecord } from "./store";
import { getStyle, saveStyle, styleRows } from "./style";

/** "Show as sold out" (lib/catalog/hold.ts): display, ownership, stock safety, the inventory gate and demand counts. */
let deps: CatalogAdminDeps & { invalidate: ReturnType<typeof vi.fn<() => void>> };
const now = new Date(MOCK_NOW);
const own = () => createOwnCatalog(deps.store, createMemoryReviewStore(), { now: () => MOCK_NOW, ttlMs: 0 });

/** A live style with ≥ 2 colours, at least one size in stock. */
async function pickStyle() {
  const records = (await deps.store.listRecords()).filter((r) => r.status === "active");
  const byStyle = new Map<string, ProductRecord[]>();
  for (const r of records) byStyle.set(r.styleId, [...(byStyle.get(r.styleId) ?? []), r]);
  const [styleId, colours] = [...byStyle].find(([, rs]) => rs.length >= 2 && rs.every((r) => r.sizes.some((s) => s.stock > 0)))!;
  const other = records.find((r) => r.styleId !== styleId)!;
  return { styleId, colours, other };
}

beforeEach(async () => {
  const store = createMemoryCatalogStore();
  await seedDemoCatalog({ catalog: store, reviewStore: createMemoryReviewStore() }, () => {}, now);
  deps = { store, invalidate: vi.fn<() => void>() };
});

describe("Show as sold out: switching", () => {
  it("every colour: the store shows 0 per size, the stock view keeps the real numbers, off restores it", async () => {
    const { styleId, colours } = await pickStyle();
    const real = (await own().reader.getProductById(colours[0].id))!.sizes;
    const r = await setStyleHold(deps, styleId, { on: true }, now);
    expect(r.changed.sort()).toEqual(colours.map((c) => c.id).sort());
    expect(deps.invalidate).toHaveBeenCalledTimes(1);

    const cat = own();
    for (const c of colours) {
      const shown = (await cat.reader.getProductById(c.id))!;
      expect(shown.sizes.every((s) => s.stock === 0)).toBe(true);
      expect(shown).not.toHaveProperty("soldOutHold"); // admin-only field
      expect(await cat.isHeld(c.id)).toBe(true);
    }
    expect((await cat.stockReader.getProductById(colours[0].id))!.sizes).toEqual(real);
    // Listings / filters treat it as sold out.
    const inStock = await cat.reader.searchCatalog({ kind: "all" }, { filters: { size: [], fit: [], colour: [], fabric: [], sleeve: [], pattern: [], occasion: [] }, price: null, discount: null, inStockOnly: true, sort: "popularity", page: 50 });
    expect(inStock.products.some((p) => colours.some((c) => c.id === p.id))).toBe(false);
    expect(styleRows(await deps.store.listRecords(), new Map(), "", null).find((x) => x.styleId === styleId)!.held).toBe(colours.length);

    // Same again changes nothing (no write, no version bump).
    expect((await setStyleHold(deps, styleId, { on: true }, now)).changed).toEqual([]);
    await setStyleHold(deps, styleId, { on: false }, now);
    expect((await own().reader.getProductById(colours[0].id))!.sizes).toEqual(real);
    expect(await own().isHeld(colours[0].id)).toBe(false);
  });

  it("one colour only, and the other colours stay on sale", async () => {
    const { styleId, colours } = await pickStyle();
    await setStyleHold(deps, styleId, { on: true, ids: [colours[0].id] }, now);
    const cat = own();
    expect(await cat.isHeld(colours[0].id)).toBe(true);
    expect(await cat.isHeld(colours[1].id)).toBe(false);
    const view = (await getStyle(deps, styleId, false))!;
    expect(view.variants.find((v) => v.id === colours[0].id)!.soldOutHold).toBe(true);
    expect(view.variants.find((v) => v.id === colours[1].id)!.soldOutHold).toBe(false);
  });

  it("refuses another style's colour, unknown styles, malformed bodies and unknown fields", async () => {
    const { styleId, colours, other } = await pickStyle();
    await expect(setStyleHold(deps, styleId, { on: true, ids: [other.id] }, now)).rejects.toBeInstanceOf(ValidationError);
    await expect(setStyleHold(deps, styleId, { on: true, ids: [colours[0].id, colours[0].id] }, now)).rejects.toBeInstanceOf(ValidationError);
    await expect(setStyleHold(deps, styleId, { on: "true" }, now)).rejects.toBeInstanceOf(ValidationError);
    await expect(setStyleHold(deps, styleId, { on: true, stock: 0 }, now)).rejects.toBeInstanceOf(ValidationError);
    await expect(setStyleHold(deps, "style_nope", { on: true }, now)).rejects.toBeInstanceOf(CatalogAdminError);
    await expect(setStyleHold(deps, "../x", { on: true }, now)).rejects.toMatchObject({ status: 404 });
    expect(await own().isHeld(other.id)).toBe(false);
  });

  it("a stale version (someone saved in between) is refused and nothing is written", async () => {
    const { styleId, colours } = await pickStyle();
    const store = deps.store;
    deps = { ...deps, store: { ...store, writeMany: async () => false } };
    await expect(setStyleHold(deps, styleId, { on: true }, now)).rejects.toMatchObject({ status: 409 });
    expect((await store.getRecord(colours[0].id))!.soldOutHold).toBeUndefined();
  });

  it("a normal product save keeps the switch (it's only changed through its own endpoint)", async () => {
    const { styleId, colours } = await pickStyle();
    await setStyleHold(deps, styleId, { on: true }, now);
    const s = (await getStyle(deps, styleId, true))!;
    await saveStyle(deps, styleId, {
      baseTitle: s.baseTitle,
      ...s.shared,
      description: "Edited while shown as sold out.",
      variants: s.variants.map((v) => ({ id: v.id, version: v.version, colour: v.colour, colourFamily: v.colourFamily, handle: v.handle, sku: v.sku, price: v.price, mrp: v.mrp, sizes: v.sizes, photos: v.photos, status: v.status })),
    }, now);
    for (const c of colours) expect((await deps.store.getRecord(c.id))!.soldOutHold).toBe(true);
    // The style editor can't switch it by sending the field (unknown field).
    const again = (await getStyle(deps, styleId, true))!;
    await expect(saveStyle(deps, styleId, { baseTitle: again.baseTitle, ...again.shared, variants: again.variants.map((v) => ({ id: v.id, version: v.version, colour: v.colour, colourFamily: v.colourFamily, handle: v.handle, sku: v.sku, price: v.price, mrp: v.mrp, sizes: v.sizes, photos: v.photos, status: v.status, soldOutHold: false })) }, now)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("Show as sold out: the storefront inventory", () => {
  function fakeInventory(held: Set<string>) {
    const reserve = vi.fn(async () => {});
    const inner = {
      available: async () => 7,
      reserve,
      commit: async () => {},
      release: async () => {},
      isHeld: async (ref: string) => held.has(ref),
      restock: async () => {},
      adjust: async () => 7,
      snapshot: async () => [{ productId: "p_held", size: "M", onHand: 7, held: 0, available: 7 }],
    } satisfies CommerceAdapter["inventory"];
    return { inner, reserve };
  }

  it("sells nothing of a held product; others and admin reads are untouched", async () => {
    const { inner, reserve } = fakeInventory(new Set());
    const inv = holdInventory(inner, async (id) => id === "p_held");
    expect(await inv.available("p_held", "M")).toBe(0);
    expect(await inv.available("p_other", "M")).toBe(7);
    await expect(inv.reserve("chk_1", [{ productId: "p_other", size: "M", quantity: 1 }, { productId: "p_held", size: "M", quantity: 1 }], 60_000)).rejects.toBeInstanceOf(CommerceError);
    expect(reserve).not.toHaveBeenCalled();
    await inv.reserve("chk_2", [{ productId: "p_other", size: "M", quantity: 1 }], 60_000);
    expect(reserve).toHaveBeenCalledTimes(1);
    expect((await inv.snapshot())[0].available).toBe(7);
    expect(await inv.adjust("p_held", "M", 1)).toBe(7);
  });

  it("a checkout that already holds its units (switched on mid-payment) isn't broken", async () => {
    const { inner, reserve } = fakeInventory(new Set(["chk_live"]));
    const inv = holdInventory(inner, async () => true);
    await inv.reserve("chk_live", [{ productId: "p_held", size: "M", quantity: 1 }], 60_000);
    expect(reserve).toHaveBeenCalledTimes(1);
  });
});

describe("Show as sold out: demand counts", () => {
  it("counts waiting per size and already-notified back-in-stock alerts; no customer data", async () => {
    const alerts = createMemoryAlertStore();
    const base = { productId: "p1", kind: "back_in_stock" as const, priceAtSet: 100 };
    await alerts.create({ ...base, customerId: "c1", size: "M" });
    await alerts.create({ ...base, customerId: "c2", size: "M" });
    const fired = await alerts.create({ ...base, customerId: "c3", size: "L" });
    await alerts.fire(fired.id);
    await alerts.create({ ...base, customerId: "c4", size: null, kind: "price_drop" });
    await alerts.create({ ...base, customerId: "c5", size: "S", productId: "p2" });
    const d = await demandFor(alerts, ["p1", "p3"]);
    expect(d).toEqual({ p1: { waiting: 2, bySize: { M: 2 }, notified: 1 }, p3: { waiting: 0, bySize: {}, notified: 0 } });
    expect(JSON.stringify(d)).not.toMatch(/c[1-5]/);
    expect(await demandFor(alerts, [])).toEqual({});
  });
});
