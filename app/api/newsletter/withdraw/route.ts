import { NextResponse } from "next/server";
import { resolveLedger } from "@/lib/consent/ledger";
import { existingVisitor } from "@/lib/consent/visitor";
import { errorResponse, guardPublicWrite, PRIVATE_NO_STORE, userAgent } from "@/lib/http/guard";
import { resolveNewsletterStore, withdrawForVisitor } from "@/lib/newsletter/service";

/** One-click withdrawal of offer subscriptions made from this browser ("Your consents"). Body: `{}`. */
export async function POST(request: Request) {
  const guard = await guardPublicWrite(request, { name: "newsletter-withdraw", limit: 10, windowMs: 10 * 60_000, maxBytes: 64 });
  if (!guard.ok) return guard.response;

  const visitorId = existingVisitor(request);
  if (!visitorId) return NextResponse.json({ withdrawn: 0 }, { headers: PRIVATE_NO_STORE });
  try {
    const withdrawn = await withdrawForVisitor(
      { store: resolveNewsletterStore(), ledger: resolveLedger() },
      { visitorId, ctx: { ip: guard.ip, userAgent: userAgent(request), source: "web" } },
    );
    return NextResponse.json({ withdrawn }, { headers: PRIVATE_NO_STORE });
  } catch (error) {
    return errorResponse(error);
  }
}
