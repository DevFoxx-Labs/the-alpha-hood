import type { Env } from "@/lib/mock-guard";
import { SETTING_ENV_KEYS } from "./catalog";
import { resolveSettingsStore, type SettingRow, type SettingsStore } from "./store";
import { NOTIFY_SWITCHES_KEY, setNotifySwitches } from "@/lib/notify/switches";
import { bumpSettingsVersion } from "./version";

/**
 * Settings saved in the admin override their environment variable for this server process.
 *
 * Every reader in the codebase already takes `env = process.env` and reads at call time, so the overlay is applied
 * to `process.env` itself: one place changes, every existing reader (kill switches, payment gateway, trackers,
 * legal notices) sees the saved value with no new code path of its own. Only catalogued keys are ever written.
 *
 * - Boot: `instrumentation.ts` applies the saved values before the first request is served.
 * - Save: the admin route re-applies immediately on this instance.
 * - Other instances: refreshed on a timer (REFRESH_MS), so a kill switch reaches every server within a minute.
 * - Not saved / removed / unreadable row: the variable goes back to the value the host's environment gave it.
 * - No database, or the database is down: nothing changes — the store behaves exactly as it does from .env alone.
 */
export const REFRESH_MS = 60_000;

interface State {
  /** What the host's environment held for each catalogued key, captured before the first override. */
  snapshot: Record<string, string | undefined> | null;
  /** Keys currently served from the database. */
  applied: Set<string>;
  /** Keys whose saved row couldn't be opened (SECRET_BOX_KEY changed) — reported once. */
  unreadable: Set<string>;
  timer: ReturnType<typeof setInterval> | null;
  /** Last applied notification switches (raw JSON), to notice a change. */
  switches?: string | null;
}

const g = globalThis as { __alpha_hood_settings_runtime?: State };
const state = (): State => (g.__alpha_hood_settings_runtime ??= { snapshot: null, applied: new Set(), unreadable: new Set(), timer: null });

function snapshot(env: Env): Record<string, string | undefined> {
  const s = state();
  if (!s.snapshot) {
    s.snapshot = {};
    for (const key of SETTING_ENV_KEYS) s.snapshot[key] = env[key];
  }
  return s.snapshot;
}

/** The environment's own value for a key (what it falls back to when nothing is saved). */
export function envValue(key: string, env: Env = process.env): string {
  return (snapshot(env)[key] ?? "").trim();
}

export const isFromDatabase = (key: string): boolean => state().applied.has(key);
export const unreadableKeys = (): string[] => [...state().unreadable];

/** Copies saved rows over the environment; anything not saved is restored. Returns true when a value changed. */
export function applySettings(rows: SettingRow[], env: Env = process.env): boolean {
  const s = state();
  const base = snapshot(env);
  const saved = new Map(rows.filter((r) => SETTING_ENV_KEYS.includes(r.key)).map((r) => [r.key, r.value]));
  let changed = false;
  const unreadable = new Set<string>();
  const applied = new Set<string>();
  for (const key of SETTING_ENV_KEYS) {
    const value = saved.get(key);
    if (saved.has(key) && value === null) unreadable.add(key);
    const next = typeof value === "string" && value !== "" ? value : base[key];
    if (typeof value === "string" && value !== "") applied.add(key);
    if (env[key] !== next) {
      changed = true;
      if (next === undefined) delete env[key];
      else env[key] = next;
    }
  }
  if (unreadable.size && [...unreadable].some((k) => !s.unreadable.has(k))) {
    // Names only, never values. Almost always SECRET_BOX_KEY differing from the one that saved the row.
    console.error(JSON.stringify({ type: "settings", event: "unreadable", keys: [...unreadable], hint: "SECRET_BOX_KEY changed? Add the old key to SECRET_BOX_PREVIOUS_KEYS." }));
  }
  // Notification switches live in the same table (one JSON row); they are not an environment variable.
  const switches = rows.find((r) => r.key === NOTIFY_SWITCHES_KEY)?.value ?? null;
  if (switches !== (s.switches ?? null)) {
    setNotifySwitches(switches);
    s.switches = switches;
    changed = true;
  }
  s.unreadable = unreadable;
  s.applied = applied;
  if (changed) bumpSettingsVersion();
  return changed;
}

/** Reads the store and applies it. Never throws: on any failure the environment is left as it is. */
export async function refreshSettings(store?: SettingsStore, env: Env = process.env): Promise<boolean> {
  try {
    return applySettings(await (store ?? resolveSettingsStore(env)).all(), env);
  } catch {
    return false;
  }
}

/** Boot hook (instrumentation.ts): apply once, then keep this instance in step with saves made on others. */
export async function startSettingsRuntime(): Promise<void> {
  await refreshSettings();
  const s = state();
  if (s.timer) return;
  s.timer = setInterval(() => void refreshSettings(), REFRESH_MS);
  s.timer.unref?.();
}

/** Tests only: put the environment back and forget everything. */
export function resetSettingsRuntime(env: Env = process.env): void {
  const s = state();
  if (s.snapshot) {
    for (const key of SETTING_ENV_KEYS) {
      if (s.snapshot[key] === undefined) delete env[key];
      else env[key] = s.snapshot[key];
    }
  }
  if (s.timer) clearInterval(s.timer);
  g.__alpha_hood_settings_runtime = undefined;
  setNotifySwitches(null);
  bumpSettingsVersion();
}
