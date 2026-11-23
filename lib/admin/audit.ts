import { randomBytes } from "node:crypto";
import { dbStores } from "@/lib/db";
import { BackendUnavailableError, devSingleton, type Env, mockDataAllowed } from "@/lib/mock-guard";

/**
 * ADM-08 audit log: append-only record of every staff action (who, what, on which record, when, from where).
 * Entries are frozen; there is no update or delete API. Details hold ids and amounts — never passwords, OTPs,
 * tokens or full phone numbers.
 */
export interface AuditEntry {
  id: string;
  at: string;
  actorId: string;
  actorEmail: string;
  action: string;
  target: string;
  details: Record<string, string | number | boolean | null>;
  ip: string;
}

export interface AuditLog {
  append(entry: Omit<AuditEntry, "id" | "at">, now?: Date): Promise<AuditEntry>;
  list(filter?: { actorId?: string; target?: string; limit?: number }): Promise<AuditEntry[]>;
}

export function createMemoryAudit(): AuditLog {
  const rows: AuditEntry[] = [];
  return {
    async append(entry, now = new Date()) {
      const row = Object.freeze({ ...entry, details: Object.freeze({ ...entry.details }), id: `aud_${randomBytes(8).toString("hex")}`, at: now.toISOString() });
      rows.push(row as AuditEntry);
      return row as AuditEntry;
    },
    async list(filter = {}) {
      return rows
        .filter((r) => (!filter.actorId || r.actorId === filter.actorId) && (!filter.target || r.target === filter.target))
        .slice(-(filter.limit ?? 200))
        .reverse();
    },
  };
}

export function resolveAudit(env: Env = process.env): AuditLog {
  const db = dbStores(env);
  if (db) return db.audit;
  if (mockDataAllowed(env)) return devSingleton("admin_audit", createMemoryAudit);
  const fail = async (): Promise<never> => {
    throw new BackendUnavailableError("Audit log");
  };
  return { append: fail, list: fail };
}
