import type { Env } from "@/lib/mock-guard";

/**
 * ANL-03 customer-data / marketing-automation platform (Klaviyo, MoEngage, WebEngage…). Provider not chosen
 * (PRD §9), so this is the seam the flows will call. Fail closed: with no provider + key configured, nothing
 * leaves the store. When one is added it must (a) receive only customers with marketing consent, (b) get ids and
 * consented channels only — never addresses, order contents beyond what the journey needs, or OTPs — and
 * (c) be listed in the Privacy Notice before it's switched on.
 */
export const PROVIDERS = ["klaviyo", "moengage", "webengage"] as const;
export type Provider = (typeof PROVIDERS)[number];

export interface AutomationConfig {
  provider: Provider;
}

export function readAutomation(env: Env = process.env): AutomationConfig | null {
  const p = env.MARKETING_PROVIDER?.trim() as Provider | undefined;
  const key = env.MARKETING_API_KEY?.trim() ?? "";
  if (!p || !(PROVIDERS as readonly string[]).includes(p) || key.length < 16) return null;
  if (env.MARKETING_AUTOMATION_ENABLED !== "true") return null;
  return { provider: p };
}

export interface AutomationClient {
  readonly enabled: boolean;
  /** Sync one consenting profile (customer id + which channels they agreed to). */
  syncProfile(input: { customerId: string; channels: ("email" | "whatsapp")[] }): Promise<void>;
}

/** No provider SDK is bundled yet: even a configured provider stays a no-op until its client is written. */
export function automationClient(env: Env = process.env): AutomationClient {
  const cfg = readAutomation(env);
  return {
    enabled: false,
    async syncProfile(input) {
      if (!cfg || input.channels.length === 0) return;
      // Provider client goes here (owner decision pending). Intentionally no network call.
    },
  };
}
