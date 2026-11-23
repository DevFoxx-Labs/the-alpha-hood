import { returnDeps } from "@/lib/account/service";
import { guardPublicWrite, jsonError } from "@/lib/http/guard";
import { commerceErrorResponse, privateJson, requireAccount } from "@/lib/http/commerce-http";
import { cancelReturn } from "@/lib/returns/service";

const RETURN_RE = /^RT[0-9A-F]{10}$/;

/** POST /api/returns/{number}/cancel `{}` — the caller cancels their own return before pickup. */
export async function POST(request: Request, { params }: RouteContext<"/api/returns/[number]/cancel">) {
  const guard = await guardPublicWrite(request, { name: "return-cancel", limit: 10, windowMs: 10 * 60_000, maxBytes: 64 });
  if (!guard.ok) return guard.response;
  const auth = await requireAccount(request);
  if (!auth.ok) return auth.response;
  const { number } = await params;
  if (!RETURN_RE.test(number)) return jsonError(404, "return_not_found", "Return not found.");
  try {
    await cancelReturn(await returnDeps([]), auth.customerId, number);
    return privateJson({ ok: true });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
