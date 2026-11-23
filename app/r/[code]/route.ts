import { NextResponse } from "next/server";
import { REFERRAL_CODE_RE } from "@/lib/loyalty/store";

/**
 * GET /r/{code} — a friend's Alpha Club invite link (LOY-02). Only a well-formed code is kept, in a first-party
 * cookie `ah_ref` (30 days, no personal data) so the bag can offer it; the shopper still chooses to apply it.
 * Always redirects to our own homepage (never a URL from the request — no open redirect).
 */
export async function GET(request: Request, ctx: RouteContext<"/r/[code]">) {
  const url = new URL(request.url);
  const code = (await ctx.params).code.toUpperCase();
  const res = NextResponse.redirect(new URL(REFERRAL_CODE_RE.test(code) ? `/?invite=1` : "/", url.origin), 307);
  if (REFERRAL_CODE_RE.test(code)) {
    res.cookies.set("ah_ref", code, { httpOnly: false, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 30 * 86_400 });
  }
  res.headers.set("X-Robots-Tag", "noindex");
  return res;
}
