import { NextResponse } from "next/server";
import { TenderError } from "@/lib/wallet/tenders";
import { AlertError } from "@/lib/alerts/service";
import { LoyaltyError } from "@/lib/loyalty/service";
import { UgcError } from "@/lib/ugc/service";
import { AccountError } from "@/lib/account/service";
import { OtpError } from "@/lib/auth/otp";
import { OrderActionError } from "@/lib/orders/lifecycle";
import { ReturnError } from "@/lib/returns/service";
import { customerIdFromRequest } from "@/lib/auth/session";
import { accountsEnabled, checkoutEnabled } from "@/lib/checkout/flags";
import { CheckoutError } from "@/lib/checkout/service";
import { CommerceError } from "@/lib/commerce/types";
import { readCookie } from "@/lib/consent/cookie";
import { errorResponse, jsonError, PRIVATE_NO_STORE } from "./guard";

/** Cart cookie (CART-04): the cart id is a 128-bit random bearer value, HttpOnly, 30 days. */
export const CART_COOKIE = "ah_cart";
export const CART_MAX_AGE = 30 * 86_400;
const CART_ID_RE = /^cart_[a-f0-9]{32}$/;

export function cartIdFrom(request: Request): string | null {
  const v = readCookie(request.headers.get("cookie"), CART_COOKIE);
  return v && CART_ID_RE.test(v) ? v : null;
}

export function setCartCookie(response: NextResponse, cartId: string) {
  response.cookies.set(CART_COOKIE, cartId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: CART_MAX_AGE,
  });
}

export function privateJson(body: unknown, init: { status?: number } = {}) {
  return NextResponse.json(body, { status: init.status ?? 200, headers: PRIVATE_NO_STORE });
}

/** Signed-in customer id or a 401 response. */
export function requireCustomer(request: Request): { ok: true; customerId: string } | { ok: false; response: Response } {
  try {
    const id = customerIdFromRequest(request);
    if (id) return { ok: true, customerId: id };
  } catch (error) {
    return { ok: false, response: errorResponse(error) };
  }
  return { ok: false, response: jsonError(401, "unauthenticated", "Please verify your phone number to continue.") };
}

/** Maps domain errors to safe HTTP responses (no internals). */
export function commerceErrorResponse(error: unknown): Response {
  if (error instanceof CheckoutError) {
    return Response.json({ error: { code: error.code, message: error.message, ...error.details } }, { status: error.status, headers: PRIVATE_NO_STORE });
  }
  if (error instanceof CommerceError) {
    const status = error.code === "not_found" ? 404 : error.code === "out_of_stock" || error.code === "limit_exceeded" ? 409 : 422;
    return jsonError(status, error.code, error.message);
  }
  if (error instanceof OrderActionError || error instanceof ReturnError) {
    return jsonError(error.status, error.code, error.message);
  }
  if (error instanceof AccountError) return jsonError(409, error.code, error.message);
  if (error instanceof AlertError || error instanceof LoyaltyError || error instanceof UgcError || error instanceof TenderError) return jsonError(error.status, error.code, error.message);
  if (error instanceof OtpError) {
    const status = error.code === "cooldown" || error.code === "limited" ? 429 : 422;
    return jsonError(status, error.code, error.message, error.retryAfterSeconds ? { "Retry-After": String(error.retryAfterSeconds) } : undefined);
  }
  return errorResponse(error);
}

/** Account area routes: accounts switched on (fail closed) + a signed-in customer. */
export function requireAccount(request: Request): { ok: true; customerId: string } | { ok: false; response: Response } {
  if (!accountsEnabled() && !checkoutEnabled()) {
    return { ok: false, response: jsonError(503, "accounts_disabled", "Your account is temporarily unavailable.") };
  }
  return requireCustomer(request);
}
