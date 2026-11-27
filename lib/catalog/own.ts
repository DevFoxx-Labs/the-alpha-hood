import type { ReviewStore } from "@/lib/reviews/store";
import { type CatalogReader, type CatalogSnapshot, createCatalogReader } from "./reader";
import { buildSnapshot, type CatalogStore } from "./store";

/**
 * The own-backend catalogue reader: assembles the storefront snapshot from the database and keeps it in memory
 * for a few seconds (every listing, filter and search runs on the snapshot, not per-request queries). Admin writes
 * call `invalidate()` on this server; other servers pick changes up within `ttlMs`. Page-level caches are
 * refreshed with `revalidateTag("catalog")` by the admin routes.
 *
 * One database read gives two views: `reader` (the storefront: products on "Show as sold out" show 0 per size) and
 * `stockReader` (the real numbers, for the inventory — it seeds a new SKU from them and Admin → Inventory lists them).
 */
interface Snapshots {
  store: CatalogSnapshot;
  raw: CatalogSnapshot;
}

export function createOwnCatalog(store: CatalogStore, reviews: ReviewStore, opts: { ttlMs?: number; now?: () => number } = {}) {
  const ttl = opts.ttlMs ?? 10_000;
  const now = opts.now ?? Date.now;
  let cached: { snap: Snapshots; at: number } | null = null;
  let inflight: Promise<Snapshots> | null = null;
  let generation = 0;

  async function build(): Promise<Snapshots> {
    const [records, docs, onHand, ratings] = await Promise.all([store.listRecords(), store.getDocs(), store.onHand(), reviews.ratings()]);
    const at = now();
    return { store: buildSnapshot(records, docs, onHand, ratings, at), raw: buildSnapshot(records, docs, onHand, ratings, at, { raw: true }) };
  }

  function load(): Promise<Snapshots> | Snapshots {
    if (cached && now() - cached.at < ttl) return cached.snap;
    if (inflight) return inflight;
    const gen = generation;
    inflight = build()
      .then((snap) => {
        if (gen === generation) cached = { snap, at: now() };
        return snap;
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  }

  const pick = (k: keyof Snapshots) => () => {
    const s = load();
    return s instanceof Promise ? s.then((x) => x[k]) : s[k];
  };
  const reader: CatalogReader = createCatalogReader(pick("store"));
  const stockReader: CatalogReader = createCatalogReader(pick("raw"));
  return {
    reader,
    stockReader,
    /** True when this live product is on "Show as sold out" (read from the same snapshot the store shows). */
    async isHeld(productId: string): Promise<boolean> {
      return (await load()).store.held?.has(productId) ?? false;
    },
    invalidate() {
      generation++;
      cached = null;
      inflight = null;
    },
  };
}
