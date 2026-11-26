import { NextResponse } from "next/server";
import { createSession, customerIdFromRequest, setSessionCookie } from "@/lib/auth/session";
import { finishSignIn, isSocialProvider, LINK_COOKIE, OAUTH_COOKIE, OAUTH_TTL_MS, sealPendingLink, SocialError } from "@/lib/auth/social";
import { resolveSocialIdentities } from "@/lib/auth/social-identities";
import { signInEnabled } from "@/lib/checkout/flags";
import { readCookie } from "@/lib/consent/cookie";
import { resolveCustomers } from "@/lib/customers/store";
import { clientIp, jsonError } from "@/lib/http/guard";
import { rateLimiter } from "@/lib/http/rate-limit";
import { securityEvent } from "@/lib/security/log";

/**
 * GET /api/auth/social/<provider>/callback — Google / Facebook send the browser back here.
 * 1. The state cookie must match (else: refused — login CSRF). The cookie is cleared whatever happens.
 * 2. Linked social account → signed in to its customer.
 * 3. Not linked + already signed in → linked to the signed-in customer (their mobile is already verified).
 * 4. Not linked + signed out → a sealed 10-minute "pending link" cookie and back to /account, where verifying the
 *    mobile number with a code finishes the sign-in and links the two (POST /api/otp/verify). The social account
 *    never creates or opens a customer account on its own: the account belongs to the verified mobile number.
 * Failures go back to /account with a short reason only — never the provider's error text.
 */
function back(request: Request, path: string) {
  const res = NextResponse.redirect(new URL(path, request.url), 303);
  res.cookies.set(OAUTH_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/auth/social", maxAge: 0 });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function GET(request: Request, { params }: RouteContext<"/api/auth/social/[provider]/callback">) {
  const { provider } = await params;
  if (!isSocialProvider(provider) || !signInEnabled()) return jsonError(404, "not_found", "Not found.");
  const ip = clientIp(request);
  const rl = await rateLimiter.hit(`social-callback:ip:${ip}`, 20, 10 * 60_000);
  if (!rl.ok) return back(request, "/account?social=busy");
  try {
    const profile = await finishSignIn(provider, new URL(request.url).searchParams, readCookie(request.headers.get("cookie"), OAUTH_COOKIE));
    const identities = resolveSocialIdentities();
    const linked = await identities.find(provider, profile.subject);
    const signedIn = await customerIdFromRequest(request);

    if (linked) {
      if (signedIn && signedIn !== linked.customerId) return back(request, "/account/settings?social=other_account");
      const customer = await resolveCustomers().get(linked.customerId);
      if (!customer) return back(request, "/account?social=error");
      const res = back(request, profile.next);
      if (!signedIn) setSessionCookie(res, await createSession(customer.id));
      securityEvent("login", { customer: customer.id, kind: `social_${provider}` });
      return res;
    }

    if (signedIn) {
      const ok = await identities.link({ provider, subject: profile.subject, customerId: signedIn, email: profile.email, createdAt: new Date().toISOString() });
      securityEvent("login", { customer: signedIn, kind: `social_${provider}_linked`, ok });
      return back(request, ok ? "/account/settings?social=linked" : "/account/settings?social=other_account");
    }

    const res = back(request, `/account?link=${provider}`);
    res.cookies.set(LINK_COOKIE, sealPendingLink({ provider, subject: profile.subject, email: profile.email, name: profile.name }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: OAUTH_TTL_MS / 1000,
    });
    return res;
  } catch (error) {
    const code = error instanceof SocialError ? error.code : "error";
    if (code !== "denied") securityEvent("login", { kind: `social_${provider}_failed`, reason: code });
    return back(request, `/account?social=${code === "denied" ? "cancelled" : code === "state" ? "expired" : "error"}`);
  }
}
