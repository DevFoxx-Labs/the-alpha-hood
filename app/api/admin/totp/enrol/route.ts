import { NextResponse } from "next/server";
import { enrolStep } from "@/lib/admin/auth";
import { adminError } from "@/lib/admin/http";
import { resolveStaffStore } from "@/lib/admin/staff";
import { guardPublicWrite, PRIVATE_NO_STORE } from "@/lib/http/guard";
import { asObject, rejectUnknownFields } from "@/lib/validation";

/** First sign-in: POST `{ ticket }` → TOTP secret + otpauth URI to add to an authenticator app. */
export async function POST(request: Request) {
  const guard = await guardPublicWrite(request, { name: "admin-totp", limit: 20, windowMs: 10 * 60_000, maxBytes: 256 });
  if (!guard.ok) return guard.response;
  try {
    const input = asObject(guard.body);
    rejectUnknownFields(input, ["ticket"]);
    return NextResponse.json(enrolStep(resolveStaffStore(), String(input.ticket ?? "")), { headers: PRIVATE_NO_STORE });
  } catch (error) {
    return adminError(error);
  }
}
