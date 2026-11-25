import { describe, expect, it } from "vitest";
import { DEMO_SNAPSHOT } from "@/lib/commerce/mock";
import { MOCK_NOW } from "@/lib/commerce/mock/data";
import { createMemoryReviewStore } from "@/lib/reviews/store";
import { seedDemoCatalog } from "./seed";
import { createMemoryCatalogStore } from "./store";

const now = new Date(MOCK_NOW);
const photographed = DEMO_SNAPSHOT.products.find((p) => p.images.some((i) => i.url?.startsWith("/demo/products/")))!;

describe("demo seed", () => {
  it("re-seeding brings new demo photos to an already-seeded product, once", async () => {
    const catalog = createMemoryCatalogStore();
    const stores = { catalog, reviewStore: createMemoryReviewStore() };
    await seedDemoCatalog(stores, () => {}, now);
    // An older seed: drawings only.
    const old = (await catalog.getRecord(photographed.id))!;
    await catalog.replace({ ...old, images: old.images.filter((i) => !i.url), version: old.version + 1 }, old.version);
    const again = await seedDemoCatalog(stores, () => {}, now);
    expect(again).toMatchObject({ products: 0, images: 1 });
    expect((await catalog.getRecord(photographed.id))!.images).toEqual(photographed.images);
    expect(await seedDemoCatalog(stores, () => {}, now)).toMatchObject({ products: 0, images: 0 });
  });

  it("never touches a product that has staff-uploaded photos", async () => {
    const catalog = createMemoryCatalogStore();
    const stores = { catalog, reviewStore: createMemoryReviewStore() };
    await seedDemoCatalog(stores, () => {}, now);
    const rec = (await catalog.getRecord(photographed.id))!;
    const mine = [{ url: `/api/media/med_${"a".repeat(32)}`, alt: "Staff photo", art: rec.images[0].art, colour: rec.images[0].colour }];
    await catalog.replace({ ...rec, images: mine, version: rec.version + 1 }, rec.version);
    expect(await seedDemoCatalog(stores, () => {}, now)).toMatchObject({ images: 0 });
    expect((await catalog.getRecord(photographed.id))!.images).toEqual(mine);
  });

  it("refuses to run when the guard refuses (live database)", async () => {
    const stores = { catalog: createMemoryCatalogStore(), reviewStore: createMemoryReviewStore() };
    await expect(seedDemoCatalog(stores, () => { throw new Error("not a local database"); }, now)).rejects.toThrow(/local/);
  });
});
