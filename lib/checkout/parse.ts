import { ValidationError } from "@/lib/http/guard";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/pricing/price-cart";

/** Allow-list parsers for checkout request fields. */
export const ADDRESS_ID_RE = /^adr_[A-Za-z0-9_-]{8,20}$/;
export const ORDER_NUMBER_RE = /^AH[0-9A-Z]{8}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UPI_APPS = ["gpay", "phonepe", "paytm", "other"] as const;

export function parseSpeed(v: unknown): "standard" | "express" {
  if (v === undefined || v === "standard") return "standard";
  if (v === "express") return "express";
  throw new ValidationError("Choose a delivery speed.");
}

export function parsePayment(v: unknown, { optional = false } = {}): PaymentMethod | null {
  if ((v === undefined || v === null) && optional) return null;
  if (typeof v === "string" && (PAYMENT_METHODS as string[]).includes(v)) return v as PaymentMethod;
  throw new ValidationError("Choose a payment method.");
}

export function parseAddressId(v: unknown, { optional = false } = {}): string | null {
  if ((v === undefined || v === null) && optional) return null;
  if (typeof v === "string" && ADDRESS_ID_RE.test(v)) return v;
  throw new ValidationError("Choose a delivery address.");
}

export function parseIdempotencyKey(request: Request): string {
  const key = request.headers.get("idempotency-key") ?? "";
  if (!UUID_RE.test(key)) throw new ValidationError("Missing Idempotency-Key.");
  return key.toLowerCase();
}

export function parseUpiApp(v: unknown): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v === "string" && (UPI_APPS as readonly string[]).includes(v)) return v;
  throw new ValidationError("Unknown UPI app.");
}

export function parseAmount(v: unknown): number {
  if (typeof v === "number" && Number.isSafeInteger(v) && v > 0) return v;
  throw new ValidationError("Missing total.");
}
