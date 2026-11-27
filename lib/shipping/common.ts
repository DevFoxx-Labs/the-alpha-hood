import { STORE_CONFIG } from "@/lib/config/store";
import type { Paise } from "@/lib/format";

/** Shared by the shipping adapters (mock, Shiprocket) and the delivery promise. No server-only imports. */
export const PINCODE_RE = /^[1-9][0-9]{5}$/;

export interface DeliveryPromise {
  pincode: string;
  serviceable: boolean;
  city?: string;
  state?: string;
  /** ISO date (IST calendar day) of the standard delivery estimate. */
  standardBy?: string;
  express?: { by: string; fee: Paise } | null;
  cod: { available: boolean; fee: Paise; maxOrderValue: Paise };
}

export interface ShippingAdapter {
  /** Name shown in logs / admin ("demo", "shiprocket", "disabled"). */
  name?: string;
  check(pincode: string, now?: Date): Promise<DeliveryPromise>;
  /** Forward shipment at dispatch (ORD-01 tracking). */
  createShipment(orderNumber: string): Promise<{ courier: string; awb: string }>;
  /** RET-04 reverse pickup. */
  bookPickup(returnNumber: string, input: { pincode: string; date: string; slot: "morning" | "afternoon" }): Promise<{ courier: string; awb: string }>;
}

/** Adds business days (Sundays skipped), in IST, from an order placed `now`. Dispatch cut-off 2 pm IST. */
export function addBusinessDays(now: Date, days: number): string {
  const ist = new Date(now.getTime() + 330 * 60_000);
  let d = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
  let remaining = days + (ist.getUTCHours() >= 14 ? 1 : 0);
  while (remaining > 0) {
    d = new Date(d.getTime() + 86_400_000);
    if (d.getUTCDay() !== 0) remaining--;
  }
  return d.toISOString().slice(0, 10);
}

export const COD = { fee: STORE_CONFIG.codFee, maxOrderValue: STORE_CONFIG.codMaxOrderValue };
