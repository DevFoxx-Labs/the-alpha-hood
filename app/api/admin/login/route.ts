import { NextResponse } from "next/server";
import { passwordStep } from "@/lib/admin/auth";
import { adminError } from "@/lib/admin/http";
import { resolveStaffStore } from "@/lib/admin/staff";
import { guardPublicWrite, jsonError, PRIVATE_NO_STORE } from "@/lib/http/guard";
import { rateLimiter } from "@/lib/http/rate-limit";
import { asObject, rejectUnknownFields } from "@/lib/validation";

/** Admin sign-in step 1 — POST `{ email, password }` → `{ ticket, step: "totp" | "enrol" }` (never a session). */
export async function POST(request: Request) {
  const guard = await guardPublicWrite(request, { name: "admin-login", limit: 10, windowMs: 10 * 60_000, maxBytes: 512 });
  if (!guard.ok) return guard.response;
  if (!rateLimiter.hit("admin-login:global", 300, 60_000).ok) return jsonError(429, "rate_limited", "Too many sign-in attempts. Try again shortly.");
  try {
    const input = asObject(guard.body);
    rejectUnknownFields(input, ["email", "password"]);
    const result = await passwordStep(resolveStaffStore(), input.email, input.password);
    return NextResponse.json(result, { headers: PRIVATE_NO_STORE });
  } catch (error) {
    return adminError(error);
  }
}
