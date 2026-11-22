import type { Env } from "@/lib/mock-guard";

/**
 * Legal / contact facts used in every notice. Never invented: each value comes from the environment and,
 * until the owner provides it, renders as a clearly marked placeholder (see docs/owner-todo.md).
 */
export const PLACEHOLDER_PREFIX = "[TO BE PROVIDED:";

const FIELDS = {
  entityName: ["LEGAL_ENTITY_NAME", "registered company name"],
  registeredAddress: ["LEGAL_REGISTERED_ADDRESS", "registered office address"],
  gstin: ["LEGAL_GSTIN", "GSTIN"],
  jurisdictionCity: ["LEGAL_JURISDICTION_CITY", "city for courts' jurisdiction"],
  supportEmail: ["SUPPORT_EMAIL", "customer support email"],
  supportPhone: ["SUPPORT_PHONE", "customer support phone"],
  supportHours: ["SUPPORT_HOURS", "support hours"],
  privacyEmail: ["PRIVACY_EMAIL", "privacy contact email"],
  grievanceName: ["GRIEVANCE_OFFICER_NAME", "Grievance Officer name"],
  grievanceDesignation: ["GRIEVANCE_OFFICER_DESIGNATION", "Grievance Officer designation"],
  grievanceEmail: ["GRIEVANCE_OFFICER_EMAIL", "Grievance Officer email"],
  grievancePhone: ["GRIEVANCE_OFFICER_PHONE", "Grievance Officer phone"],
} as const satisfies Record<string, readonly [string, string]>;

export type LegalField = keyof typeof FIELDS;
export type LegalConfig = Record<LegalField, string> & {
  /** Grievance acknowledgement / resolution timelines (Consumer Protection (E-Commerce) Rules 2020 r.4(5)). */
  acknowledgeWithinHours: number;
  resolveWithinDays: number;
};

const MAX_LEN = 300;

export function readLegalConfig(env: Env = process.env): LegalConfig {
  const values = {} as Record<LegalField, string>;
  for (const [key, [envName, label]] of Object.entries(FIELDS) as [LegalField, readonly [string, string]][]) {
    const raw = env[envName]?.trim();
    values[key] = raw ? raw.slice(0, MAX_LEN) : `${PLACEHOLDER_PREFIX} ${label}]`;
  }
  return { ...values, acknowledgeWithinHours: 48, resolveWithinDays: 30 };
}

export function missingLegalFields(config: LegalConfig): LegalField[] {
  return (Object.keys(FIELDS) as LegalField[]).filter((k) => config[k].startsWith(PLACEHOLDER_PREFIX));
}

export function isPlaceholder(value: string): boolean {
  return value.startsWith(PLACEHOLDER_PREFIX);
}

export const LEGAL_CONFIG = readLegalConfig();
