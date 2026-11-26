import { ValidationError } from "@/lib/http/guard";
import { PINCODE_RE } from "@/lib/shipping";
import { asObject, cleanText, normaliseIndianMobile, rejectUnknownFields } from "@/lib/validation";

/** CHK-03 delivery address: strict server validation; state from an allow-list. */
export { INDIAN_STATES, type Address, type AddressInput, type GeoPoint } from "./address-types";
import { type GeoPoint, INDIAN_STATES, type AddressInput } from "./address-types";

/**
 * `ownPhone`: the signed-in customer's verified number. An address "for me" with the phone left empty uses it, so
 * the form never needs the full number (the browser only ever sees it masked).
 */
export function parseAddress(body: unknown, ownPhone?: string): AddressInput {
  const raw = asObject(body);
  const input = ownPhone && raw.forSomeoneElse !== true && (raw.phone === undefined || raw.phone === "") ? { ...raw, phone: ownPhone } : raw;
  rejectUnknownFields(input, ["name", "phone", "pincode", "line1", "line2", "landmark", "city", "state", "type", "alternatePhone", "instructions", "forSomeoneElse", "isDefault", "location"]);
  const name = cleanText(input.name, "Name", { min: 2, max: 80 });
  const phone = normaliseIndianMobile(input.phone);
  if (!phone) throw new ValidationError("Enter a valid 10-digit mobile number.");
  const pincode = typeof input.pincode === "string" ? input.pincode.trim() : "";
  if (!PINCODE_RE.test(pincode)) throw new ValidationError("Enter a valid 6-digit pincode.");
  const line1 = cleanText(input.line1, "Flat / house no. and building", { min: 3, max: 120 });
  const line2 = input.line2 === undefined || input.line2 === "" ? "" : cleanText(input.line2, "Area / street", { max: 120 });
  const landmark = input.landmark === undefined || input.landmark === "" ? "" : cleanText(input.landmark, "Landmark", { max: 80 });
  const city = cleanText(input.city, "City", { min: 2, max: 60 });
  const state = INDIAN_STATES.find((s) => s === input.state);
  if (!state) throw new ValidationError("Choose a state.");
  const type = input.type === "work" || input.type === "other" ? input.type : "home";
  let alternatePhone = "";
  if (input.alternatePhone !== undefined && input.alternatePhone !== "") {
    const alt = normaliseIndianMobile(input.alternatePhone);
    if (!alt) throw new ValidationError("Enter a valid 10-digit alternate number, or leave it empty.");
    if (alt === phone) throw new ValidationError("The alternate number is the same as the main one.");
    alternatePhone = alt;
  }
  const instructions = input.instructions === undefined || input.instructions === "" ? "" : cleanText(input.instructions, "Delivery instructions", { max: 200 });
  return { name, phone, pincode, line1, line2, landmark, city, state, type, alternatePhone, instructions, forSomeoneElse: input.forSomeoneElse === true, isDefault: input.isDefault === true, location: parseLocation(input.location) };
}

/**
 * A map pin: inside India's bounding box, rounded to 6 decimals (≈ 0.1 m). Anything else is refused, so a crafted
 * value can't smuggle text or extreme numbers into a courier label. Null / absent = no pin.
 */
export const INDIA_BOUNDS = { minLat: 6, maxLat: 37.6, minLng: 68, maxLng: 97.5 } as const;
export function parseLocation(raw: unknown): GeoPoint | null {
  if (raw === undefined || raw === null) return null;
  const o = asObject(raw);
  rejectUnknownFields(o, ["lat", "lng"]);
  const lat = o.lat;
  const lng = o.lng;
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) throw new ValidationError("Place the pin on the map again.");
  const b = INDIA_BOUNDS;
  if (lat < b.minLat || lat > b.maxLat || lng < b.minLng || lng > b.maxLng) throw new ValidationError("We only deliver in India — place the pin on your address.");
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}

/** CHK-07 address quality (0–100): house number, length, landmark, no junk repetition. */
export function addressQuality(a: Pick<AddressInput, "line1" | "line2" | "landmark">): number {
  let score = 40;
  if (/\d/.test(a.line1)) score += 20;
  if (a.line1.length >= 15) score += 10;
  if (a.line2.length >= 3) score += 10;
  if (a.landmark.length >= 3) score += 20;
  if (/(.)\1{4,}/.test(`${a.line1}${a.line2}`) || /^(test|asdf|xyz|abc)/i.test(a.line1)) score -= 50;
  return Math.max(0, Math.min(100, score));
}
