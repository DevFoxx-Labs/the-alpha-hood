/** Address shapes and the state allow-list — shared by the server validator and the checkout form. */
export const INDIAN_STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh",
  "Jammu and Kashmir", "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra",
  "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim",
  "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
] as const;

export interface Address {
  id: string;
  name: string;
  phone: string;
  pincode: string;
  line1: string;
  line2: string;
  landmark: string;
  city: string;
  state: (typeof INDIAN_STATES)[number];
  type: "home" | "work" | "other";
}

export type AddressInput = Omit<Address, "id">;
