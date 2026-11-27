import { methodCount, signInMethods } from "@/lib/auth/email-auth";
import { enabledSocialProviders, isSocialProvider } from "@/lib/auth/social";
import { resolveSocialIdentities } from "@/lib/auth/social-identities";
import { commerceErrorResponse, privateJson, requireAccount } from "@/lib/http/commerce-http";
import { clientIp, guardPublicWrite, jsonError } from "@/lib/http/guard";
import { rateLimiter } from "@/lib/http/rate-limit";
import { asObject, rejectUnknownFields } from "@/lib/validation";

/**
 * Signed-in customer's sign-in methods. GET → which social accounts are linked (provider + date only), which can be
 * linked, and the other ways in (masked mobile, sign-in email, whether a password is set).
 * DELETE `{ provider }` → unlink (DPDP: withdrawal as easy as giving) — refused when it is the account's last way in.
 */
export async function GET(request: Request) {
  const rl = await rateLimiter.hit(`account-read:ip:${clientIp(request)}`, 60, 60_000);
  if (!rl.ok) return jsonError(429, "rate_limited", "Too many requests.");
  const auth = await requireAccount(request);
  if (!auth.ok) return auth.response;
  try {
    const linked = await resolveSocialIdentities().listFor(auth.customerId);
    const methods = await signInMethods(auth.customerId);
    return privateJson({
      linked: linked.map((l) => ({ provider: l.provider, linkedAt: l.createdAt })),
      available: enabledSocialProviders(),
      methods: methods ? { phone: methods.phone, email: methods.email, password: methods.password } : null,
    });
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
    const methods = await signInMethods(auth.customerId);
    if (methods && methods.social.includes(input.provider) && methodCount(methods) <= 1) {
      return jsonError(409, "last_method", "This is the only way to sign in to your account. Add your mobile number or verify an email first.");
    }
    const removed = await resolveSocialIdentities().unlink(auth.customerId, input.provider);
    return privateJson({ ok: true, removed });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
