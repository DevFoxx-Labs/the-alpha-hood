/** Address shapes and the state allow-list — shared by the server validator and the checkout form. */
export const INDIAN_STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh",
  "Jammu and Kashmir", "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra",
  "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim",
  "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
] as const;

/** A map pin (decimal degrees, 6 places ≈ 0.1 m). Chosen on the map or with "use my current location". */
export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface Address {
  id: string;
  /** Who receives the parcel (the customer, or someone they order for). */
  name: string;
  phone: string;
  pincode: string;
  /** Flat / house no., floor, building, company, apartment. */
  line1: string;
  /** Area, street, sector, village. */
  line2: string;
  landmark: string;
  city: string;
  state: (typeof INDIAN_STATES)[number];
  type: "home" | "work" | "other";
  /** Optional second number the courier can call. */
  alternatePhone?: string;
  /** Optional note for the courier (gate code, best time…). */
  instructions?: string;
  /** Saved for someone else (a gift, family) — shown as such in the address book. */
  forSomeoneElse?: boolean;
  /** Pre-selected at checkout. At most one per customer. */
  isDefault?: boolean;
  /** Map pin for the courier; null when the customer didn't place one. Never shown as numbers. */
  location?: GeoPoint | null;
}

export type AddressInput = Omit<Address, "id">;
