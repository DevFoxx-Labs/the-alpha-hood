import type { Env } from "@/lib/mock-guard";
import { setActiveEmail } from "@/lib/notify/email";
import { emailAdapterFor, type EmailProviderDoc } from "./email-transport";
import { type ProviderStore, resolveProviderStore } from "./store";

/**
 * Which email provider is live for this server process (same pattern as lib/providers/sms-runtime.ts): loaded at
 * boot, re-read after every admin change on this instance, refreshed every minute for the other instances.
 * No live provider (or the database is down) = the environment's email settings, as before.
 */
export const EMAIL_REFRESH_MS = 60_000;
const g = globalThis as { __alpha_hood_email_runtime_timer?: ReturnType<typeof setInterval> };

export async function refreshActiveEmail(store?: ProviderStore, env: Env = process.env): Promise<boolean> {
  try {
    const rows = await (store ?? resolveProviderStore(env)).list<EmailProviderDoc>("email");
    const live = rows.find((r) => r.active && r.doc);
    setActiveEmail(live?.doc ? emailAdapterFor(live.doc) : null);
    return true;
  } catch {
    return false;
  }
}

export async function startEmailRuntime(): Promise<void> {
  await refreshActiveEmail();
  if (g.__alpha_hood_email_runtime_timer) return;
  g.__alpha_hood_email_runtime_timer = setInterval(() => void refreshActiveEmail(), EMAIL_REFRESH_MS);
  g.__alpha_hood_email_runtime_timer.unref?.();
}
