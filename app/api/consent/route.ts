import { NextResponse } from "next/server";
import { TRACKING } from "@/lib/config/tracking";
import { CONSENT_COOKIE, CONSENT_MAX_AGE, serializeChoice } from "@/lib/consent/cookie";
import { resolveLedger } from "@/lib/consent/ledger";
import { activeCookiePurposes } from "@/lib/consent/purposes";
import { parseCookieChoiceInput, publicHistory, recordCookieChoice } from "@/lib/consent/service";
import { existingVisitor, setVisitorCookie, visitorFrom } from "@/lib/consent/visitor";
import { clientIp, errorResponse, guardPublicWrite, jsonError, PRIVATE_NO_STORE, userAgent } from "@/lib/http/guard";
import { rateLimiter } from "@/lib/http/rate-limit";

/**
 * Cookie consent (DPDP rules §3–5).
 * POST — record a banner / preferences decision in the ledger, then set `ah_consent` (server is the source).
 * GET  — this browser's own consent history for "Your consents".
 */
export async function POST(request: Request) {
  const guard = await guardPublicWrite(request, { name: "consent", limit: 30, windowMs: 10 * 60_000, maxBytes: 512 });
  if (!guard.ok) return guard.response;

  try {
    const { choice, method } = parseCookieChoiceInput(guard.body);
    const visitor = visitorFrom(request);
    const result = await recordCookieChoice(resolveLedger(), {
      visitorId: visitor.id,
      choice,
      method,
      activePurposes: activeCookiePurposes(TRACKING),
      ctx: { ip: guard.ip, userAgent: userAgent(request), source: "web" },
    });

    const response = NextResponse.json(
      { choice: result.choice, recorded: result.records.length },
      { status: 201, headers: PRIVATE_NO_STORE },
    );
    response.cookies.set(CONSENT_COOKIE, serializeChoice(result.choice), {
      httpOnly: false, // read by the client to gate tracker scripts; holds no personal data
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: CONSENT_MAX_AGE,
    });
    if (visitor.isNew) setVisitorCookie(response, visitor.id);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: Request) {
  const rl = await rateLimiter.hit(`consent-read:ip:${clientIp(request)}`, 60, 60_000);
  if (!rl.ok) return jsonError(429, "rate_limited", "Too many requests.", { "Retry-After": String(rl.retryAfterSeconds) });

  const visitorId = existingVisitor(request);
  if (!visitorId) return NextResponse.json({ history: [] }, { headers: PRIVATE_NO_STORE });
  try {
    const history = await resolveLedger().listByVisitor(visitorId);
    return NextResponse.json({ history: publicHistory(history) }, { headers: PRIVATE_NO_STORE });
  } catch (error) {
    return errorResponse(error);
  }
}
