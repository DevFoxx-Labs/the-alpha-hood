import { randomBytes } from "node:crypto";
import type { Paise } from "@/lib/format";
import { BackendUnavailableError, devSingleton, type Env, mockDataAllowed } from "@/lib/mock-guard";

/**
 * Store credit (RET-02): an append-only ledger per customer — balance = sum of entries. Every entry has a
 * unique `reference` (e.g. `return:RT…`) so a retried credit can never be applied twice. Spending credit at
 * checkout is P1 (CHK-05); for now credit is issued and shown.
 */
export interface CreditEntry {
  id: string;
  customerId: string;
  amount: Paise;
  reason: "return_credit" | "return_bonus" | "adjustment" | "spent" | "expired";
  reference: string;
  createdAt: string;
}

export interface StoreCreditLedger {
  /** Idempotent per reference: returns the existing entry if the reference was already used. */
  add(entry: Omit<CreditEntry, "id" | "createdAt">, now?: Date): Promise<CreditEntry>;
  balance(customerId: string): Promise<Paise>;
  history(customerId: string): Promise<CreditEntry[]>;
}

export function createMemoryCreditLedger(): StoreCreditLedger {
  const entries: CreditEntry[] = [];
  const byRef = new Map<string, CreditEntry>();
  return {
    async add(entry, now = new Date()) {
      const existing = byRef.get(entry.reference);
      if (existing) return existing;
      if (!Number.isSafeInteger(entry.amount) || entry.amount === 0) throw new Error("Invalid credit amount");
      if (entry.amount < 0) {
        const bal = entries.filter((e) => e.customerId === entry.customerId).reduce((n, e) => n + e.amount, 0);
        if (bal + entry.amount < 0) throw new Error("Insufficient store credit");
      }
      const created = Object.freeze({ ...entry, id: `sc_${randomBytes(9).toString("hex")}`, createdAt: now.toISOString() });
      entries.push(created);
      byRef.set(entry.reference, created);
      return created;
    },
    async balance(customerId) {
      return entries.filter((e) => e.customerId === customerId).reduce((n, e) => n + e.amount, 0);
    },
    async history(customerId) {
      return entries.filter((e) => e.customerId === customerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
  };
}

export function resolveCredit(env: Env = process.env): StoreCreditLedger {
  if (mockDataAllowed(env)) return devSingleton("store_credit", createMemoryCreditLedger);
  const fail = async (): Promise<never> => {
    throw new BackendUnavailableError("Store credit");
  };
  return { add: fail, balance: fail, history: fail };
}
