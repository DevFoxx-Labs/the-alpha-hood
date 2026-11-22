import { BackendUnavailableError, devSingleton, type Env, mockDataAllowed } from "@/lib/mock-guard";
import type { ConsentMethod, ConsentPurpose, ConsentSource, ConsentStatus } from "./purposes";

/**
 * Consent ledger (DPDP rule §3): append-only proof of every consent decision with timestamps.
 * The interface deliberately has no update/delete — rows are only removed by the legal account-erasure
 * job (M6), which will be its own audited operation.
 *
 * Persistence: the database arrives with the platform decision (PRD §4). Until then the in-memory ledger
 * runs in dev/tests only; production refuses (503) so consent can never be silently dropped.
 */
export interface ConsentRecord {
  id: string;
  user_id: string | null;
  visitor_id: string | null;
  /** Newsletter subscriber this consent belongs to (no account yet). */
  subscriber_id: string | null;
  purpose: ConsentPurpose;
  status: ConsentStatus;
  method: ConsentMethod;
  source: ConsentSource;
  /** e.g. `cookies@2026-11-22;privacy@2026-11-22` */
  notice_version: string;
  ip_address: string;
  user_agent: string;
  created_at: string;
}

export type NewConsentRecord = Omit<ConsentRecord, "id" | "created_at">;

export interface ConsentLedger {
  append(rows: NewConsentRecord[], now?: Date): Promise<ConsentRecord[]>;
  listByVisitor(visitorId: string): Promise<ConsentRecord[]>;
  listBySubscriber(subscriberId: string): Promise<ConsentRecord[]>;
}

export function createMemoryLedger(): ConsentLedger {
  const rows: ConsentRecord[] = [];
  const byCreated = (a: ConsentRecord, b: ConsentRecord) => a.created_at.localeCompare(b.created_at);
  return {
    async append(newRows, now = new Date()) {
      const created = newRows.map((r) =>
        Object.freeze({ ...r, id: crypto.randomUUID(), created_at: now.toISOString() }),
      );
      rows.push(...created);
      return created;
    },
    async listByVisitor(visitorId) {
      return rows.filter((r) => r.visitor_id === visitorId).sort(byCreated);
    },
    async listBySubscriber(subscriberId) {
      return rows.filter((r) => r.subscriber_id === subscriberId).sort(byCreated);
    },
  };
}

function refusingLedger(): ConsentLedger {
  const fail = async (): Promise<never> => {
    throw new BackendUnavailableError("Consent ledger");
  };
  return { append: fail, listByVisitor: fail, listBySubscriber: fail };
}

export function resolveLedger(env: Env = process.env): ConsentLedger {
  return mockDataAllowed(env) ? devSingleton("consent_ledger", createMemoryLedger) : refusingLedger();
}
