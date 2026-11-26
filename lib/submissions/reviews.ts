import { commerce } from "@/lib/commerce";
import type { CommerceAdapter } from "@/lib/commerce/types";
import { type CustomerStore, resolveCustomers } from "@/lib/customers/store";
import { resolveReviewStore } from "@/lib/reviews";
import { ValidationError } from "@/lib/http/guard";
import { type OrderStore, resolveOrders } from "@/lib/orders/store";
import type { ReviewStore } from "@/lib/reviews/store";
import type { FitVote, Review } from "@/lib/reviews/types";
import { asObject, cleanText, rejectUnknownFields } from "@/lib/validation";
import { randomBytes } from "node:crypto";
import { imageSize, type MediaStore, mediaUrl, resolveMedia } from "@/lib/catalog/media";
import { notify as queueNotification } from "@/lib/notify/outbox";
import { isPhotoId, type PhotoStore, resolvePhotos } from "@/lib/returns/photos";
import { resolveSubmissions, type Submission, SubmissionConflictError, type SubmissionStore } from "./store";

/**
 * Customer product reviews (PDP-08 "Write a review"): only for products the customer received (verified purchase),
 * one review per product per customer, checked by staff before it is shown (consumer-law rule: no fake or
 * unmoderated reviews). Approved reviews are written to the reviews the product pages already read; editing or
 * deleting one takes it off the page again until it is re-approved.
 * Shown name: first name + initial of the last name ("Asha K."), or "Verified buyer". Never the phone or email.
 *
 * Photos (up to 3): uploaded to the customer's PRIVATE photo store (sniffed JPEG / PNG, metadata stripped), attached
 * to this review only (a return photo can't be reused, and vice versa), seen by staff during the check, and copied to
 * the public photo store only when the review is approved.
 * Store reply: staff can answer a published review in public; the customer is emailed (Notifications → Reviews).
 */
export const MAX_REVIEW_PHOTOS = 3;
export type ReviewStatus = "pending" | "published" | "rejected";

export interface ReviewDoc {
  orderNumber: string;
  lineId: string;
  productId: string;
  productHandle: string;
  productTitle: string;
  styleId: string;
  category: string;
  size: string;
  image: { art: string; colour: string; alt: string };
  rating: 1 | 2 | 3 | 4 | 5;
  title: string;
  body: string;
  fit: FitVote;
  author: string;
  /** Private photo ids (owner-scoped), in the order the customer chose. */
  photoIds?: string[];
  /** Public copies made on approval (served from /api/media/<id>). */
  mediaIds?: string[];
  /** The store's public reply. */
  reply?: { text: string; at: string; by: string } | null;
  /** Set when staff reject it (shown to the customer). */
  rejectReason?: string;
  publishedReviewId?: string;
  decidedBy?: string;
}

export class ReviewError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ReviewError";
  }
}

export interface ReviewDeps {
  submissions?: SubmissionStore;
  orders?: Pick<OrderStore, "get" | "listByCustomer">;
  customers?: Pick<CustomerStore, "get">;
  catalog?: Pick<CommerceAdapter, "getProductById">;
  /** Where approved reviews are published (the product pages read it). */
  published?: Pick<ReviewStore, "insertMany" | "remove" | "setReply"> | null;
  photos?: PhotoStore;
  media?: MediaStore | null;
  /** Queues a customer notification (default: the outbox). */
  notify?: (customerId: string, template: "review_published" | "review_rejected" | "review_replied", refs: Record<string, string>) => Promise<unknown>;
}

const deps = (d: ReviewDeps) => ({
  submissions: d.submissions ?? resolveSubmissions(),
  orders: d.orders ?? resolveOrders(),
  customers: d.customers ?? resolveCustomers(),
  catalog: d.catalog ?? commerce,
  published: d.published === undefined ? resolveReviewStore() : d.published,
  photos: d.photos ?? resolvePhotos(),
  media: d.media === undefined ? resolveMedia() : d.media,
  notify: d.notify ?? ((c: string, t: "review_published" | "review_rejected" | "review_replied", r: Record<string, string>) => queueNotification(c, t, r)),
});

const attachKey = (submissionId: string) => `rv:${submissionId}`;

/** The public copies of a review's photos come off the site with it (the customer's private originals stay theirs). */
async function removePublicPhotos(doc: ReviewDoc, x: ReturnType<typeof deps>) {
  for (const m of doc.mediaIds ?? []) await x.media?.remove(m).catch(() => undefined);
}

/** Photo ids from the form: the customer's own, at most 3, no duplicates (checked again by attach). */
function parsePhotoIds(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > MAX_REVIEW_PHOTOS || raw.some((x) => typeof x !== "string" || !isPhotoId(x))) throw new ValidationError(`Add up to ${MAX_REVIEW_PHOTOS} photos.`);
  return [...new Set(raw as string[])];
}

export function authorName(name: string | null | undefined): string {
  const parts = (name ?? "").replace(/[^\p{L}\p{M}' -]/gu, "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Verified buyer";
  const first = parts[0].slice(0, 30);
  return parts.length > 1 ? `${first} ${parts.at(-1)![0].toUpperCase()}.` : first;
}

function parseContent(body: unknown): Pick<ReviewDoc, "rating" | "title" | "body" | "fit"> {
  const input = asObject(body);
  const rating = input.rating;
  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) throw new ValidationError("Choose a star rating from 1 to 5.");
  const fit = input.fit === "small" || input.fit === "large" ? input.fit : "true";
  return {
    rating: rating as ReviewDoc["rating"],
    title: cleanText(input.title, "Title", { min: 3, max: 80 }),
    body: cleanText(input.body, "Review", { min: 20, max: 1500, multiline: true }),
    fit,
  };
}

/** Delivered order lines the customer can still review. */
export async function reviewable(customerId: string, d: ReviewDeps = {}) {
  const x = deps(d);
  const [orders, mine] = await Promise.all([x.orders.listByCustomer(customerId), x.submissions.listByCustomer<ReviewDoc>("review", customerId)]);
  const done = new Set(mine.map((s) => s.doc.productId));
  const seen = new Set<string>();
  const out: { orderNumber: string; lineId: string; productId: string; title: string; size: string; image: ReviewDoc["image"]; deliveredAt: string }[] = [];
  for (const o of orders) {
    if (!o.deliveredAt) continue;
    for (const l of o.lines) {
      if (done.has(l.productId) || seen.has(l.productId)) continue;
      seen.add(l.productId);
      out.push({ orderNumber: o.number, lineId: l.lineId, productId: l.productId, title: l.title, size: l.size, image: l.image, deliveredAt: o.deliveredAt });
    }
  }
  return out;
}

export async function submitReview(customerId: string, body: unknown, d: ReviewDeps = {}): Promise<Submission<ReviewDoc>> {
  const x = deps(d);
  const input = asObject(body);
  rejectUnknownFields(input, ["orderNumber", "lineId", "rating", "title", "body", "fit", "photos"]);
  const content = parseContent({ rating: input.rating, title: input.title, body: input.body, fit: input.fit });
  const photoIds = parsePhotoIds(input.photos);
  const order = typeof input.orderNumber === "string" ? await x.orders.get(input.orderNumber) : null;
  // Someone else's order behaves exactly like a missing one.
  if (!order || order.customerId !== customerId) throw new ReviewError(404, "not_found", "Order not found.");
  if (!order.deliveredAt) throw new ReviewError(409, "not_delivered", "You can review an item once it has been delivered.");
  const line = order.lines.find((l) => l.lineId === input.lineId);
  if (!line) throw new ReviewError(404, "not_found", "Item not found in this order.");
  const product = await x.catalog.getProductById(line.productId);
  if (!product) throw new ReviewError(409, "unavailable", "This product can't be reviewed any more.");
  const customer = await x.customers.get(customerId);
  const doc: ReviewDoc = {
    orderNumber: order.number,
    lineId: line.lineId,
    productId: line.productId,
    productHandle: product.handle,
    productTitle: line.title,
    styleId: product.styleId,
    category: product.category,
    size: line.size,
    image: line.image,
    ...content,
    photoIds,
    author: authorName(customer?.name),
  };
  let created: Submission<ReviewDoc>;
  try {
    created = await x.submissions.create<ReviewDoc>({ kind: "review", customerId, status: "pending", uniqueKey: `review:${customerId}:${line.productId}`, doc });
  } catch (e) {
    if (e instanceof SubmissionConflictError) throw new ReviewError(409, "already_reviewed", "You've already reviewed this product. You can edit your review in My reviews.");
    throw e;
  }
  if (photoIds.length && !(await x.photos.attach(customerId, photoIds, attachKey(created.id)))) {
    await x.submissions.remove(created.id, customerId);
    throw new ReviewError(422, "bad_photos", "One of the photos couldn't be used. Upload it again.");
  }
  return created;
}

async function own(id: string, customerId: string, x: ReturnType<typeof deps>) {
  const s = /^sub_[a-f0-9]{24}$/.test(id) ? await x.submissions.get<ReviewDoc>(id) : null;
  if (!s || s.kind !== "review" || s.customerId !== customerId) throw new ReviewError(404, "not_found", "Review not found.");
  return s;
}

/** Editing sends it back to moderation and takes the published copy off the product page. */
export async function editReview(customerId: string, id: string, body: unknown, d: ReviewDeps = {}) {
  const x = deps(d);
  const s = await own(id, customerId, x);
  const input = asObject(body);
  rejectUnknownFields(input, ["rating", "title", "body", "fit", "photos"]);
  const photoIds = input.photos === undefined ? (s.doc.photoIds ?? []) : parsePhotoIds(input.photos);
  if (photoIds.length && !(await x.photos.attach(customerId, photoIds, attachKey(id)))) throw new ReviewError(422, "bad_photos", "One of the photos couldn't be used. Upload it again.");
  // Back to the check; the public copy, its photos and the store's reply come off the page until it is re-approved.
  const doc: ReviewDoc = { ...s.doc, ...parseContent({ rating: input.rating, title: input.title, body: input.body, fit: input.fit }), photoIds, mediaIds: undefined, reply: null, rejectReason: undefined, publishedReviewId: undefined };
  const next = await x.submissions.update<ReviewDoc>(id, ["pending", "published", "rejected"], "pending", doc);
  if (!next) throw new ReviewError(409, "busy", "This review just changed. Reload and try again.");
  if (s.doc.publishedReviewId) await x.published?.remove(s.doc.publishedReviewId);
  await removePublicPhotos(s.doc, x);
  return next;
}

export async function deleteReview(customerId: string, id: string, d: ReviewDeps = {}) {
  const x = deps(d);
  const s = await own(id, customerId, x);
  if (s.doc.publishedReviewId) await x.published?.remove(s.doc.publishedReviewId);
  await removePublicPhotos(s.doc, x);
  return x.submissions.remove(id, customerId);
}

/** Staff decision (permission `ugc.moderate`). Only a pending review can be decided — never twice. */
export async function decideReview(id: string, decision: unknown, staffId: string, reason: unknown, d: ReviewDeps = {}) {
  const x = deps(d);
  if (decision !== "approve" && decision !== "reject") throw new ValidationError("Choose approve or reject.");
  const s = /^sub_[a-f0-9]{24}$/.test(id) ? await x.submissions.get<ReviewDoc>(id) : null;
  if (!s || s.kind !== "review") throw new ReviewError(404, "not_found", "Review not found.");
  if (s.status !== "pending") throw new ReviewError(409, "already_decided", "Someone already decided this review.");
  if (decision === "reject") {
    const why = cleanText(reason, "Reason", { min: 3, max: 200 });
    const next = await x.submissions.update<ReviewDoc>(id, ["pending"], "rejected", { ...s.doc, rejectReason: why, decidedBy: staffId });
    if (!next) throw new ReviewError(409, "already_decided", "Someone already decided this review.");
    await x.notify(s.customerId, "review_rejected", {}).catch(() => undefined);
    return next;
  }
  // Public copies of the photos (the private originals stay private). A photo that can't be read is left out.
  const mediaIds: string[] = [];
  for (const pid of s.doc.photoIds ?? []) {
    const ph = await x.photos.get(s.customerId, pid);
    const size = ph ? imageSize(ph.bytes, ph.type) : null;
    if (!ph || !size || !x.media) continue;
    const mid = `med_${randomBytes(16).toString("hex")}`;
    await x.media.save({ id: mid, type: ph.type, width: size.width, height: size.height, bytes: ph.bytes, createdAt: new Date().toISOString(), createdBy: `review:${s.id}` });
    mediaIds.push(mid);
  }
  const publishedReviewId = `rv_c_${s.id.slice(4)}`;
  const next = await x.submissions.update<ReviewDoc>(id, ["pending"], "published", { ...s.doc, mediaIds, publishedReviewId, decidedBy: staffId });
  if (!next) throw new ReviewError(409, "already_decided", "Someone already decided this review.");
  const review: Review = {
    id: publishedReviewId,
    styleId: s.doc.styleId,
    category: s.doc.category,
    productHandle: s.doc.productHandle,
    rating: s.doc.rating,
    title: s.doc.title,
    body: s.doc.body,
    author: s.doc.author,
    size: s.doc.size,
    fit: s.doc.fit,
    photos: mediaIds.map((m, i) => ({ url: mediaUrl(m), art: s.doc.image.art as Review["photos"][number]["art"], colour: s.doc.image.colour, alt: `Customer photo ${i + 1}` })),
    reply: null,
    verified: true,
    createdAt: s.createdAt,
    helpful: 0,
  };
  await x.published?.insertMany([review]);
  await x.notify(s.customerId, "review_published", { handle: s.doc.productHandle }).catch(() => undefined);
  return next;
}

/**
 * The store's public reply under a published review (permission `ugc.moderate`). Empty text removes it.
 * The customer is emailed when a reply is added (not when one is removed).
 */
export async function replyToReview(id: string, text: unknown, staffId: string, d: ReviewDeps = {}) {
  const x = deps(d);
  const s = /^sub_[a-f0-9]{24}$/.test(id) ? await x.submissions.get<ReviewDoc>(id) : null;
  if (!s || s.kind !== "review") throw new ReviewError(404, "not_found", "Review not found.");
  if (s.status !== "published" || !s.doc.publishedReviewId) throw new ReviewError(409, "not_published", "Reply after the review is published.");
  const reply = text === "" || text === null || text === undefined ? null : { text: cleanText(text, "Reply", { min: 2, max: 1000, multiline: true }), at: new Date().toISOString(), by: staffId };
  const next = await x.submissions.update<ReviewDoc>(id, ["published"], "published", { ...s.doc, reply });
  if (!next) throw new ReviewError(409, "busy", "This review just changed. Reload and try again.");
  await x.published?.setReply(s.doc.publishedReviewId, reply ? { text: reply.text, at: reply.at } : null);
  if (reply && !s.doc.reply) await x.notify(s.customerId, "review_replied", { handle: s.doc.productHandle }).catch(() => undefined);
  return next;
}

/** What the customer sees about their own review (no staff ids). */
export function publicReview(s: Submission<ReviewDoc>) {
  const { decidedBy: _d, publishedReviewId: _p, mediaIds: _m, reply, photoIds, ...doc } = s.doc;
  void _d;
  void _p;
  void _m;
  return {
    id: s.id,
    status: s.status as ReviewStatus,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    ...doc,
    /** The customer's own private photos (served only to them, /api/returns/photos/<id>). */
    photoIds: photoIds ?? [],
    reply: reply ? { text: reply.text, at: reply.at } : null,
  };
}
