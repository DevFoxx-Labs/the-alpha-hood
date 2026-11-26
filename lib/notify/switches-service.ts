import type { SettingsStore } from "@/lib/settings/store";
import { applySettings } from "@/lib/settings/runtime";
import { asObject, rejectUnknownFields } from "@/lib/validation";
import { allowsWith, cleanSwitches, NOTIFY_ALWAYS_ON, NOTIFY_CHANNELS, NOTIFY_EVENTS, NOTIFY_GROUPS, type NotifySwitches } from "./catalog";
import type { Template } from "./outbox";
import { NOTIFY_SWITCHES_KEY } from "./switches";

/**
 * Admin → Settings → Notifications: the payload (every event with its effective switches) and the save. Saved as one
 * sealed JSON row in the settings table; only catalogued events and channels are kept, so nothing else can be stored.
 */
export interface NotificationsPayload {
  groups: { id: string; label: string }[];
  events: { key: Template; group: string; label: string; description: string; channels: Partial<Record<"sms" | "email", boolean>> }[];
  alwaysOn: readonly { label: string; description: string }[];
}

async function current(store: SettingsStore): Promise<NotifySwitches> {
  const raw = (await store.all()).find((r) => r.key === NOTIFY_SWITCHES_KEY)?.value;
  try {
    return cleanSwitches(raw ? JSON.parse(raw) : null);
  } catch {
    return {};
  }
}

export async function notificationsPayload(store: SettingsStore): Promise<NotificationsPayload> {
  const saved = await current(store);
  return {
    groups: Object.entries(NOTIFY_GROUPS).map(([id, label]) => ({ id, label })),
    events: (Object.entries(NOTIFY_EVENTS) as [Template, (typeof NOTIFY_EVENTS)[Template]][]).map(([key, e]) => ({
      key,
      group: e.group,
      label: e.label,
      description: e.description,
      channels: Object.fromEntries(NOTIFY_CHANNELS.filter((ch) => ch in e.channels).map((ch) => [ch, allowsWith(saved, key, ch)])),
    })),
    alwaysOn: NOTIFY_ALWAYS_ON,
  };
}

/** Body `{ channels: { <event>: { sms?: boolean, email?: boolean } } }`. Returns the changed "event.channel" keys. */
export async function saveNotifications(store: SettingsStore, body: unknown, by: string, now = new Date()): Promise<{ changed: string[]; payload: NotificationsPayload }> {
  const input = asObject(body);
  rejectUnknownFields(input, ["channels"]);
  const incoming = asObject(input.channels ?? {});
  rejectUnknownFields(incoming, Object.keys(NOTIFY_EVENTS));
  for (const [event, row] of Object.entries(incoming)) rejectUnknownFields(asObject(row), Object.keys(NOTIFY_EVENTS[event as Template].channels));

  const before = await current(store);
  const next: NotifySwitches = { ...before };
  for (const [event, row] of Object.entries(cleanSwitches(incoming)) as [Template, Partial<Record<"sms" | "email", boolean>>][]) next[event] = { ...next[event], ...row };
  const changed: string[] = [];
  for (const event of Object.keys(NOTIFY_EVENTS) as Template[]) {
    for (const ch of NOTIFY_CHANNELS) {
      if (ch in NOTIFY_EVENTS[event].channels && allowsWith(before, event, ch) !== allowsWith(next, event, ch)) changed.push(`${event}.${ch}`);
    }
  }
  if (changed.length) {
    await store.write({ set: { [NOTIFY_SWITCHES_KEY]: JSON.stringify(next) }, clear: [] }, by, now);
    applySettings(await store.all());
  }
  return { changed, payload: await notificationsPayload(store) };
}
