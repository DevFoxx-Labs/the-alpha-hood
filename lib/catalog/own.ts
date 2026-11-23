import type { ReviewStore } from "@/lib/reviews/store";
import { type CatalogReader, type CatalogSnapshot, createCatalogReader } from "./reader";
import { buildSnapshot, type CatalogStore } from "./store";

/**
 * The own-backend catalogue reader: assembles the storefront snapshot from the database and keeps it in memory
 * for a few seconds (every listing, filter and search runs on the snapshot, not per-request queries). Admin writes
 * call `invalidate()` on this server; other servers pick changes up within `ttlMs`. Page-level caches are
 * refreshed with `revalidateTag("catalog")` by the admin routes.
 */
export function createOwnCatalog(store: CatalogStore, reviews: ReviewStore, opts: { ttlMs?: number; now?: () => number } = {}) {
  const ttl = opts.ttlMs ?? 10_000;
  const now = opts.now ?? Date.now;
  let cached: { snap: CatalogSnapshot; at: number } | null = null;
  let inflight: Promise<CatalogSnapshot> | null = null;
  let generation = 0;

  async function build(): Promise<CatalogSnapshot> {
    const [records, docs, onHand, ratings] = await Promise.all([store.listRecords(), store.getDocs(), store.onHand(), reviews.ratings()]);
    return buildSnapshot(records, docs, onHand, ratings, now());
  }

  function load(): Promise<CatalogSnapshot> | CatalogSnapshot {
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

  const reader: CatalogReader = createCatalogReader(load);
  return {
    reader,
    invalidate() {
      generation++;
      cached = null;
      inflight = null;
    },
  };
}
