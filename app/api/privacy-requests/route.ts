import { NextResponse } from "next/server";
import { errorResponse, guardPublicWrite, PRIVATE_NO_STORE } from "@/lib/http/guard";
import { parsePrivacyRequest, resolveInbox, submitPrivacyRequest } from "@/lib/privacy/requests";

/** DPDP rights / grievance request → inbox. Returns only the reference and timelines (no echo of the data). */
export async function POST(request: Request) {
  const guard = await guardPublicWrite(request, { name: "privacy-request", limit: 5, windowMs: 60 * 60_000, maxBytes: 8_192 });
  if (!guard.ok) return guard.response;

  try {
    const input = parsePrivacyRequest(guard.body);
    const created = await submitPrivacyRequest(resolveInbox(), input);
    return NextResponse.json(
      { reference: created.reference, acknowledgeBy: created.acknowledgeBy, resolveBy: created.resolveBy },
      { status: 201, headers: PRIVATE_NO_STORE },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
