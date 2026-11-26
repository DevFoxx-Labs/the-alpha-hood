import { commerceErrorResponse } from "@/lib/http/commerce-http";
import { jsonError } from "@/lib/http/guard";
import { FeedbackError } from "./feedback";
import { ReviewError } from "./reviews";

/** Maps review / feedback errors to responses; everything else goes through the shared handler. */
export function submissionError(error: unknown): Response {
  if (error instanceof ReviewError || error instanceof FeedbackError) return jsonError(error.status, error.code, error.message);
  return commerceErrorResponse(error);
}
