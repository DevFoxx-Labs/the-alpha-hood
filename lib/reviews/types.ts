import type { ProductImage } from "@/lib/commerce/types";

/** PDP-08 reviews. Provider pending (Judge.me / Okendo / own — PRD §9); the storefront uses this interface. */
export type FitVote = "small" | "true" | "large";

export interface Review {
  id: string;
  styleId: string;
  category: string;
  /** Colour variant the reviewer bought. */
  productHandle: string;
  rating: 1 | 2 | 3 | 4 | 5;
  title: string;
  body: string;
  author: string;
  size: string;
  fit: FitVote;
  photos: Pick<ProductImage, "art" | "colour" | "alt">[];
  /** Only verified purchasers can review (PDP-08); kept explicit for imported reviews. */
  verified: boolean;
  createdAt: string;
  helpful: number;
}

export interface ReviewSummary {
  average: number;
  count: number;
  /** Percent per star, index 0 = 5★ … 4 = 1★ (sums to ~100). */
  distribution: [number, number, number, number, number];
  /** 0 = runs small, 0.5 = true to size, 1 = runs large; null when no fit votes. */
  fit: number | null;
  /** Share of fit votes saying "true to size" (0–100). */
  trueToSizePct: number | null;
  withPhotos: number;
  sizes: string[];
}

export interface ReviewQuery {
  rating?: number;
  withPhotos?: boolean;
  size?: string;
  sort: "recent" | "helpful";
  page: number;
}

export interface ReviewPage {
  reviews: Review[];
  total: number;
  pageSize: number;
}

export interface ReviewsAdapter {
  /** Summary for a style; falls back to the category when the style has no reviews. */
  summary(styleId: string, category: string): Promise<{ summary: ReviewSummary; scope: "style" | "category" } | null>;
  list(target: { styleId: string } | { category: string }, query: ReviewQuery): Promise<ReviewPage>;
  /** One helpful vote per voter per review; returns the new count, or null if already voted / unknown. */
  voteHelpful(reviewId: string, voterId: string): Promise<number | null>;
}
