export type Env = Record<string, string | undefined>;

/**
 * One fail-closed rule for every mock / in-memory backend (commerce, CMS, consent ledger, grievance
 * inbox, newsletter list). Allowed in development and tests; in production only when ALLOW_MOCK_DATA is
 * exactly "true" — a protected preview deployment, never the live store.
 */
export function mockDataAllowed(env: Env = process.env): boolean {
  if (env.NODE_ENV !== "production") return true;
  return env.ALLOW_MOCK_DATA === "true";
}

/** Thrown by stores that refuse to run (production without a real backend). Routes map it to 503. */
export class BackendUnavailableError extends Error {
  constructor(what: string) {
    super(`${what} has no production backend configured`);
    this.name = "BackendUnavailableError";
  }
}

/**
 * A process-wide singleton that survives dev hot reloads (module re-evaluation) so in-memory stores
 * don't silently reset between requests in `next dev`.
 */
export function devSingleton<T>(key: string, create: () => T): T {
  const g = globalThis as unknown as Record<string, unknown>;
  const k = `__alpha_hood_${key}`;
  if (!(k in g)) g[k] = create();
  return g[k] as T;
}
