import { STORE_CONFIG } from "@/lib/config/store";
import type { Paise } from "@/lib/format";
import { rupees } from "@/lib/format";
import { BackendUnavailableError, type Env, mockDataAllowed } from "@/lib/mock-guard";

/**
 * PDP-05 delivery promise via the shipping partner (Shiprocket / Delhivery — PRD §9). The storefront only
 * uses `ShippingAdapter`. Mock: deterministic by pincode region, refused in production.
 */
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

const REGIONS: Record<string, { city: string; state: string; days: number; express: boolean }> = {
  "11": { city: "New Delhi", state: "Delhi", days: 2, express: true },
  "12": { city: "Gurugram", state: "Haryana", days: 3, express: true },
  "40": { city: "Mumbai", state: "Maharashtra", days: 2, express: true },
  "41": { city: "Pune", state: "Maharashtra", days: 3, express: true },
  "56": { city: "Bengaluru", state: "Karnataka", days: 3, express: true },
  "60": { city: "Chennai", state: "Tamil Nadu", days: 3, express: true },
  "50": { city: "Hyderabad", state: "Telangana", days: 3, express: true },
  "70": { city: "Kolkata", state: "West Bengal", days: 4, express: false },
  "38": { city: "Ahmedabad", state: "Gujarat", days: 3, express: false },
  "30": { city: "Jaipur", state: "Rajasthan", days: 4, express: false },
};

/** Demo unserviceable / prepaid-only areas (remote pincode ranges). */
const UNSERVICEABLE_PREFIXES = ["744", "194"];
const PREPAID_ONLY_PREFIXES = ["79", "18"];

export const COD = { fee: rupees(49), maxOrderValue: rupees(5000) };

const awb = () => String(Math.floor(1e11 + Math.random() * 9e11));

export function createMockShipping(): ShippingAdapter {
  return {
    async createShipment() {
      return { courier: "Demo Courier", awb: awb() };
    },
    async bookPickup(_ref, { pincode }) {
      if (!PINCODE_RE.test(pincode)) throw new Error("invalid pincode");
      return { courier: "Demo Courier", awb: awb() };
    },
    async check(pincode, now = new Date()) {
      if (!PINCODE_RE.test(pincode)) throw new Error("invalid pincode");
      if (UNSERVICEABLE_PREFIXES.some((p) => pincode.startsWith(p))) {
        return { pincode, serviceable: false, cod: { available: false, fee: COD.fee, maxOrderValue: COD.maxOrderValue } };
      }
      const region = REGIONS[pincode.slice(0, 2)];
      const days = region?.days ?? 6;
      return {
        pincode,
        serviceable: true,
        city: region?.city,
        state: region?.state,
        standardBy: addBusinessDays(now, days),
        express: region?.express ? { by: addBusinessDays(now, 1), fee: rupees(99) } : null,
        cod: {
          available: !PREPAID_ONLY_PREFIXES.some((p) => pincode.startsWith(p)),
          fee: COD.fee,
          maxOrderValue: COD.maxOrderValue,
        },
      };
    },
  };
}

export function resolveShipping(env: Env = process.env): ShippingAdapter {
  if (mockDataAllowed(env)) return createMockShipping();
  const fail = async (): Promise<never> => {
    throw new BackendUnavailableError("Shipping");
  };
  return { check: fail, createShipment: fail, bookPickup: fail };
}

export const shipping = resolveShipping();

/** Free standard shipping above the threshold (STORE_CONFIG). */
export function shippingFee(subtotal: Paise): Paise {
  return subtotal >= STORE_CONFIG.freeShippingThreshold ? 0 : rupees(79);
}
