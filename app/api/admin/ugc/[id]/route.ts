import { audit, requireStaff } from "@/lib/admin/auth";
import { adminError, adminWrite, privateJson } from "@/lib/admin/http";
import { jsonError } from "@/lib/http/guard";
import { resolveOrders } from "@/lib/orders/store";
import { resolvePhotos } from "@/lib/returns/photos";
import { moderateUgc, resolveUgc } from "@/lib/ugc/service";
import { asObject, rejectUnknownFields } from "@/lib/validation";

/** GET — the post's photo for moderators (any status except withdrawn). */
export async function GET(request: Request, ctx: RouteContext<"/api/admin/ugc/[id]">) {
  const auth = requireStaff(request, "ugc.moderate");
  if (!auth.ok) return auth.response;
  try {
    const { id } = await ctx.params;
    const post = await resolveUgc().get(id);
    if (!post || post.status === "removed") return jsonError(404, "not_found", "Not found.");
    const photo = await resolvePhotos().get(post.customerId, post.photoId);
    if (!photo) return jsonError(404, "not_found", "Not found.");
    return new Response(photo.bytes.slice().buffer, {
      headers: { "Content-Type": photo.type, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return adminError(error);
  }
}

/** POST `{ decision: "approve" | "reject" }` — audited; approval pays the member's coins once. */
export async function POST(request: Request, ctx: RouteContext<"/api/admin/ugc/[id]">) {
  const w = await adminWrite(request, "ugc.moderate", "ugc", 256);
  if (!w.ok) return w.response;
  try {
    const { id } = await ctx.params;
    const input = asObject(w.body);
    rejectUnknownFields(input, ["decision"]);
    if (input.decision !== "approve" && input.decision !== "reject") return jsonError(422, "invalid_input", "Choose approve or reject.");
    const post = await moderateUgc({ ugc: resolveUgc(), photos: resolvePhotos(), orders: resolveOrders() }, id, input.decision, w.staff.id);
    await audit(w, `ugc.${input.decision}`, id, {});
    return privateJson({ post: { id: post.id, status: post.status } });
  } catch (error) {
    return adminError(error);
  }
}
