import type { Env } from "@/lib/mock-guard";
import { setActiveSms } from "@/lib/notify/sms";
import { type SmsProviderDoc, smsAdapterFor } from "./sms-gateway";
import { type ProviderStore, resolveProviderStore } from "./store";

/**
 * Which SMS provider is live for this server process. `resolveSms()` is synchronous and called at send time, so
 * the active provider is kept in memory: loaded at boot (instrumentation.ts), re-read after every admin change on
 * this instance, and refreshed on a timer so other instances follow within a minute.
 * No active provider (or the database is down) = the environment's SMS settings, exactly as before.
 */
export const SMS_REFRESH_MS = 60_000;

const g = globalThis as { __alpha_hood_sms_runtime_timer?: ReturnType<typeof setInterval> };

/** Reads the store and installs the active provider. Never throws: on failure the current one stays. */
export async function refreshActiveSms(store?: ProviderStore, env: Env = process.env): Promise<boolean> {
  try {
    const rows = await (store ?? resolveProviderStore(env)).list<SmsProviderDoc>("sms");
    const live = rows.find((r) => r.active && r.doc);
    setActiveSms(live?.doc ? smsAdapterFor(live.doc) : null);
    return true;
  } catch {
    return false;
  }
}

export async function startSmsRuntime(): Promise<void> {
  await refreshActiveSms();
  if (g.__alpha_hood_sms_runtime_timer) return;
  g.__alpha_hood_sms_runtime_timer = setInterval(() => void refreshActiveSms(), SMS_REFRESH_MS);
  g.__alpha_hood_sms_runtime_timer.unref?.();
}
