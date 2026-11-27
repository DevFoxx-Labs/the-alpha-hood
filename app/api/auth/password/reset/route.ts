import type { NextResponse } from "next/server";
import { completeReset, RESET_COOKIE } from "@/lib/auth/email-auth";
import { completeSignIn } from "@/lib/auth/sign-in";
import { signInEnabled } from "@/lib/checkout/flags";
import { readCookie } from "@/lib/consent/cookie";
import { commerceErrorResponse, privateJson } from "@/lib/http/commerce-http";
import { guardPublicWrite, jsonError } from "@/lib/http/guard";
import { asObject, rejectUnknownFields } from "@/lib/validation";

/**
 * POST /api/auth/password/reset `{ password }` — forgot password, step 3 of 3. Needs the reset ticket cookie that
 * step 2 (the emailed code, POST /api/auth/email/verify) set; without it nothing happens (410). On success: the new
 * password is saved, every session of the account is signed out, this browser is signed in fresh, and the ticket
 * is cleared (it is also void anyway, because it is bound to the old password version).
 */
const clear = (res: NextResponse) =>
  res.cookies.set(RESET_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/api/auth/password", maxAge: 0 });

export async function POST(request: Request) {
  if (!signInEnabled()) return jsonError(503, "sign_in_disabled", "Sign-in is temporarily unavailable.");
  const guard = await guardPublicWrite(request, { name: "password-reset", limit: 10, windowMs: 10 * 60_000, maxBytes: 512 });
  if (!guard.ok) return guard.response;
  try {
    const input = asObject(guard.body);
    rejectUnknownFields(input, ["password"]);
    const customerId = await completeReset(readCookie(request.headers.get("cookie"), RESET_COOKIE), input.password);
    const response = privateJson({ ok: true });
    clear(response);
    await completeSignIn(request, response, { customerId, created: false, method: "password", ip: guard.ip, revokeOthers: true });
    return response;
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
