import type { Review, ReviewPage, ReviewQuery, ReviewSummary } from "./types";

/** Pure review maths shared by every adapter (summary, filters, sort, paging). */
export const REVIEW_PAGE_SIZE = 5;

export function summarise(reviews: Review[]): ReviewSummary | null {
  if (reviews.length === 0) return null;
  const counts = [0, 0, 0, 0, 0];
  let sum = 0;
  let fitSum = 0;
  let fitN = 0;
  let trueN = 0;
  for (const r of reviews) {
    counts[5 - r.rating] += 1;
    sum += r.rating;
    fitSum += r.fit === "small" ? 0 : r.fit === "large" ? 1 : 0.5;
    fitN += 1;
    if (r.fit === "true") trueN += 1;
  }
  const n = reviews.length;
  return {
    average: Math.round((sum / n) * 10) / 10,
    count: n,
    distribution: counts.map((c) => Math.round((c / n) * 100)) as ReviewSummary["distribution"],
    fit: fitN ? Math.round((fitSum / fitN) * 100) / 100 : null,
    trueToSizePct: fitN ? Math.round((trueN / fitN) * 100) : null,
    withPhotos: reviews.filter((r) => r.photos.length > 0).length,
    sizes: [...new Set(reviews.map((r) => r.size))],
  };
}

export function queryReviews(reviews: Review[], q: ReviewQuery, helpfulOf: (r: Review) => number = (r) => r.helpful): ReviewPage {
  const filtered = reviews.filter(
    (r) =>
      (!q.rating || r.rating === q.rating) &&
      (!q.withPhotos || r.photos.length > 0) &&
      (!q.size || r.size === q.size),
  );
  const sorted = [...filtered].sort((a, b) =>
    q.sort === "helpful"
      ? helpfulOf(b) - helpfulOf(a) || b.createdAt.localeCompare(a.createdAt)
      : b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
  );
  const page = Math.min(Math.max(1, Math.trunc(q.page)), 50);
  return {
    reviews: sorted.slice(0, page * REVIEW_PAGE_SIZE).map((r) => ({ ...r, helpful: helpfulOf(r) })),
    total: filtered.length,
    pageSize: REVIEW_PAGE_SIZE,
  };
}

/** Strict parse of review list params (API + page). */
export function parseReviewQuery(params: URLSearchParams): ReviewQuery {
  const rating = Number(params.get("rating"));
  const size = params.get("size") ?? "";
  const page = Number(params.get("page"));
  return {
    rating: Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : undefined,
    withPhotos: params.get("photos") === "1",
    size: /^[A-Za-z0-9 ]{1,12}$/.test(size) ? size : undefined,
    sort: params.get("sort") === "helpful" ? "helpful" : "recent",
    page: Number.isInteger(page) && page > 0 ? Math.min(page, 50) : 1,
  };
}
