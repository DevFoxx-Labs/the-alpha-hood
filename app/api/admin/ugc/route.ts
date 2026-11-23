import { requireStaff } from "@/lib/admin/auth";
import { adminError, privateJson } from "@/lib/admin/http";
import { resolveUgc, type UgcStatus } from "@/lib/ugc/service";

const STATUSES: UgcStatus[] = ["pending", "approved", "rejected"];

/** GET ?status=pending|approved|rejected — #WearTheHood moderation queue (ugc.moderate). */
export async function GET(request: Request) {
  const auth = await requireStaff(request, "ugc.moderate");
  if (!auth.ok) return auth.response;
  const s = new URL(request.url).searchParams.get("status");
  const status = STATUSES.find((x) => x === s) ?? "pending";
  try {
    const posts = await resolveUgc().list(status, 100);
    // Staff see the first name only; the photo is served through the owner-scoped store by id.
    return privateJson({ posts: posts.map((p) => ({ id: p.id, displayName: p.displayName, caption: p.caption, productIds: p.productIds, status: p.status, createdAt: p.createdAt, photo: `/api/admin/ugc/${p.id}` })) });
  } catch (error) {
    return adminError(error);
  }
}
