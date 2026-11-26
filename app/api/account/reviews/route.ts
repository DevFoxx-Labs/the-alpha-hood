import { commerceErrorResponse, privateJson, requireAccount } from "@/lib/http/commerce-http";
import { clientIp, guardPublicWrite, jsonError } from "@/lib/http/guard";
import { rateLimiter } from "@/lib/http/rate-limit";
import { submissionError } from "@/lib/submissions/http";
import { publicReview, type ReviewDoc, reviewable, submitReview } from "@/lib/submissions/reviews";
import { resolveSubmissions } from "@/lib/submissions/store";

/**
 * GET /api/account/reviews → the customer's own reviews (with status) and the delivered products still to review.
 * POST `{ orderNumber, lineId, rating, title, body, fit }` → a new review, checked by staff before it is shown.
 */
export async function GET(request: Request) {
  const rl = await rateLimiter.hit(`account-read:ip:${clientIp(request)}`, 60, 60_000);
  if (!rl.ok) return jsonError(429, "rate_limited", "Too many requests.");
  const auth = await requireAccount(request);
  if (!auth.ok) return auth.response;
  try {
    const [mine, toReview] = await Promise.all([resolveSubmissions().listByCustomer<ReviewDoc>("review", auth.customerId), reviewable(auth.customerId)]);
    return privateJson({ reviews: mine.map(publicReview), toReview });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const guard = await guardPublicWrite(request, { name: "review-write", limit: 10, windowMs: 10 * 60_000, maxBytes: 4_096 });
  if (!guard.ok) return guard.response;
  const auth = await requireAccount(request);
  if (!auth.ok) return auth.response;
  const daily = await rateLimiter.hit(`review-write:cus:${auth.customerId}`, 20, 86_400_000);
  if (!daily.ok) return jsonError(429, "rate_limited", "Too many reviews today.");
  try {
    return privateJson({ review: publicReview(await submitReview(auth.customerId, guard.body)) }, { status: 201 });
  } catch (error) {
    return submissionError(error);
  }
}
