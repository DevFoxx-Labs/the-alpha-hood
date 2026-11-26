import { NextResponse } from "next/server";
import { isSocialProvider, OAUTH_COOKIE, OAUTH_TTL_MS, SocialError, startSignIn } from "@/lib/auth/social";
import { signInEnabled } from "@/lib/checkout/flags";
import { clientIp, jsonError } from "@/lib/http/guard";
import { rateLimiter } from "@/lib/http/rate-limit";

/**
 * GET /api/auth/social/<google|facebook>/start?next=/account — sends the browser to Google / Facebook. Sets a sealed,
 * HttpOnly cookie that binds the callback to this browser (state + PKCE + nonce). SameSite=Lax because the provider
 * returns with a top-level GET. 404 when the provider's keys are not saved (fail closed).
 */
export async function GET(request: Request, { params }: RouteContext<"/api/auth/social/[provider]/start">) {
  const { provider } = await params;
  if (!isSocialProvider(provider) || !signInEnabled()) return jsonError(404, "not_found", "Not found.");
  const rl = await rateLimiter.hit(`social-start:ip:${clientIp(request)}`, 20, 10 * 60_000);
  if (!rl.ok) return jsonError(429, "rate_limited", "Too many attempts. Try again in a few minutes.");
  try {
    const { url, cookie } = startSignIn(provider, new URL(request.url).searchParams.get("next"));
    const res = NextResponse.redirect(url, 303);
    res.cookies.set(OAUTH_COOKIE, cookie, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/auth/social", maxAge: OAUTH_TTL_MS / 1000 });
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (error) {
    if (error instanceof SocialError) return jsonError(404, "not_found", "Not found.");
    return jsonError(503, "unavailable", "Sign-in is temporarily unavailable.");
  }
}
