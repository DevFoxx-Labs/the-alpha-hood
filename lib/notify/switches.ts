import type { Template } from "./outbox";
import { allowsWith, cleanSwitches, type NotifySwitches } from "./catalog";

/**
 * The owner's notification switches, as this server process last read them. Stored in the settings table under
 * NOTIFY_SWITCHES_KEY (sealed like every setting) and applied by lib/settings/runtime.ts together with the other
 * settings: at boot, after a save, and every minute for the other servers. Nothing saved = catalogue defaults.
 * Dependency-free on purpose, so the outbox can import it without pulling in the database.
 */
export const NOTIFY_SWITCHES_KEY = "notify.channels";

const g = globalThis as { __alpha_hood_notify_switches?: NotifySwitches };

export function setNotifySwitches(raw: string | null | undefined): void {
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  g.__alpha_hood_notify_switches = cleanSwitches(parsed);
}

export const notifySwitches = (): NotifySwitches => g.__alpha_hood_notify_switches ?? {};

/** Whether `event` may go out on `channel` right now (admin switch, else the default). */
export const allows = (event: Template, channel: string): boolean => allowsWith(notifySwitches(), event, channel);
