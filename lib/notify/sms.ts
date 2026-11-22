import { mockPaymentsAllowed } from "@/lib/checkout/flags";
import { BackendUnavailableError, type Env } from "@/lib/mock-guard";

/**
 * SMS provider (DLT-registered templates — PRD §7, §9). Provider pending. The demo provider does NOT send
 * anything: it hands the code back so the developer can see it on screen. It is refused on the live store
 * (same rule as the demo payment gateway).
 */
export interface SmsAdapter {
  readonly name: string;
  sendOtp(phone: string, code: string): Promise<{ demoCode?: string }>;
}

export function resolveSms(env: Env = process.env): SmsAdapter {
  if (mockPaymentsAllowed(env)) {
    return { name: "demo", sendOtp: async (_phone, code) => ({ demoCode: code }) };
  }
  return {
    name: "disabled",
    sendOtp: async () => {
      throw new BackendUnavailableError("SMS");
    },
  };
}
