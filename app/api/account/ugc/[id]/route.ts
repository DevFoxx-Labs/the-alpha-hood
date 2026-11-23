import { guardPublicWrite } from "@/lib/http/guard";
import { commerceErrorResponse, privateJson, requireAccount } from "@/lib/http/commerce-http";
import { resolveOrders } from "@/lib/orders/store";
import { resolvePhotos } from "@/lib/returns/photos";
import { removeOwnUgc, resolveUgc } from "@/lib/ugc/service";

/** DELETE — withdraw a post (hidden at once). Own posts only. */
export async function DELETE(request: Request, ctx: RouteContext<"/api/account/ugc/[id]">) {
  const guard = await guardPublicWrite(request, { name: "ugc-delete", limit: 20, windowMs: 10 * 60_000, maxBytes: 64 });
  if (!guard.ok) return guard.response;
  const auth = requireAccount(request);
  if (!auth.ok) return auth.response;
  try {
    const { id } = await ctx.params;
    await removeOwnUgc({ ugc: resolveUgc(), photos: resolvePhotos(), orders: resolveOrders() }, auth.customerId, id);
    return privateJson({ removed: true });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
