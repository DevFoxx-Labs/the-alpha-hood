import { NextResponse } from "next/server";
import { resolveLedger } from "@/lib/consent/ledger";
import { setVisitorCookie, visitorFrom } from "@/lib/consent/visitor";
import { errorResponse, guardPublicWrite, PRIVATE_NO_STORE, userAgent } from "@/lib/http/guard";
import { parseNewsletterInput, resolveNewsletterStore, subscribe } from "@/lib/newsletter/service";

/** GLB-05 newsletter sign-up. Same response whether or not the contact was already subscribed (no enumeration). */
export async function POST(request: Request) {
  const guard = await guardPublicWrite(request, { name: "newsletter", limit: 5, windowMs: 10 * 60_000, maxBytes: 1_024 });
  if (!guard.ok) return guard.response;

  try {
    const { channel, contact } = parseNewsletterInput(guard.body);
    const visitor = visitorFrom(request);
    await subscribe(
      { store: resolveNewsletterStore(), ledger: resolveLedger() },
      { channel, contact, visitorId: visitor.id, ctx: { ip: guard.ip, userAgent: userAgent(request), source: "web" } },
    );
    const response = NextResponse.json({ ok: true }, { status: 201, headers: PRIVATE_NO_STORE });
    if (visitor.isNew) setVisitorCookie(response, visitor.id);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
