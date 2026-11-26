import { dbStores } from "@/lib/db";
import { BackendUnavailableError, devSingleton, type Env, mockDataAllowed } from "@/lib/mock-guard";

/**
 * Admin-managed providers (SMS now; email and storage use the same table later). One row per saved provider,
 * grouped by `kind`; at most ONE row per kind is active (UNIQUE index in the database, not just a rule in code).
 * The whole document — credentials included — is sealed (AES-256-GCM) by the database stores before it is written.
 * `doc` is null when a row can't be opened with the configured SECRET_BOX_KEY.
 */
export type ProviderKind = "sms";

export interface ProviderRow<T> {
  id: string;
  active: boolean;
  doc: T | null;
  updatedAt: string;
}

export interface ProviderStore {
  list<T>(kind: ProviderKind): Promise<ProviderRow<T>[]>;
  get<T>(kind: ProviderKind, id: string): Promise<ProviderRow<T> | null>;
  /** Inserts or replaces the document. Never changes which row is active. */
  put<T>(kind: ProviderKind, id: string, doc: T, now?: Date): Promise<void>;
  /** Deletes a row unless it is the active one. True when a row was deleted. */
  remove(kind: ProviderKind, id: string): Promise<boolean>;
  /**
   * Makes `id` the only active row of its kind (or none, with null) in one transaction.
   * False when `id` doesn't exist — then nothing changes.
   */
  setActive(kind: ProviderKind, id: string | null, now?: Date): Promise<boolean>;
}

export const PROVIDER_ID_RE = /^prv_[a-f0-9]{20}$/;

export function createMemoryProviderStore(): ProviderStore {
  const rows = new Map<string, { kind: ProviderKind; active: boolean; doc: string; updatedAt: string }>();
  const view = <T>(id: string, r: { active: boolean; doc: string; updatedAt: string }): ProviderRow<T> => ({ id, active: r.active, doc: JSON.parse(r.doc) as T, updatedAt: r.updatedAt });
  return {
    async list<T>(kind: ProviderKind) {
      return [...rows].filter(([, r]) => r.kind === kind).map(([id, r]) => view<T>(id, r)).sort((a, b) => a.id.localeCompare(b.id));
    },
    async get<T>(kind: ProviderKind, id: string) {
      const r = rows.get(id);
      return r && r.kind === kind ? view<T>(id, r) : null;
    },
    async put(kind, id, doc, now = new Date()) {
      const old = rows.get(id);
      rows.set(id, { kind, active: old?.kind === kind ? old.active : false, doc: JSON.stringify(doc), updatedAt: now.toISOString() });
    },
    async remove(kind, id) {
      const r = rows.get(id);
      if (!r || r.kind !== kind || r.active) return false;
      return rows.delete(id);
    },
    async setActive(kind, id) {
      if (id !== null && rows.get(id)?.kind !== kind) return false;
      for (const [key, r] of rows) if (r.kind === kind) r.active = key === id;
      return true;
    },
  };
}

/** Database when configured; memory in development; refused in production without a database (fail closed). */
export function resolveProviderStore(env: Env = process.env): ProviderStore {
  const db = dbStores(env);
  if (db) return db.providers;
  if (mockDataAllowed(env)) return devSingleton("providers", createMemoryProviderStore);
  const fail = async (): Promise<never> => {
    throw new BackendUnavailableError("Providers");
  };
  return { list: fail, get: fail, put: fail, remove: fail, setActive: fail };
}
