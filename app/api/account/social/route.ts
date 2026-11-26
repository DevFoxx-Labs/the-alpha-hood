import { enabledSocialProviders, isSocialProvider } from "@/lib/auth/social";
import { resolveSocialIdentities } from "@/lib/auth/social-identities";
import { commerceErrorResponse, privateJson, requireAccount } from "@/lib/http/commerce-http";
import { clientIp, guardPublicWrite, jsonError } from "@/lib/http/guard";
import { rateLimiter } from "@/lib/http/rate-limit";
import { asObject, rejectUnknownFields } from "@/lib/validation";

/**
 * Signed-in customer's sign-in methods. GET → which social accounts are linked (provider + date only) and which
 * can be linked. DELETE `{ provider }` → unlink (DPDP: withdrawal as easy as giving). The mobile number stays.
 */
export async function GET(request: Request) {
  const rl = await rateLimiter.hit(`account-read:ip:${clientIp(request)}`, 60, 60_000);
  if (!rl.ok) return jsonError(429, "rate_limited", "Too many requests.");
  const auth = await requireAccount(request);
  if (!auth.ok) return auth.response;
  try {
    const linked = await resolveSocialIdentities().listFor(auth.customerId);
    return privateJson({ linked: linked.map((l) => ({ provider: l.provider, linkedAt: l.createdAt })), available: enabledSocialProviders() });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const guard = await guardPublicWrite(request, { name: "account-social", limit: 20, windowMs: 10 * 60_000, maxBytes: 64 });
  if (!guard.ok) return guard.response;
  const auth = await requireAccount(request);
  if (!auth.ok) return auth.response;
  try {
    const input = asObject(guard.body);
    rejectUnknownFields(input, ["provider"]);
    if (!isSocialProvider(input.provider)) return jsonError(422, "invalid_input", "Choose a sign-in method.");
    const removed = await resolveSocialIdentities().unlink(auth.customerId, input.provider);
    return privateJson({ ok: true, removed });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
