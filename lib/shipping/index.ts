import { pincodePlace } from "@/lib/geo/pincodes";
import { rupees } from "@/lib/format";
import { BackendUnavailableError, type Env, mockDataAllowed } from "@/lib/mock-guard";
import { securityEvent } from "@/lib/security/log";
import { addBusinessDays, COD, type DeliveryPromise, PINCODE_RE, type ShippingAdapter } from "./common";
import { liveShiprocket } from "./runtime";
import { type Fetcher, shiprocketCheck, ShiprocketError, type ShiprocketConfig } from "./shiprocket";

/**
 * PDP-05 delivery promise via the shipping partner. The storefront only uses `ShippingAdapter`.
 * - Shiprocket, when it is live in Admin → Shipping (owner sets the API user + pickup pincode, tests, activates).
 * - Otherwise the development demo (deterministic by pincode region), refused in production.
 * Town and state come from the courier, else from the India Post directory (lib/geo/pincodes.ts).
 * Answers are cached per pincode for 6 hours in this process (couriers change serviceability rarely; it keeps
 * Shiprocket calls low). The pincode is used only for the lookup — not stored or logged.
 */
export { addBusinessDays, COD, PINCODE_RE };
export type { DeliveryPromise, ShippingAdapter };

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

const awb = () => String(Math.floor(1e11 + Math.random() * 9e11));

export function createMockShipping(): ShippingAdapter {
  return {
    name: "demo",
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

/** Shiprocket for delivery checks. Shipment / pickup booking through Shiprocket isn't built yet (fails closed). */
export function createShiprocketShipping(cfg: ShiprocketConfig, fetcher: Fetcher = fetch): ShippingAdapter {
  const notYet = async (): Promise<never> => {
    throw new BackendUnavailableError("Shiprocket shipments");
  };
  return {
    name: "shiprocket",
    async check(pincode, now = new Date()) {
      try {
        const { couriers: _n, ...promise } = await shiprocketCheck(cfg, pincode, fetcher, now);
        void _n;
        return promise;
      } catch (e) {
        if (e instanceof ShiprocketError && e.code === "auth") securityEvent("provider_changed", { area: "shipping", action: "auth_failed" });
        // The shopper sees "couldn't check right now", never Shiprocket's text.
        throw new BackendUnavailableError("Delivery check");
      }
    },
    createShipment: notYet,
    bookPickup: notYet,
  };
}

export function resolveShipping(env: Env = process.env): ShippingAdapter {
  // The live account applies to the real process environment only (tests pass their own `env`).
  const live = env === process.env ? liveShiprocket() : null;
  if (live) return createShiprocketShipping(live);
  if (mockDataAllowed(env)) return createMockShipping();
  const fail = async (): Promise<never> => {
    throw new BackendUnavailableError("Shipping");
  };
  return { name: "disabled", check: fail, createShipment: fail, bookPickup: fail };
}

// ── Per-pincode cache + town / state names ──────────────────────────────────────────────────────

const CACHE_MS = 6 * 3_600_000;
const CACHE_MAX = 5_000;
const g = globalThis as unknown as { __alpha_hood_delivery_cache?: Map<string, { at: number; day: string; promise: DeliveryPromise }> };
const cache = () => (g.__alpha_hood_delivery_cache ??= new Map());
export const clearDeliveryCache = () => cache().clear();

const istDay = (now: Date) => new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);

/** Fills in the town / state from the India Post directory when the courier didn't name them. */
export function withPlace(p: DeliveryPromise): DeliveryPromise {
  if (p.city && p.state) return p;
  const place = pincodePlace(p.pincode);
  return place ? { ...p, city: p.city ?? place.city, state: p.state ?? place.state } : p;
}

/**
 * The adapter the store uses, resolved at call time (so a provider made live in the admin applies at once):
 * cached per pincode and per IST day (dates move at midnight) and per adapter.
 */
export const shipping: ShippingAdapter = {
  get name() {
    return resolveShipping().name;
  },
  async check(pincode, now = new Date()) {
    const adapter = resolveShipping();
    const key = `${adapter.name}:${pincode}`;
    const hit = cache().get(key);
    if (hit && now.getTime() - hit.at < CACHE_MS && hit.day === istDay(now)) return hit.promise;
    const promise = withPlace(await adapter.check(pincode, now));
    if (cache().size >= CACHE_MAX) cache().clear();
    cache().set(key, { at: now.getTime(), day: istDay(now), promise });
    return promise;
  },
  createShipment: (orderNumber) => resolveShipping().createShipment(orderNumber),
  bookPickup: (ref, input) => resolveShipping().bookPickup(ref, input),
};

/** Free standard shipping above the threshold (STORE_CONFIG). */
export { shippingFee } from "./fee";
