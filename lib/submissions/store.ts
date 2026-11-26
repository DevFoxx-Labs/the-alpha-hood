import { randomBytes } from "node:crypto";
import { dbStores } from "@/lib/db";
import { BackendUnavailableError, devSingleton, type Env, mockDataAllowed } from "@/lib/mock-guard";

/**
 * Things customers send the store and staff then handle: product reviews (moderated before they are published)
 * and feedback / help requests (answered by support). One table for both, so each new kind of submission needs no
 * new storage code: `kind` + `status` + a JSON document.
 * - `uniqueKey` (nullable, UNIQUE): one review per customer per product, even under parallel submits.
 * - Status changes are conditional (`expected`): two staff members can't both decide the same submission.
 * - Owner-scoped reads and deletes for customers; account erasure removes a customer's submissions.
 */
export type SubmissionKind = "review" | "feedback";

export interface Submission<T = Record<string, unknown>> {
  id: string;
  kind: SubmissionKind;
  customerId: string;
  status: string;
  uniqueKey: string | null;
  doc: T;
  createdAt: string;
  updatedAt: string;
}

export class SubmissionConflictError extends Error {
  constructor() {
    super("Already submitted");
    this.name = "SubmissionConflictError";
  }
}

export interface SubmissionStore {
  /** Throws SubmissionConflictError when `uniqueKey` is taken. */
  create<T>(s: Omit<Submission<T>, "id" | "createdAt" | "updatedAt">, now?: Date): Promise<Submission<T>>;
  get<T>(id: string): Promise<Submission<T> | null>;
  listByCustomer<T>(kind: SubmissionKind, customerId: string): Promise<Submission<T>[]>;
  /** Newest first. */
  listByStatus<T>(kind: SubmissionKind, status: string | null, limit?: number): Promise<Submission<T>[]>;
  /** Writes `status` + `doc` only if the current status is one of `expected`. Returns the new row, or null. */
  update<T>(id: string, expected: string[], status: string, doc: T, now?: Date): Promise<Submission<T> | null>;
  /** Owner-scoped delete. */
  remove(id: string, customerId: string): Promise<boolean>;
  eraseCustomer(customerId: string): Promise<void>;
}

export const SUBMISSION_ID_RE = /^sub_[a-f0-9]{24}$/;
export const newSubmissionId = () => `sub_${randomBytes(12).toString("hex")}`;

export function createMemorySubmissionStore(): SubmissionStore {
  const rows = new Map<string, Submission>();
  const copy = <T>(s: Submission | undefined) => (s ? (structuredClone(s) as Submission<T>) : null);
  return {
    async create(s, now = new Date()) {
      if (s.uniqueKey && [...rows.values()].some((r) => r.uniqueKey === s.uniqueKey)) throw new SubmissionConflictError();
      const row = { ...structuredClone(s), id: newSubmissionId(), createdAt: now.toISOString(), updatedAt: now.toISOString() } as Submission;
      rows.set(row.id, row);
      return copy(row)!;
    },
    async get(id) {
      return copy(rows.get(id));
    },
    async listByCustomer(kind, customerId) {
      return [...rows.values()].filter((r) => r.kind === kind && r.customerId === customerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((r) => copy(r)!);
    },
    async listByStatus(kind, status, limit = 200) {
      return [...rows.values()]
        .filter((r) => r.kind === kind && (status === null || r.status === status))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
        .slice(0, limit)
        .map((r) => copy(r)!);
    },
    async update(id, expected, status, doc, now = new Date()) {
      const r = rows.get(id);
      if (!r || !expected.includes(r.status)) return null;
      Object.assign(r, { status, doc: structuredClone(doc), updatedAt: now.toISOString() });
      return copy(r);
    },
    async remove(id, customerId) {
      const r = rows.get(id);
      if (!r || r.customerId !== customerId) return false;
      return rows.delete(id);
    },
    async eraseCustomer(customerId) {
      for (const [id, r] of rows) if (r.customerId === customerId) rows.delete(id);
    },
  };
}

export function resolveSubmissions(env: Env = process.env): SubmissionStore {
  const db = dbStores(env);
  if (db) return db.submissions;
  if (mockDataAllowed(env)) return devSingleton("submissions", createMemorySubmissionStore);
  const fail = async (): Promise<never> => {
    throw new BackendUnavailableError("Reviews and feedback");
  };
  return { create: fail, get: fail, listByCustomer: fail, listByStatus: fail, update: fail, remove: fail, eraseCustomer: fail };
}
