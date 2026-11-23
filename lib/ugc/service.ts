import { randomBytes } from "node:crypto";
import type { ConsentLedger } from "@/lib/consent/ledger";
import type { RequestContext } from "@/lib/consent/service";
import { recordServiceConsent, rewardUgc } from "@/lib/loyalty/service";
import type { LoyaltyStore } from "@/lib/loyalty/store";
import { dbStores } from "@/lib/db";
import { BackendUnavailableError, devSingleton, type Env, mockDataAllowed } from "@/lib/mock-guard";
import type { OrderStore } from "@/lib/orders/store";
import type { PhotoStore } from "@/lib/returns/photos";

/**
 * HOME-10 / LOY-03 #WearTheHood: customers submit a photo of a fit they bought. Nothing is public until staff
 * approve it (moderation), and only with the customer's explicit "publish my photo" consent (`ugc_publish`,
 * recorded per submission). The customer can delete it at any time (withdrawal → it disappears at once).
 * Only products from the customer's own delivered orders can be tagged. Approved members earn Hood Coins.
 */
export type UgcStatus = "pending" | "approved" | "rejected" | "removed";

export interface UgcPost {
  id: string;
  customerId: string;
  /** First name only, shown under the photo. */
  displayName: string;
  photoId: string;
  caption: string;
  productIds: string[];
  status: UgcStatus;
  createdAt: string;
  moderatedAt: string | null;
  moderatedBy: string | null;
}

const ID_RE = /^ugc_[a-f0-9]{18}$/;
export const UGC_LIMITS = { captionMax: 140, productsMax: 3, perDay: 3 } as const;

export interface UgcStore {
  create(p: Omit<UgcPost, "id" | "createdAt" | "moderatedAt" | "moderatedBy" | "status">, now?: Date): Promise<UgcPost>;
  get(id: string): Promise<UgcPost | null>;
  list(status?: UgcStatus, limit?: number): Promise<UgcPost[]>;
  listByCustomer(customerId: string): Promise<UgcPost[]>;
  setStatus(id: string, from: UgcStatus[], to: UgcStatus, by: string | null, now?: Date): Promise<UgcPost | null>;
  erase(customerId: string): Promise<void>;
}

export function createMemoryUgcStore(): UgcStore {
  const posts = new Map<string, UgcPost>();
  return {
    async create(p, now = new Date()) {
      const post: UgcPost = { ...p, id: `ugc_${randomBytes(9).toString("hex")}`, status: "pending", createdAt: now.toISOString(), moderatedAt: null, moderatedBy: null };
      posts.set(post.id, post);
      return post;
    },
    async get(id) {
      return ID_RE.test(id) ? (posts.get(id) ?? null) : null;
    },
    async list(status, limit = 100) {
      return [...posts.values()].filter((p) => !status || p.status === status).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
    },
    async listByCustomer(id) {
      return [...posts.values()].filter((p) => p.customerId === id && p.status !== "removed");
    },
    async setStatus(id, from, to, by, now = new Date()) {
      const p = ID_RE.test(id) ? posts.get(id) : undefined;
      if (!p || !from.includes(p.status)) return null; // conditional update: only from an allowed state
      p.status = to;
      p.moderatedAt = now.toISOString();
      p.moderatedBy = by;
      return p;
    },
    async erase(id) {
      for (const [k, p] of posts) if (p.customerId === id) posts.delete(k);
    },
  };
}

export function resolveUgc(env: Env = process.env): UgcStore {
  const db = dbStores(env);
  if (db) return db.ugc;
  if (mockDataAllowed(env)) return devSingleton("ugc", createMemoryUgcStore);
  const fail = async (): Promise<never> => {
    throw new BackendUnavailableError("#WearTheHood");
  };
  return { create: fail, get: fail, list: fail, listByCustomer: fail, setStatus: fail, erase: fail };
}

export class UgcError extends Error {
  constructor(
    public readonly code: "consent_required" | "invalid_input" | "photo_invalid" | "not_purchased" | "too_many" | "not_found" | "invalid_transition",
    message: string,
    public readonly status = 422,
  ) {
    super(message);
  }
}

const CONTROL = new RegExp("[\\u0000-\\u001F\\u007F\\u202A-\\u202E\\u2066-\\u2069]", "g");
const URLISH = /(https?:\/\/|www\.|\.com\b|\.in\b)/i;

export interface UgcDeps {
  ugc: UgcStore;
  photos: PhotoStore;
  orders: Pick<OrderStore, "listByCustomer">;
  ledger?: ConsentLedger;
  loyalty?: LoyaltyStore;
}

export async function submitUgc(
  deps: UgcDeps,
  customer: { id: string; name: string | null },
  input: { photoId: unknown; caption: unknown; productIds: unknown; consent: unknown },
  ctx: RequestContext,
  now = new Date(),
) {
  if (input.consent !== true) throw new UgcError("consent_required", "Please tick the box so we can show your photo.");
  if (typeof input.photoId !== "string") throw new UgcError("photo_invalid", "Add a photo.");
  const caption = typeof input.caption === "string" ? input.caption.replace(CONTROL, "").trim() : "";
  if (caption.length > UGC_LIMITS.captionMax) throw new UgcError("invalid_input", `Keep the caption under ${UGC_LIMITS.captionMax} characters.`);
  if (URLISH.test(caption)) throw new UgcError("invalid_input", "Links aren't allowed in captions.");
  const ids = Array.isArray(input.productIds) ? input.productIds : [];
  if (ids.length === 0 || ids.length > UGC_LIMITS.productsMax || ids.some((x) => typeof x !== "string")) {
    throw new UgcError("invalid_input", `Tag 1 to ${UGC_LIMITS.productsMax} products you bought.`);
  }
  // Only items from the customer's own delivered orders (no tagging of products they never received).
  const bought = new Set((await deps.orders.listByCustomer(customer.id)).filter((o) => o.deliveredAt).flatMap((o) => o.lines.map((l) => l.productId)));
  if ((ids as string[]).some((id) => !bought.has(id))) throw new UgcError("not_purchased", "You can only tag products from your delivered orders.");
  const today = (await deps.ugc.listByCustomer(customer.id)).filter((p) => now.getTime() - Date.parse(p.createdAt) < 86_400_000);
  if (today.length >= UGC_LIMITS.perDay) throw new UgcError("too_many", "You've shared enough for today — try again tomorrow.", 429);
  const photo = await deps.photos.get(customer.id, input.photoId);
  if (!photo) throw new UgcError("photo_invalid", "Upload the photo again.");

  const post = await deps.ugc.create(
    { customerId: customer.id, displayName: firstName(customer.name), photoId: photo.id, caption, productIds: [...new Set(ids as string[])] },
    now,
  );
  if (!(await deps.photos.attach(customer.id, [photo.id], `ugc:${post.id}`))) {
    await deps.ugc.setStatus(post.id, ["pending"], "removed", null, now);
    throw new UgcError("photo_invalid", "That photo is already used.");
  }
  await recordServiceConsent(customer.id, "ugc_publish", true, ctx, deps.ledger, now);
  return post;
}

export function firstName(name: string | null): string {
  const f = (name ?? "").replace(CONTROL, "").trim().split(/\s+/)[0] ?? "";
  return f ? f.slice(0, 20) : "A member";
}

/** Customer withdrawal: the post is hidden immediately (and the photo no longer served). */
export async function removeOwnUgc(deps: UgcDeps, customerId: string, id: string, now = new Date()) {
  const p = await deps.ugc.get(id);
  if (!p || p.customerId !== customerId) throw new UgcError("not_found", "Post not found.", 404);
  await deps.ugc.setStatus(id, ["pending", "approved", "rejected"], "removed", null, now);
}

/** Staff moderation (audited by the admin route). Approval pays the member's coins once. */
export async function moderateUgc(deps: UgcDeps, id: string, decision: "approve" | "reject", staffId: string, now = new Date()) {
  const to = decision === "approve" ? "approved" : "rejected";
  const from: UgcStatus[] = decision === "approve" ? ["pending", "rejected"] : ["pending", "approved"];
  const p = await deps.ugc.setStatus(id, from, to, staffId, now);
  if (!p) throw new UgcError("invalid_transition", "This post can't be changed.", 409);
  if (to === "approved") await rewardUgc(p.customerId, p.id, deps.loyalty, now);
  return p;
}

/** Public view: approved posts only, first name + caption + tagged products. */
export async function publicUgc(store: UgcStore, limit = 12) {
  return (await store.list("approved", limit)).map((p) => ({ id: p.id, displayName: p.displayName, caption: p.caption, productIds: p.productIds, photo: `/api/ugc/${p.id}/photo` }));
}
