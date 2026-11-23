import { isVisitorId, readCookie, VISITOR_COOKIE } from "@/lib/consent/cookie";
import { guardPublicWrite, jsonError, userAgent } from "@/lib/http/guard";
import { commerceErrorResponse, privateJson, requireAccount } from "@/lib/http/commerce-http";
import { clubDashboard, joinClub, leaveClub } from "@/lib/loyalty/service";
import { resolveOrders } from "@/lib/orders/store";
import { asObject, rejectUnknownFields } from "@/lib/validation";

/** GET /api/account/club — ACC-03 Alpha Club dashboard (tier, coins, history, referral code). */
export async function GET(request: Request) {
  const auth = await requireAccount(request);
  if (!auth.ok) return auth.response;
  try {
    return privateJson(await clubDashboard(auth.customerId, resolveOrders()));
  } catch (error) {
    return commerceErrorResponse(error);
  }
}

/** POST `{ action: "join", consent: true }` or `{ action: "leave" }` — consent recorded in the ledger. */
export async function POST(request: Request) {
  const guard = await guardPublicWrite(request, { name: "club", limit: 10, windowMs: 10 * 60_000, maxBytes: 128 });
  if (!guard.ok) return guard.response;
  const auth = await requireAccount(request);
  if (!auth.ok) return auth.response;
  try {
    const input = asObject(guard.body);
    rejectUnknownFields(input, ["action", "consent"]);
    const ctx = { ip: guard.ip, userAgent: userAgent(request), source: "web" as const };
    if (input.action === "join") {
      const vid = readCookie(request.headers.get("cookie"), VISITOR_COOKIE);
      await joinClub(auth.customerId, input.consent, { ...ctx, visitorId: isVisitorId(vid) ? vid : null });
    } else if (input.action === "leave") {
      await leaveClub(auth.customerId, ctx);
    } else return jsonError(422, "invalid_input", "Unknown action.");
    return privateJson(await clubDashboard(auth.customerId, resolveOrders()));
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
