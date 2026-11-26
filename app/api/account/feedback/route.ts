import { commerceErrorResponse, privateJson, requireAccount } from "@/lib/http/commerce-http";
import { clientIp, guardPublicWrite, jsonError } from "@/lib/http/guard";
import { rateLimiter } from "@/lib/http/rate-limit";
import { FEEDBACK_TOPICS, type FeedbackDoc, publicFeedback, sendFeedback } from "@/lib/submissions/feedback";
import { submissionError } from "@/lib/submissions/http";
import { resolveSubmissions } from "@/lib/submissions/store";

/** GET → your messages to the store and our replies (+ the topic list). POST `{ topic, orderNumber?, rating?, message }`. */
export async function GET(request: Request) {
  const rl = await rateLimiter.hit(`account-read:ip:${clientIp(request)}`, 60, 60_000);
  if (!rl.ok) return jsonError(429, "rate_limited", "Too many requests.");
  const auth = await requireAccount(request);
  if (!auth.ok) return auth.response;
  try {
    const mine = await resolveSubmissions().listByCustomer<FeedbackDoc>("feedback", auth.customerId);
    return privateJson({ messages: mine.map(publicFeedback), topics: Object.entries(FEEDBACK_TOPICS).map(([value, label]) => ({ value, label })) });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const guard = await guardPublicWrite(request, { name: "feedback", limit: 5, windowMs: 10 * 60_000, maxBytes: 4_096 });
  if (!guard.ok) return guard.response;
  const auth = await requireAccount(request);
  if (!auth.ok) return auth.response;
  const daily = await rateLimiter.hit(`feedback:cus:${auth.customerId}`, 10, 86_400_000);
  if (!daily.ok) return jsonError(429, "rate_limited", "Too many messages today. We'll reply to your earlier ones first.");
  try {
    return privateJson({ message: publicFeedback(await sendFeedback(auth.customerId, guard.body)) }, { status: 201 });
  } catch (error) {
    return submissionError(error);
  }
}
