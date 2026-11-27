import type { NextResponse } from "next/server";
import { resolveLedger } from "@/lib/consent/ledger";
import { recordAccountConsent } from "@/lib/consent/service";
import { existingVisitor } from "@/lib/consent/visitor";
import { userAgent } from "@/lib/http/guard";
import { checkDevice, setDeviceCookie } from "@/lib/security/devices";
import { securityEvent } from "@/lib/security/log";
import { alertNewCustomerDevice } from "@/lib/security/sign-in-alerts";
import { createSession, revokeAllSessions, setSessionCookie } from "./session";

/**
 * The one way a customer gets signed in, whichever method proved who they are (phone code, email code, password,
 * Google / Facebook). Every path therefore gets the same rules:
 * - a brand-new random session token (no fixation), HttpOnly / Secure / SameSite=Lax cookie;
 * - `revokeOthers` (password set / reset): every other session of the account is signed out first;
 * - a new account records the Terms + Privacy consent (DPDP) with the notice versions in force;
 * - an existing account signing in on a new device gets the new-device alert.
 */
export type SignInMethod = "phone_otp" | "email_otp" | "password" | "google" | "facebook";

export async function completeSignIn(
  request: Request,
  response: NextResponse,
  input: { customerId: string; created: boolean; method: SignInMethod; ip: string; consent?: "checkbox" | "signup_notice"; revokeOthers?: boolean },
): Promise<void> {
  if (input.created) {
    await recordAccountConsent(resolveLedger(), {
      userId: input.customerId,
      visitorId: existingVisitor(request),
      ctx: { ip: input.ip, userAgent: userAgent(request), source: "web" },
      method: input.consent ?? "signup_notice",
    });
  }
  if (input.revokeOthers) await revokeAllSessions(input.customerId);
  setSessionCookie(response, await createSession(input.customerId));
  const device = await checkDevice("customer", input.customerId, request);
  setDeviceCookie(response, device);
  if (device.isNew && !input.created) await alertNewCustomerDevice(input.customerId, userAgent(request));
  securityEvent("login", { customer: input.customerId, kind: input.method, created: input.created });
}
