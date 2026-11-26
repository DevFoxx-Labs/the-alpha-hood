import { ValidationError } from "@/lib/http/guard";
import { ORDER_NUMBER_RE } from "@/lib/checkout/parse";
import { type OrderStore, resolveOrders } from "@/lib/orders/store";
import { asObject, cleanText, rejectUnknownFields } from "@/lib/validation";
import { resolveSubmissions, type Submission, type SubmissionStore } from "./store";

/**
 * Help & feedback from signed-in customers: a topic, an optional order of theirs, an optional 1–5 experience rating
 * and a message. Support answers in the admin; the answer shows in the customer's account. Open → resolved.
 * (Privacy / DPDP requests have their own inbox with legal deadlines: /privacy/request.)
 */
export const FEEDBACK_TOPICS = {
  order: "An order or delivery",
  product: "A product",
  returns: "Returns, refunds or exchanges",
  payment: "Payment",
  website: "The website or app",
  suggestion: "A suggestion",
  other: "Something else",
} as const;
export type FeedbackTopic = keyof typeof FEEDBACK_TOPICS;
export type FeedbackStatus = "open" | "resolved";

export interface FeedbackDoc {
  topic: FeedbackTopic;
  orderNumber: string | null;
  rating: number | null;
  message: string;
  reply?: string;
  repliedAt?: string;
  repliedBy?: string;
}

export class FeedbackError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "FeedbackError";
  }
}

export const MAX_OPEN_FEEDBACK = 10;

export async function sendFeedback(customerId: string, body: unknown, d: { submissions?: SubmissionStore; orders?: Pick<OrderStore, "get"> } = {}): Promise<Submission<FeedbackDoc>> {
  const submissions = d.submissions ?? resolveSubmissions();
  const input = asObject(body);
  rejectUnknownFields(input, ["topic", "orderNumber", "rating", "message"]);
  if (typeof input.topic !== "string" || !Object.hasOwn(FEEDBACK_TOPICS, input.topic)) throw new ValidationError("Choose what it's about.");
  let orderNumber: string | null = null;
  if (input.orderNumber !== undefined && input.orderNumber !== "") {
    const n = typeof input.orderNumber === "string" ? input.orderNumber.trim().toUpperCase() : "";
    const order = ORDER_NUMBER_RE.test(n) ? await (d.orders ?? resolveOrders()).get(n) : null;
    // Only the customer's own orders can be referenced (someone else's = not found).
    if (!order || order.customerId !== customerId) throw new ValidationError("That order number isn't one of your orders.");
    orderNumber = n;
  }
  let rating: number | null = null;
  if (input.rating !== undefined && input.rating !== null) {
    if (typeof input.rating !== "number" || !Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) throw new ValidationError("Choose a rating from 1 to 5, or none.");
    rating = input.rating;
  }
  const message = cleanText(input.message, "Message", { min: 10, max: 2000, multiline: true });
  const open = (await submissions.listByCustomer<FeedbackDoc>("feedback", customerId)).filter((s) => s.status === "open").length;
  if (open >= MAX_OPEN_FEEDBACK) throw new FeedbackError(429, "too_many", "You have several open messages. We'll reply to those first.");
  return submissions.create<FeedbackDoc>({ kind: "feedback", customerId, status: "open", uniqueKey: null, doc: { topic: input.topic as FeedbackTopic, orderNumber, rating, message } });
}

/** Staff reply / close (permission `feedback.manage`). */
export async function answerFeedback(id: string, body: unknown, staffId: string, d: { submissions?: SubmissionStore } = {}) {
  const submissions = d.submissions ?? resolveSubmissions();
  const input = asObject(body);
  rejectUnknownFields(input, ["reply", "status"]);
  const s = /^sub_[a-f0-9]{24}$/.test(id) ? await submissions.get<FeedbackDoc>(id) : null;
  if (!s || s.kind !== "feedback") throw new FeedbackError(404, "not_found", "Message not found.");
  const status: FeedbackStatus = input.status === "open" ? "open" : "resolved";
  const reply = input.reply === undefined || input.reply === "" ? s.doc.reply : cleanText(input.reply, "Reply", { min: 2, max: 2000, multiline: true });
  const doc: FeedbackDoc = { ...s.doc, ...(reply !== s.doc.reply ? { reply, repliedAt: new Date().toISOString(), repliedBy: staffId } : {}) };
  const next = await submissions.update<FeedbackDoc>(id, ["open", "resolved"], status, doc);
  if (!next) throw new FeedbackError(409, "busy", "This message just changed. Reload and try again.");
  return next;
}

export function publicFeedback(s: Submission<FeedbackDoc>) {
  return { id: s.id, status: s.status as FeedbackStatus, createdAt: s.createdAt, topic: s.doc.topic, topicLabel: FEEDBACK_TOPICS[s.doc.topic], orderNumber: s.doc.orderNumber, rating: s.doc.rating, message: s.doc.message, reply: s.doc.reply ?? null, repliedAt: s.doc.repliedAt ?? null };
}
