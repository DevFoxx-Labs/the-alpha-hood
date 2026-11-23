import { clearSessionCookie, customerIdFromRequest, revokeAllSessions, revokeSession, sessionTokenFrom } from "@/lib/auth/session";
import { guardPublicWrite } from "@/lib/http/guard";
import { commerceErrorResponse, privateJson } from "@/lib/http/commerce-http";
import { securityEvent } from "@/lib/security/log";
import { asObject, rejectUnknownFields } from "@/lib/validation";

/** POST /api/session/logout `{ everywhere?: boolean }` — sign out this browser, or every device (ACC-02). */
export async function POST(request: Request) {
  const guard = await guardPublicWrite(request, { name: "logout", limit: 20, windowMs: 10 * 60_000, maxBytes: 64 });
  if (!guard.ok) return guard.response;
  try {
    const input = asObject(guard.body);
    rejectUnknownFields(input, ["everywhere"]);
    const token = sessionTokenFrom(request);
    const customerId = await customerIdFromRequest(request);
    let revoked = 0;
    if (customerId && input.everywhere === true) {
      revoked = await revokeAllSessions(customerId);
      securityEvent("login", { customer: customerId, action: "sign_out_everywhere", revoked });
    } else if (token) {
      await revokeSession(token);
      revoked = 1;
    }
    const response = privateJson({ ok: true, revoked });
    clearSessionCookie(response);
    return response;
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
