import { deleteAccount } from "@/lib/account/service";
import { clearSessionCookie } from "@/lib/auth/session";
import { guardPublicWrite, jsonError, userAgent } from "@/lib/http/guard";
import { commerceErrorResponse, privateJson, requireAccount } from "@/lib/http/commerce-http";
import { securityEvent } from "@/lib/security/log";
import { asObject, rejectUnknownFields } from "@/lib/validation";

/**
 * POST /api/account/delete `{ confirm: "DELETE" }` — DPDP erasure / Play & App Store in-app deletion.
 * Requires an active session (phone verified by OTP) and an explicit typed confirmation.
 */
export async function POST(request: Request) {
  const guard = await guardPublicWrite(request, { name: "account-delete", limit: 5, windowMs: 60 * 60_000, maxBytes: 128 });
  if (!guard.ok) return guard.response;
  const auth = await requireAccount(request);
  if (!auth.ok) return auth.response;
  try {
    const input = asObject(guard.body);
    rejectUnknownFields(input, ["confirm"]);
    if (input.confirm !== "DELETE") return jsonError(422, "confirm_required", 'Type DELETE to confirm.');
    const result = await deleteAccount(auth.customerId, { ip: guard.ip, userAgent: userAgent(request), source: "web" });
    securityEvent("login", { customer: auth.customerId, action: "account_deleted" });
    const response = privateJson(result);
    clearSessionCookie(response);
    return response;
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
