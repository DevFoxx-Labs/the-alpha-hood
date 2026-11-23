import { resolveCustomers } from "@/lib/customers/store";
import { guardPublicWrite, userAgent } from "@/lib/http/guard";
import { commerceErrorResponse, privateJson, requireAccount } from "@/lib/http/commerce-http";
import { resolveOrders } from "@/lib/orders/store";
import { resolvePhotos } from "@/lib/returns/photos";
import { resolveUgc, submitUgc } from "@/lib/ugc/service";
import { asObject, rejectUnknownFields } from "@/lib/validation";

/** GET — the customer's own #WearTheHood posts with their moderation status. */
export async function GET(request: Request) {
  const auth = await requireAccount(request);
  if (!auth.ok) return auth.response;
  try {
    const posts = await resolveUgc().listByCustomer(auth.customerId);
    return privateJson({ posts: posts.map((p) => ({ id: p.id, caption: p.caption, status: p.status, createdAt: p.createdAt, photo: `/api/returns/photos/${p.photoId}` })) });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}

/** POST `{ photoId, caption, productIds, consent: true }` (photo uploaded first via /api/returns/photos). */
export async function POST(request: Request) {
  const guard = await guardPublicWrite(request, { name: "ugc", limit: 10, windowMs: 60 * 60_000, maxBytes: 1024 });
  if (!guard.ok) return guard.response;
  const auth = await requireAccount(request);
  if (!auth.ok) return auth.response;
  try {
    const input = asObject(guard.body);
    rejectUnknownFields(input, ["photoId", "caption", "productIds", "consent"]);
    const customer = await resolveCustomers().get(auth.customerId);
    const post = await submitUgc(
      { ugc: resolveUgc(), photos: resolvePhotos(), orders: resolveOrders() },
      { id: auth.customerId, name: customer?.name ?? null },
      { photoId: input.photoId, caption: input.caption, productIds: input.productIds, consent: input.consent },
      { ip: guard.ip, userAgent: userAgent(request), source: "web" },
    );
    return privateJson({ post: { id: post.id, status: post.status } }, { status: 201 });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
