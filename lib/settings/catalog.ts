/**
 * Settings catalogue — Admin → Settings. The ONLY place a setting is declared: adding a field here gives it the
 * form control, the validation rule, the environment override and the "Database / .env / Not set" badge.
 *
 * Each field overrides one environment variable. A value saved in the admin wins; with nothing saved the
 * variable keeps whatever the host's environment gave it, so an empty table changes nothing and removing a saved
 * value puts the environment back.
 *
 * NOT here, deliberately — these can never come from the database:
 *   DATABASE_DRIVER / DATABASE_URL        needed to read the table in the first place
 *   SECRET_BOX_KEY (+ previous keys)      decrypts this very table
 *   OTP_PEPPER, ADMIN_SETUP_TOKEN, CRON_SECRET   authentication roots; rotating them is a deploy decision
 *   SITE_URL, COMMERCE_PROVIDER, CMS_PROVIDER    deploy-level wiring
 *   ALLOW_MOCK_DATA, ALLOW_MOCK_PAYMENTS, ENABLE_DEV_PAGES   preview-only switches: a signed-in admin must never
 *                                         be able to turn demo payments or dev pages on for the live store
 */
export type SettingType = "string" | "text" | "email" | "url" | "bool" | "select";

export interface SettingField {
  /** Environment variable this field overrides. */
  env: string;
  label: string;
  type: SettingType;
  /** Write-only: encrypted like everything else AND never sent back to a browser. */
  secret?: boolean;
  /** The feature does not work without it (drives the "Missing" badge). */
  required?: boolean;
  help?: string;
  placeholder?: string;
  options?: readonly { value: string; label: string }[];
  /** Extra shape check for string fields. */
  pattern?: RegExp;
  patternHint?: string;
  max?: number;
}

export interface SettingGroup {
  id: string;
  label: string;
  description: string;
  /** Shown in an amber notice above the form. */
  warning?: string;
  /** Saving needs a fresh authenticator code, even inside a signed-in session (money and credentials). */
  stepUp?: boolean;
  fields: readonly SettingField[];
}

const HTTPS_HELP = "Full https:// address. Empty = not shown.";

export const SETTING_GROUPS: readonly SettingGroup[] = [
  {
    id: "general",
    label: "General",
    description: "Support contact details shown across the store and in every notice, and the footer's social links.",
    fields: [
      { env: "SUPPORT_EMAIL", label: "Support email", type: "email", required: true, placeholder: "support@example.com" },
      { env: "SUPPORT_PHONE", label: "Support phone", type: "string", max: 30, pattern: /^\+?[0-9][0-9 ()-]{6,28}$/, patternHint: "Digits, spaces and + only.", placeholder: "+91 98XXXXXXXX" },
      { env: "SUPPORT_HOURS", label: "Support hours", type: "string", max: 120, placeholder: "Mon–Sat, 10 am – 7 pm IST" },
      { env: "SOCIAL_INSTAGRAM_URL", label: "Instagram", type: "url", help: HTTPS_HELP },
      { env: "SOCIAL_YOUTUBE_URL", label: "YouTube", type: "url", help: HTTPS_HELP },
      { env: "SOCIAL_FACEBOOK_URL", label: "Facebook", type: "url", help: HTTPS_HELP },
      { env: "SOCIAL_X_URL", label: "X", type: "url", help: HTTPS_HELP },
    ],
  },
  {
    id: "legal",
    label: "Legal & Grievance",
    description:
      "Company and Grievance Officer details required by the DPDP Act and the Consumer Protection (E-Commerce) Rules. They are filled into the Privacy Notice, Terms, Refund and Cookie policies and the footer.",
    warning: "These details appear in legal notices. Have a lawyer confirm them — this is not legal advice.",
    fields: [
      { env: "LEGAL_ENTITY_NAME", label: "Company legal name", type: "string", required: true, max: 150, placeholder: "e.g. Example Retail Private Limited" },
      { env: "LEGAL_REGISTERED_ADDRESS", label: "Registered office address", type: "text", required: true, max: 300 },
      { env: "LEGAL_GSTIN", label: "GSTIN", type: "string", max: 15, pattern: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, patternHint: "15 characters, capitals, e.g. 27ABCDE1234F1Z5." },
      { env: "LEGAL_JURISDICTION_CITY", label: "Courts' jurisdiction (city)", type: "string", required: true, max: 80 },
      { env: "PRIVACY_EMAIL", label: "Privacy contact email", type: "email", required: true },
      { env: "GRIEVANCE_OFFICER_NAME", label: "Grievance Officer name", type: "string", required: true, max: 150 },
      { env: "GRIEVANCE_OFFICER_DESIGNATION", label: "Grievance Officer designation", type: "string", required: true, max: 150 },
      { env: "GRIEVANCE_OFFICER_EMAIL", label: "Grievance Officer email", type: "email", required: true },
      { env: "GRIEVANCE_OFFICER_PHONE", label: "Grievance Officer phone", type: "string", max: 30, pattern: /^\+?[0-9][0-9 ()-]{6,28}$/, patternHint: "Digits, spaces and + only." },
    ],
  },
  {
    id: "checkout",
    label: "Checkout & Accounts",
    description: "Kill switches. Each one is on only while it is switched on here (or set to \"true\" in the environment) — turn one off to pause it at once.",
    warning: "Switching checkout off stops every new order immediately. Orders already placed are not affected.",
    fields: [
      { env: "CHECKOUT_ENABLED", label: "Checkout", type: "bool", help: "Shoppers can place orders." },
      { env: "COD_ENABLED", label: "Cash on delivery", type: "bool", help: "Offered at checkout, within the COD order limit. Needs checkout on." },
      { env: "ACCOUNTS_ENABLED", label: "Customer accounts", type: "bool", help: "Sign-in, order history, returns and privacy actions." },
    ],
  },
  {
    id: "payments",
    label: "Payments",
    description:
      "Razorpay hosted Payment Links (UPI, cards, netbanking, wallets). The key ID is not secret; the key secret and the webhook secret are. Without the webhook secret a paid order never confirms.",
    warning: "Whoever can change these controls where the store's money goes. Use live keys (rzp_live_…) on the live store only.",
    stepUp: true,
    fields: [
      { env: "PAYMENT_GATEWAY", label: "Gateway", type: "select", required: true, options: [{ value: "razorpay", label: "Razorpay" }], help: "Not set = no online payments (demo gateway in development only)." },
      { env: "RAZORPAY_KEY_ID", label: "Key ID", type: "string", required: true, max: 60, pattern: /^rzp_(live|test)_[A-Za-z0-9]{8,32}$/, patternHint: "Starts with rzp_live_ or rzp_test_." },
      { env: "RAZORPAY_KEY_SECRET", label: "Key secret", type: "string", secret: true, required: true, max: 200 },
      { env: "RAZORPAY_WEBHOOK_SECRET", label: "Webhook secret", type: "string", secret: true, required: true, max: 200, help: "Razorpay → Settings → Webhooks. Must match exactly, or every webhook is refused." },
    ],
  },
  {
    id: "tracking",
    label: "Analytics & Ads",
    description:
      "Measurement IDs are public and reach the browser only after the shopper accepts the matching cookie category. The API secret and Conversions API token stay on the server.",
    warning: "Before adding an ID, make sure the tracker is listed in the Cookie Policy and the Privacy Notice (DPDP).",
    fields: [
      { env: "GA4_MEASUREMENT_ID", label: "GA4 measurement ID", type: "string", max: 20, pattern: /^G-[A-Z0-9]{4,16}$/, patternHint: "Looks like G-XXXXXXX.", help: "Analytics cookies." },
      { env: "GA4_API_SECRET", label: "GA4 Measurement Protocol secret", type: "string", secret: true, max: 200, help: "Server-side purchase and refund events." },
      { env: "META_PIXEL_ID", label: "Meta Pixel ID", type: "string", max: 20, pattern: /^\d{6,20}$/, patternHint: "Digits only.", help: "Advertising cookies." },
      { env: "META_CAPI_TOKEN", label: "Meta Conversions API token", type: "string", secret: true, max: 500 },
      { env: "META_TEST_EVENT_CODE", label: "Meta test event code", type: "string", max: 20, pattern: /^TEST[0-9A-Z]{1,16}$/, patternHint: "Looks like TEST12345.", help: "Routes server events to the Events Manager test view. Remove after validating." },
      { env: "GOOGLE_ADS_ID", label: "Google Ads conversion ID", type: "string", max: 20, pattern: /^AW-\d{6,14}$/, patternHint: "Looks like AW-123456789.", help: "Advertising cookies." },
      { env: "GOOGLE_ADS_PURCHASE_LABEL", label: "Google Ads purchase label", type: "string", max: 40, pattern: /^[A-Za-z0-9_-]{4,40}$/, patternHint: "Letters, digits, - and _ only." },
    ],
  },
  {
    id: "seo",
    label: "Search Engines",
    description: "Whether search engines may index the store. Off = robots.txt disallows everything and every page is noindex.",
    warning: "Switch this on at launch only. It also needs a production build with the real site address and no demo data.",
    fields: [{ env: "ALLOW_INDEXING", label: "Allow indexing", type: "bool", help: "Search engines may crawl and list the store." }],
  },
];

const BY_ID = new Map(SETTING_GROUPS.map((g) => [g.id, g]));
export const settingGroup = (id: string): SettingGroup | null => BY_ID.get(id) ?? null;

/** Every environment variable the settings may override — nothing outside this list is ever written. */
export const SETTING_ENV_KEYS: readonly string[] = SETTING_GROUPS.flatMap((g) => g.fields.map((f) => f.env));
