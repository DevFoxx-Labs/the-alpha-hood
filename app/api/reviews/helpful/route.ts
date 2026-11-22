import { NextResponse } from "next/server";
import { setVisitorCookie, visitorFrom } from "@/lib/consent/visitor";
import { errorResponse, guardPublicWrite, jsonError, PRIVATE_NO_STORE } from "@/lib/http/guard";
import { reviews } from "@/lib/reviews";
import { asObject, rejectUnknownFields } from "@/lib/validation";

const REVIEW_RE = /^rv_style_[0-9]{1,6}_[0-9]{1,6}$|^rv_[a-z0-9_]{1,64}$/;

/**
 * PDP-08 "Helpful" vote. Body `{ reviewId }`. One vote per browser (visitor cookie) per review; per-IP
 * rate limit stops vote stuffing from one connection. Votes can't be negative or set to a value.
 */
export async function POST(request: Request) {
  const guard = await guardPublicWrite(request, { name: "review-helpful", limit: 30, windowMs: 10 * 60_000, maxBytes: 256 });
  if (!guard.ok) return guard.response;

  try {
    const input = asObject(guard.body);
    rejectUnknownFields(input, ["reviewId"]);
    const reviewId = input.reviewId;
    if (typeof reviewId !== "string" || !REVIEW_RE.test(reviewId)) return jsonError(422, "invalid_input", "Unknown review.");

    const visitor = visitorFrom(request);
    const count = await reviews.voteHelpful(reviewId, visitor.id);
    const response =
      count === null
        ? NextResponse.json({ ok: false, reason: "already_voted_or_unknown" }, { status: 409, headers: PRIVATE_NO_STORE })
        : NextResponse.json({ ok: true, helpful: count }, { headers: PRIVATE_NO_STORE });
    if (visitor.isNew) setVisitorCookie(response, visitor.id);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
