import { ValidationError } from "@/lib/http/guard";
import { PINCODE_RE } from "@/lib/shipping";
import { asObject, cleanText, normaliseIndianMobile, rejectUnknownFields } from "@/lib/validation";

/** CHK-03 delivery address: strict server validation; state from an allow-list. */
export { INDIAN_STATES, type Address, type AddressInput } from "./address-types";
import { INDIAN_STATES, type AddressInput } from "./address-types";

export function parseAddress(body: unknown): AddressInput {
  const input = asObject(body);
  rejectUnknownFields(input, ["name", "phone", "pincode", "line1", "line2", "landmark", "city", "state", "type"]);
  const name = cleanText(input.name, "Name", { min: 2, max: 80 });
  const phone = normaliseIndianMobile(input.phone);
  if (!phone) throw new ValidationError("Enter a valid 10-digit mobile number.");
  const pincode = typeof input.pincode === "string" ? input.pincode.trim() : "";
  if (!PINCODE_RE.test(pincode)) throw new ValidationError("Enter a valid 6-digit pincode.");
  const line1 = cleanText(input.line1, "House / flat and street", { min: 5, max: 120 });
  const line2 = input.line2 === undefined || input.line2 === "" ? "" : cleanText(input.line2, "Area", { max: 120 });
  const landmark = input.landmark === undefined || input.landmark === "" ? "" : cleanText(input.landmark, "Landmark", { max: 80 });
  const city = cleanText(input.city, "City", { min: 2, max: 60 });
  const state = INDIAN_STATES.find((s) => s === input.state);
  if (!state) throw new ValidationError("Choose a state.");
  const type = input.type === "work" || input.type === "other" ? input.type : "home";
  return { name, phone, pincode, line1, line2, landmark, city, state, type };
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
