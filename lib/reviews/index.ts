import { MOCK_REVIEWS } from "@/lib/commerce/mock/data";
import { dbStores } from "@/lib/db";
import { BackendUnavailableError, devSingleton, type Env, mockDataAllowed } from "@/lib/mock-guard";
import { createMemoryReviewStore, type ReviewStore, reviewsFromStore } from "./store";
import type { Review, ReviewsAdapter } from "./types";

/**
 * Reviews adapter (PDP-08).
 * - Own backend (`COMMERCE_PROVIDER=own` + a database): reviews in the database. Production starts empty — demo
 *   reviews are only ever seeded into local `_dev` / `_test` databases (fake reviews must never reach the live
 *   store — consumer law, PRD §14).
 * - Otherwise: DEMO reviews + in-memory helpful votes in dev, refused in production.
 */
export function createMockReviews(reviews: Review[] = MOCK_REVIEWS): ReviewsAdapter {
  return reviewsFromStore(createMemoryReviewStore(reviews));
}

function refusingReviews(): ReviewsAdapter {
  const fail = async (): Promise<never> => {
    throw new BackendUnavailableError("Reviews");
  };
  return { summary: fail, list: fail, voteHelpful: fail };
}

/** The store the product pages read reviews from — also where approved customer reviews are published. */
export function resolveReviewStore(env: Env = process.env): ReviewStore | null {
  const db = env.COMMERCE_PROVIDER === "own" ? dbStores(env) : null;
  if (db) return db.reviewStore;
  return mockDataAllowed(env) ? devSingleton("review_store", () => createMemoryReviewStore(MOCK_REVIEWS)) : null;
}

export function resolveReviews(env: Env = process.env): ReviewsAdapter {
  const store = resolveReviewStore(env);
  return store ? reviewsFromStore(store) : refusingReviews();
}

/** Resolved on each call so it follows the current environment (like `commerce`). */
export const reviews: ReviewsAdapter = {
  summary: (...a) => resolveReviews().summary(...a),
  list: (...a) => resolveReviews().list(...a),
  voteHelpful: (...a) => resolveReviews().voteHelpful(...a),
};
