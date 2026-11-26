import type { TrackingConfig } from "@/lib/config/tracking";

/**
 * Consent purposes (DPDP s.6: free, specific, informed, unambiguous, unbundled).
 * Required purposes cover the service itself; optional ones are OFF by default and never bundled.
 * Strictly necessary cookies need no consent and are not a purpose here (see COOKIE_INVENTORY).
 */
export const COOKIE_PURPOSES = ["analytics", "advertising"] as const;
export type CookiePurpose = (typeof COOKIE_PURPOSES)[number];

export const COMMUNICATION_PURPOSES = ["marketing_email", "marketing_whatsapp", "marketing_sms"] as const;
export type CommunicationPurpose = (typeof COMMUNICATION_PURPOSES)[number];

/** M9 optional service purposes: each is off until the customer switches it on, and can be withdrawn. */
export const SERVICE_PURPOSES = ["alpha_club", "whatsapp_updates", "ugc_publish"] as const;
export type ServicePurpose = (typeof SERVICE_PURPOSES)[number];

/** `terms_privacy` is recorded at every account-creation path (M6). */
export type ConsentPurpose = "terms_privacy" | CookiePurpose | CommunicationPurpose | ServicePurpose;

export const PURPOSES: Record<ConsentPurpose, { label: string; description: string; required: boolean }> = {
  terms_privacy: {
    label: "Terms & Privacy Notice",
    description: "Needed to create an account and place orders.",
    required: true,
  },
  analytics: {
    label: "Analytics",
    description: "Helps us understand how the store is used so we can improve it. No ads.",
    required: false,
  },
  advertising: {
    label: "Advertising",
    description: "Lets advertising partners measure our ads and show you relevant ones on other sites.",
    required: false,
  },
  marketing_email: {
    label: "Offers by email",
    description: "New drops, sales and offers by email.",
    required: false,
  },
  marketing_whatsapp: {
    label: "Offers on WhatsApp",
    description: "New drops, sales and offers on WhatsApp.",
    required: false,
  },
  marketing_sms: {
    label: "Offers by SMS",
    description: "New drops, sales and offers by SMS to your mobile number.",
    required: false,
  },
  alpha_club: {
    label: "Alpha Club",
    description: "Earn Hood Coins on your orders, get a tier and a referral code. Uses your order history and spend.",
    required: false,
  },
  whatsapp_updates: {
    label: "Order updates on WhatsApp",
    description: "Order, delivery, return and back-in-stock updates on WhatsApp, as well as SMS and email. No offers.",
    required: false,
  },
  ugc_publish: {
    label: "Publish my #WearTheHood photo",
    description: "Show the photo you submit, with your first name, on our website after review.",
    required: false,
  },
};

export const CONSENT_STATUSES = ["granted", "denied", "withdrawn"] as const;
export type ConsentStatus = (typeof CONSENT_STATUSES)[number];

export const CONSENT_METHODS = ["checkbox", "signup_notice", "cookie_banner", "preferences", "consent_settings"] as const;
export type ConsentMethod = (typeof CONSENT_METHODS)[number];

export const CONSENT_SOURCES = ["web", "android", "ios"] as const;
export type ConsentSource = (typeof CONSENT_SOURCES)[number];

export interface CookieInfo {
  name: string;
  purpose: string;
  category: "necessary" | CookiePurpose;
  lifetime: string;
  provider: string;
}

/** Every cookie / storage key the site can set. The Cookie Policy table is generated from this list. */
export const COOKIE_INVENTORY: CookieInfo[] = [
  {
    name: "ah_vid",
    purpose: "A random visitor ID that links your cookie choices to our consent record. Not used for tracking.",
    category: "necessary",
    lifetime: "12 months",
    provider: "The Alpha Hood (first party, HTTP-only)",
  },
  {
    name: "ah_consent",
    purpose: "Remembers your cookie choices and the Cookie Policy version you saw.",
    category: "necessary",
    lifetime: "6 months",
    provider: "The Alpha Hood (first party)",
  },
  {
    name: "ah_cart",
    purpose: "Keeps your bag between visits (a random bag ID, no personal data).",
    category: "necessary",
    lifetime: "30 days",
    provider: "The Alpha Hood (first party, HTTP-only)",
  },
  {
    name: "ah_session",
    purpose: "Keeps you signed in after you verify your phone number.",
    category: "necessary",
    lifetime: "Up to 90 days (30 by default; set by the store)",
    provider: "The Alpha Hood (first party, HTTP-only)",
  },
  {
    name: "ah_device",
    purpose: "A random ID for this browser, so we can warn you when your account signs in on a device it hasn't used before. Security only — never used for tracking.",
    category: "necessary",
    lifetime: "12 months",
    provider: "The Alpha Hood (first party, HTTP-only)",
  },
  {
    name: "ah_oauth",
    purpose: "Only while you use “Continue with Google / Facebook”: ties the sign-in to this browser, so nobody else can finish it for you.",
    category: "necessary",
    lifetime: "10 minutes",
    provider: "The Alpha Hood (first party, HTTP-only)",
  },
  {
    name: "ah_social_link",
    purpose: "Only after “Continue with Google / Facebook”, until you verify your mobile number to link the two.",
    category: "necessary",
    lifetime: "10 minutes",
    provider: "The Alpha Hood (first party, HTTP-only)",
  },
  {
    name: "ah_wishlist (local storage)",
    purpose: "The products you saved to your wishlist (product IDs only). Stays on this device.",
    category: "necessary",
    lifetime: "Until you remove the items or clear it",
    provider: "The Alpha Hood (first party, this device only)",
  },
  {
    name: "ah_recent_searches (local storage)",
    purpose: "Your last 8 searches, shown when you open search. Stays on your device, never sent to us; clear it from the search screen.",
    category: "necessary",
    lifetime: "Until you clear it",
    provider: "The Alpha Hood (first party, this device only)",
  },
  {
    name: "ah_pincode (local storage)",
    purpose: "The delivery pincode you entered, so delivery dates show on every product. Stays on your device; sent to us only to look up delivery.",
    category: "necessary",
    lifetime: "Until you change or clear it",
    provider: "The Alpha Hood (first party, this device only)",
  },
  {
    name: "ah_ref",
    purpose: "A friend's Alpha Club invite code from their link, so your bag can offer the discount. No personal data.",
    category: "necessary",
    lifetime: "30 days",
    provider: "The Alpha Hood (first party)",
  },
  {
    name: "ah_recent_products (local storage)",
    purpose: "The last 12 products you looked at, shown as \"Recently viewed\". Stays on your device.",
    category: "necessary",
    lifetime: "Until you clear it",
    provider: "The Alpha Hood (first party, this device only)",
  },
  {
    name: "ah_ab_id (local storage)",
    purpose: "A random id that keeps you in the same version of a page test. Only set if you accept analytics.",
    category: "analytics",
    lifetime: "Until you clear it",
    provider: "The Alpha Hood (first party, this device only)",
  },
  {
    name: "Service worker cache",
    purpose: "Keeps our logo, images and scripts (never your pages or data) so the store loads fast and shows an offline page.",
    category: "necessary",
    lifetime: "Until the next app update",
    provider: "The Alpha Hood (first party, this device only)",
  },
  {
    name: "_ga, _ga_<ID>",
    purpose: "Google Analytics 4: distinguishes visitors and sessions to measure site usage.",
    category: "analytics",
    lifetime: "Up to 13 months",
    provider: "Google (third party)",
  },
  {
    name: "_fbp",
    purpose: "Meta Pixel: measures ad performance and builds ad audiences.",
    category: "advertising",
    lifetime: "3 months",
    provider: "Meta (third party)",
  },
  {
    name: "_fbc",
    purpose: "Meta Pixel: remembers the Meta ad you clicked to reach us, to measure that ad.",
    category: "advertising",
    lifetime: "3 months",
    provider: "Meta (third party)",
  },
  {
    name: "_gcl_au, _gcl_aw",
    purpose: "Google Ads: links a purchase to the Google ad you clicked, to measure that ad.",
    category: "advertising",
    lifetime: "3 months",
    provider: "Google (third party)",
  },
  {
    name: "ah_tracked_orders (local storage)",
    purpose: "Order numbers already reported to analytics/ads from this device, so a purchase is counted once. Only written if you accepted analytics or advertising.",
    category: "analytics",
    lifetime: "Until you clear it (last 20 orders)",
    provider: "The Alpha Hood (first party, this device only)",
  },
];

/** Cookie name prefixes to delete immediately when a purpose is withdrawn. */
/** Device storage keys (localStorage) to clear when a purpose is withdrawn. */
export const PURPOSE_STORAGE_KEYS: Record<CookiePurpose, string[]> = {
  analytics: ["ah_ab_id", "ah_tracked_orders"],
  advertising: ["ah_tracked_orders"],
};

export const PURPOSE_COOKIE_PREFIXES: Record<CookiePurpose, string[]> = {
  analytics: ["_ga", "_gid", "_gat"],
  advertising: ["_fbp", "_fbc", "_gcl_"],
};

/** A cookie purpose is offered to visitors only when its tracker is actually configured. */
export function activeCookiePurposes(tracking: TrackingConfig): CookiePurpose[] {
  const active: CookiePurpose[] = [];
  if (tracking.ga4Id) active.push("analytics");
  if (tracking.metaPixelId || tracking.googleAdsId) active.push("advertising");
  return active;
}
