import { MOCK_REVIEWS } from "@/lib/commerce/mock/data";
import { BackendUnavailableError, devSingleton, type Env, mockDataAllowed } from "@/lib/mock-guard";
import { queryReviews, summarise } from "./summary";
import type { Review, ReviewsAdapter } from "./types";

/**
 * Reviews adapter (PDP-08). Mock = DEMO reviews + in-memory helpful votes, refused in production
 * (fake reviews must never reach the live store — consumer law, PRD §14).
 */
export function createMockReviews(reviews: Review[] = MOCK_REVIEWS): ReviewsAdapter {
  const votes = new Map<string, Set<string>>();
  const helpfulOf = (r: Review) => r.helpful + (votes.get(r.id)?.size ?? 0);
  const byStyle = (styleId: string) => reviews.filter((r) => r.styleId === styleId);
  const byCategory = (category: string) => reviews.filter((r) => r.category === category);

  return {
    async summary(styleId, category) {
      const own = summarise(byStyle(styleId));
      if (own) return { summary: own, scope: "style" };
      const cat = summarise(byCategory(category));
      return cat ? { summary: cat, scope: "category" } : null;
    },
    async list(target, query) {
      const pool = "styleId" in target ? byStyle(target.styleId) : byCategory(target.category);
      return queryReviews(pool, query, helpfulOf);
    },
    async voteHelpful(reviewId, voterId) {
      const review = reviews.find((r) => r.id === reviewId);
      if (!review) return null;
      const set = votes.get(reviewId) ?? new Set<string>();
      if (set.has(voterId)) return null;
      set.add(voterId);
      votes.set(reviewId, set);
      return helpfulOf(review);
    },
  };
}

function refusingReviews(): ReviewsAdapter {
  const fail = async (): Promise<never> => {
    throw new BackendUnavailableError("Reviews");
  };
  return { summary: fail, list: fail, voteHelpful: fail };
}

export function resolveReviews(env: Env = process.env): ReviewsAdapter {
  return mockDataAllowed(env) ? devSingleton("reviews", () => createMockReviews()) : refusingReviews();
}

export const reviews = resolveReviews();
