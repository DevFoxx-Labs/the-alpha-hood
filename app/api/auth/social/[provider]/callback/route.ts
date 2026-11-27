import { NextResponse } from "next/server";
import { customerIdFromRequest } from "@/lib/auth/session";
import { completeSignIn } from "@/lib/auth/sign-in";
import { finishSignIn, isSocialProvider, LINK_COOKIE, OAUTH_COOKIE, OAUTH_TTL_MS, sealPendingLink, SocialError } from "@/lib/auth/social";
import { resolveSocialIdentities } from "@/lib/auth/social-identities";
import { signInEnabled } from "@/lib/checkout/flags";
import { readCookie } from "@/lib/consent/cookie";
import { isErased, resolveCustomers } from "@/lib/customers/store";
import { clientIp, jsonError } from "@/lib/http/guard";
import { rateLimiter } from "@/lib/http/rate-limit";
import { maskEmail, securityEvent } from "@/lib/security/log";

/**
 * GET /api/auth/social/<provider>/callback — Google / Facebook send the browser back here.
 * 1. The state cookie must match (else: refused — login CSRF). The cookie is cleared whatever happens.
 * 2. Linked social account → signed in to its customer.
 * 3. Not linked + already signed in → linked to the signed-in customer.
 * 4. Not linked + signed out, Google with a Google-VERIFIED email that no account signs in with yet → a new account
 *    (its sign-in email is that address; the one-tap Terms/Privacy notice next to the button is recorded).
 *    If an account already signs in with that email, nothing is linked: the person signs in to it first and links
 *    Google in Settings. A social sign-in never matches or opens an existing account by email.
 * 5. Otherwise (Facebook — its email is never trusted — or Google without a verified email) → a sealed 10-minute
 *    "pending link" cookie and back to /account, where verifying the mobile number finishes the sign-in and links
 *    the two (POST /api/otp/verify).
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
      if (!customer || isErased(customer)) return back(request, "/account?social=error");
      const res = back(request, profile.next);
      if (!signedIn) await completeSignIn(request, res, { customerId: customer.id, created: false, method: provider, ip });
      return res;
    }

    if (signedIn) {
      const ok = await identities.link({ provider, subject: profile.subject, customerId: signedIn, email: profile.email, createdAt: new Date().toISOString() });
      securityEvent("login", { customer: signedIn, kind: `social_${provider}_linked`, ok });
      return back(request, ok ? "/account/settings?social=linked" : "/account/settings?social=other_account");
    }

    if (provider === "google" && profile.email) {
      const customers = resolveCustomers();
      if (await customers.findByLoginEmail(profile.email)) {
        securityEvent("social_signup_blocked", { kind: "email_in_use", email: maskEmail(profile.email) });
        return back(request, "/account?social=email_in_use");
      }
      // Race-safe: the sign-in email is UNIQUE, so two parallel callbacks can't create two accounts for one address.
      const { customer, created } = await customers.findOrCreateByEmail(profile.email);
      if (!created) return back(request, "/account?social=email_in_use");
      if (profile.name) await customers.setName(customer.id, profile.name);
      const ok = await identities.link({ provider, subject: profile.subject, customerId: customer.id, email: profile.email, createdAt: new Date().toISOString() });
      // Lost a race with a parallel callback for the same Google account: sign in to the account that won.
      const owner = ok ? customer.id : (await identities.find(provider, profile.subject))?.customerId;
      if (!owner) return back(request, "/account?social=error");
      const res = back(request, profile.next);
      await completeSignIn(request, res, { customerId: owner, created: ok, method: "google", ip, consent: "signup_notice" });
      return res;
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
