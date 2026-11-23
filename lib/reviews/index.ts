import { MOCK_REVIEWS } from "@/lib/commerce/mock/data";
import { dbStores } from "@/lib/db";
import { BackendUnavailableError, devSingleton, type Env, mockDataAllowed } from "@/lib/mock-guard";
import { createMemoryReviewStore, reviewsFromStore } from "./store";
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

export function resolveReviews(env: Env = process.env): ReviewsAdapter {
  const db = env.COMMERCE_PROVIDER === "own" ? dbStores(env) : null;
  if (db) return db.reviews;
  return mockDataAllowed(env) ? devSingleton("reviews", () => createMockReviews()) : refusingReviews();
}

/** Resolved on each call so it follows the current environment (like `commerce`). */
export const reviews: ReviewsAdapter = {
  summary: (...a) => resolveReviews().summary(...a),
  list: (...a) => resolveReviews().list(...a),
  voteHelpful: (...a) => resolveReviews().voteHelpful(...a),
};
