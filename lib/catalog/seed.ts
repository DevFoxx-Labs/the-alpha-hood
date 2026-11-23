import { DEMO_SNAPSHOT } from "@/lib/commerce/mock";
import { MOCK_REVIEWS } from "@/lib/commerce/mock/data";
import type { ReviewStore } from "@/lib/reviews/store";
import { CatalogConflictError, type CatalogStore, recordFromProduct } from "./store";

/**
 * Seeds the DEMO catalogue (products, category tree, homepage rail, collections, demo reviews) into a database.
 * Demo products and fake reviews must never reach a live store, so the caller passes a guard that has already
 * checked the target is a local `_dev` / `_test` database (`assertDestructiveAllowed`). Idempotent: existing
 * products, documents and reviews are left as they are.
 */
export async function seedDemoCatalog(stores: { catalog: CatalogStore; reviewStore: ReviewStore }, guard: () => void, now = new Date()) {
  guard();
  let products = 0;
  for (const p of DEMO_SNAPSHOT.products) {
    try {
      await stores.catalog.insert(recordFromProduct(p, now));
      products++;
    } catch (e) {
      if (!(e instanceof CatalogConflictError)) throw e;
    }
  }
  if (!(await stores.catalog.getDocs())) {
    await stores.catalog.putDocs({ tree: DEMO_SNAPSHOT.tree, featured: DEMO_SNAPSHOT.featured, collections: DEMO_SNAPSHOT.collections });
  }
  await stores.reviewStore.insertMany(MOCK_REVIEWS);
  return { products, reviews: MOCK_REVIEWS.length };
}
