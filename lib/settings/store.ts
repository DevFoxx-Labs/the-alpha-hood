import { dbStores } from "@/lib/db";
import { BackendUnavailableError, devSingleton, type Env, mockDataAllowed } from "@/lib/mock-guard";

/**
 * Where saved settings live. Values are sealed (AES-256-GCM, lib/db/secret-box.ts) by the database stores before
 * they are written; `value` here is the plain text, or `null` when a row can't be opened with the configured
 * SECRET_BOX_KEY (it then falls back to the environment — see lib/settings/runtime.ts).
 */
export interface SettingRow {
  key: string;
  value: string | null;
  updatedBy: string;
  updatedAt: string;
}

export interface SettingsChange {
  /** key → new value (insert or replace). */
  set: Record<string, string>;
  /** keys whose saved value is removed. */
  clear: string[];
}

export interface SettingsStore {
  all(): Promise<SettingRow[]>;
  /** Applies the whole change atomically: all of it or none of it. */
  write(change: SettingsChange, by: string, now?: Date): Promise<void>;
}

export function createMemorySettingsStore(): SettingsStore {
  const rows = new Map<string, SettingRow>();
  return {
    async all() {
      return [...rows.values()].map((r) => ({ ...r })).sort((a, b) => a.key.localeCompare(b.key));
    },
    async write(change, by, now = new Date()) {
      for (const key of change.clear) rows.delete(key);
      for (const [key, value] of Object.entries(change.set)) rows.set(key, { key, value, updatedBy: by, updatedAt: now.toISOString() });
    },
  };
}

/** Database when configured; memory in development; refused in production without a database (fail closed). */
export function resolveSettingsStore(env: Env = process.env): SettingsStore {
  const db = dbStores(env);
  if (db) return db.settings;
  if (mockDataAllowed(env)) return devSingleton("settings", createMemorySettingsStore);
  const fail = async (): Promise<never> => {
    throw new BackendUnavailableError("Settings");
  };
  return { all: fail, write: fail };
}
