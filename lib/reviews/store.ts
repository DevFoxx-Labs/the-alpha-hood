import { queryReviews, summarise } from "./summary";
import type { Review, ReviewsAdapter } from "./types";

/**
 * Review persistence behind the ReviewsAdapter. The adapter rules (style → category fallback, filters, sort,
 * paging, one helpful vote per voter) live once in `reviewsFromStore`, used by the demo and own-backend stores.
 */
export interface ReviewStore {
  byStyle(styleId: string): Promise<Review[]>;
  byCategory(category: string): Promise<Review[]>;
  /** Records one vote per (review, voter) and returns the new helpful count; null if already voted / unknown. */
  vote(reviewId: string, voterId: string): Promise<number | null>;
  /** Average + count per style (product cards and the product page header). */
  ratings(): Promise<Map<string, { average: number; count: number }>>;
  insertMany(reviews: Review[]): Promise<void>;
  /** Removes one review and its helpful votes (a customer deleted or edited it, or erased their account). */
  remove(id: string): Promise<boolean>;
  /** How many reviews have an id starting with `prefix` (go-live check: demo reviews are `rv_style_…`). */
  countByIdPrefix(prefix: string): Promise<number>;
}

export function reviewsFromStore(store: ReviewStore): ReviewsAdapter {
  return {
    async summary(styleId, category) {
      const own = summarise(await store.byStyle(styleId));
      if (own) return { summary: own, scope: "style" };
      const cat = summarise(await store.byCategory(category));
      return cat ? { summary: cat, scope: "category" } : null;
    },
    async list(target, query) {
      const pool = "styleId" in target ? await store.byStyle(target.styleId) : await store.byCategory(target.category);
      return queryReviews(pool, query);
    },
    voteHelpful: (reviewId, voterId) => store.vote(reviewId, voterId),
  };
}

/** Same rounding as `summarise` so the card rating matches the product page. */
export const roundAverage = (sum: number, n: number) => Math.round((sum / n) * 10) / 10;

export function createMemoryReviewStore(initial: Review[] = []): ReviewStore {
  const reviews = initial.map((r) => ({ ...r }));
  const votes = new Map<string, Set<string>>();
  return {
    async byStyle(styleId) {
      return reviews.filter((r) => r.styleId === styleId).map((r) => ({ ...r }));
    },
    async byCategory(category) {
      return reviews.filter((r) => r.category === category).map((r) => ({ ...r }));
    },
    async vote(reviewId, voterId) {
      const review = reviews.find((r) => r.id === reviewId);
      if (!review) return null;
      const set = votes.get(reviewId) ?? new Set<string>();
      if (set.has(voterId)) return null;
      set.add(voterId);
      votes.set(reviewId, set);
      review.helpful += 1;
      return review.helpful;
    },
    async ratings() {
      const acc = new Map<string, { sum: number; n: number }>();
      for (const r of reviews) {
        const a = acc.get(r.styleId) ?? { sum: 0, n: 0 };
        a.sum += r.rating;
        a.n += 1;
        acc.set(r.styleId, a);
      }
      return new Map([...acc].map(([k, a]) => [k, { average: roundAverage(a.sum, a.n), count: a.n }]));
    },
    async insertMany(list) {
      const have = new Set(reviews.map((r) => r.id));
      for (const r of list) if (!have.has(r.id)) reviews.push({ ...r });
    },
    async remove(id) {
      const i = reviews.findIndex((r) => r.id === id);
      if (i < 0) return false;
      reviews.splice(i, 1);
      votes.delete(id);
      return true;
    },
    async countByIdPrefix(prefix) {
      return reviews.filter((r) => r.id.startsWith(prefix)).length;
    },
  };
}
