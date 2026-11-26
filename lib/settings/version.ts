/**
 * A counter bumped every time database settings are (re)applied to the environment (lib/settings/runtime.ts).
 * Dependency-free on purpose: config modules read it without pulling in the database.
 */
const g = globalThis as { __alpha_hood_settings_version?: number };

export const settingsVersion = (): number => g.__alpha_hood_settings_version ?? 0;

export function bumpSettingsVersion(): number {
  return (g.__alpha_hood_settings_version = settingsVersion() + 1);
}

/**
 * A config object that re-reads itself after settings change, so `LEGAL_CONFIG.entityName` and friends keep their
 * call sites but never serve a value from before the last save. Reads are cached per settings version.
 */
export function live<T extends object>(read: () => T): T {
  let seen = -1;
  let current: T;
  const get = (): T => {
    const now = settingsVersion();
    if (now !== seen) {
      current = read();
      seen = now;
    }
    return current;
  };
  return new Proxy({} as T, {
    get: (_t, prop) => Reflect.get(get(), prop),
    has: (_t, prop) => Reflect.has(get(), prop),
    ownKeys: () => Reflect.ownKeys(get()),
    getOwnPropertyDescriptor: (_t, prop) => {
      const d = Reflect.getOwnPropertyDescriptor(get(), prop);
      return d ? { ...d, configurable: true } : undefined;
    },
    set: () => false,
    defineProperty: () => false,
    deleteProperty: () => false,
  });
}
