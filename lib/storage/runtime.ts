import type { Env } from "@/lib/mock-guard";
import { type ProviderStore, resolveProviderStore } from "@/lib/providers/store";
import { type BackendKind, localBackend, localDir, type ObjectBackend, type R2Config, r2Backend, type S3Config, s3Backend } from "./backends";

/**
 * Which storage takes NEW uploads, and how to reach every configured backend (old files stay where they were
 * written, so reads need the backend that holds them, not just the active one). Kept in memory per server process:
 * loaded at boot (instrumentation.ts), re-read after every admin change, refreshed every minute for other instances.
 * Nothing active (or the database is down) = the database, exactly as before.
 *
 * Configs live in the providers table (kind "storage"), sealed: ids `stg_local`, `stg_s3`, `stg_r2`.
 */
export const STORAGE_IDS: Record<BackendKind, string> = { local: "stg_local", s3: "stg_s3", r2: "stg_r2" };
export const STORAGE_REFRESH_MS = 60_000;

export interface StorageDoc {
  s3?: S3Config;
  r2?: R2Config;
  lastTest: { ok: boolean; at: string; message: string } | null;
  activatedAt: string | null;
  updatedBy: string;
  updatedAtIso: string;
}

interface State {
  active: BackendKind | null;
  backends: Partial<Record<BackendKind, ObjectBackend>>;
  timer: ReturnType<typeof setInterval> | null;
}
const g = globalThis as { __alpha_hood_storage_runtime?: State };
const state = (): State => (g.__alpha_hood_storage_runtime ??= { active: null, backends: {}, timer: null });

export const activeBackend = (): ObjectBackend | null => {
  const s = state();
  return s.active ? (s.backends[s.active] ?? null) : null;
};
export const backendOf = (kind: BackendKind): ObjectBackend | null => state().backends[kind] ?? null;

/** Builds a backend from a saved doc, or null when it isn't (fully) configured. */
export function backendFor(kind: BackendKind, doc: StorageDoc | null, env: Env = process.env): ObjectBackend | null {
  try {
    if (kind === "local") return localBackend(localDir(env));
    if (kind === "s3" && doc?.s3) return s3Backend(doc.s3);
    if (kind === "r2" && doc?.r2) return r2Backend(doc.r2);
  } catch {
    // a doc that no longer matches the patterns is treated as not configured
  }
  return null;
}

export async function refreshStorage(store?: ProviderStore, env: Env = process.env): Promise<boolean> {
  try {
    const rows = await (store ?? resolveProviderStore(env)).list<StorageDoc>("storage");
    const s = state();
    const backends: State["backends"] = {};
    let active: BackendKind | null = null;
    for (const kind of ["local", "s3", "r2"] as const) {
      const row = rows.find((r) => r.id === STORAGE_IDS[kind]);
      if (kind !== "local" && !row?.doc) continue;
      const b = backendFor(kind, row?.doc ?? null, env);
      if (b) backends[kind] = b;
      if (row?.active && b) active = kind;
    }
    s.backends = backends;
    s.active = active;
    return true;
  } catch {
    return false;
  }
}

export async function startStorageRuntime(): Promise<void> {
  await refreshStorage();
  const s = state();
  if (s.timer) return;
  s.timer = setInterval(() => void refreshStorage(), STORAGE_REFRESH_MS);
  s.timer.unref?.();
}

/** Tests only. */
export function setStorageRuntime(active: BackendKind | null, backends: Partial<Record<BackendKind, ObjectBackend>>): void {
  Object.assign(state(), { active, backends });
}
