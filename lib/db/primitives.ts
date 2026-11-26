import { randomBytes } from "node:crypto";
import { sql } from "kysely";
import type { KeyedLock } from "@/lib/concurrency/lock";
import { isMongoDuplicate, type MongoConn, mongoTx } from "./mongo";
import { isDeadlock, fromJson, isUniqueViolation, type SqlDb, sqlTx, toIso } from "./sql";

/**
 * Engine-neutral building blocks every money store uses (SQL and MongoDB implementations of the same contract):
 * - `lock`     distributed mutex (row with an owner + expiry); replaces the in-process lock across servers;
 * - `marker`   "seen once" (UNIQUE) — idempotency for webhook events, restock references…;
 * - `counter`  gap-free sequence (GST invoice numbers), atomic increment;
 * - `ledger`   append-only entries with UNIQUE(ledger, reference) and a locked owner balance that can never go
 *              below zero on a debit — store credit, Hood Coins and gift cards all use it.
 */
export interface LedgerEntry {
  id: string;
  ledger: string;
  owner: string;
  amount: number;
  reference: string;
  meta: Record<string, unknown>;
  createdAt: string;
}

export class LedgerFloorError extends Error {}

export interface Primitives {
  lock: KeyedLock;
  /** True the first time (namespace, key) is marked; false if it already was. */
  marker(namespace: string, key: string, now?: Date): Promise<boolean>;
  next(counter: string): Promise<number>;
  ledger: {
    /** Idempotent per (ledger, reference): returns the existing entry. Debits below zero throw LedgerFloorError. */
    add(e: { ledger: string; owner: string; amount: number; reference: string; meta?: Record<string, unknown> }, now?: Date): Promise<LedgerEntry>;
    balance(ledger: string, owner: string): Promise<number>;
    entries(ledger: string, owner: string): Promise<LedgerEntry[]>;
    byReference(ledger: string, reference: string): Promise<LedgerEntry | null>;
    /** Erasure (DPDP / club leave): removes an owner's entries and balance. */
    eraseOwner(ledger: string, owner: string): Promise<void>;
  };
}

const LOCK_TTL_MS = 30_000;
const LOCK_WAIT_MS = 15_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const newId = () => `le_${randomBytes(12).toString("hex")}`;

/** Shared retry loop: try to take the lock, back off with jitter, give up after LOCK_WAIT_MS. */
function makeLock(tryAcquire: (key: string, owner: string, now: number) => Promise<boolean>, release: (key: string, owner: string) => Promise<void>): KeyedLock {
  return {
    async run(key, fn) {
      const owner = randomBytes(12).toString("hex");
      const started = Date.now();
      for (let i = 0; ; i++) {
        if (await tryAcquire(key, owner, Date.now())) break;
        if (Date.now() - started > LOCK_WAIT_MS) throw new Error(`Timed out waiting for lock ${key}`);
        await sleep(Math.min(200, 10 * 2 ** Math.min(i, 4)) + Math.floor(Math.random() * 10));
      }
      try {
        return await fn();
      } finally {
        await release(key, owner).catch(() => undefined); // expiry frees it anyway
      }
    },
  };
}

// ── SQL ──────────────────────────────────────────────────────────────────────────────────────────

type EntryRow = { id: string; ledger: string; owner: string; amount: number | string; reference: string; meta: unknown; created_at: Date };
const entryFromRow = (r: EntryRow): LedgerEntry =>
  Object.freeze({ id: r.id, ledger: r.ledger, owner: r.owner, amount: Number(r.amount), reference: r.reference, meta: fromJson(r.meta, {}), createdAt: toIso(r.created_at) });

export function createSqlPrimitives(db: SqlDb): Primitives {
  const lock = makeLock(
    async (key, owner, now) => {
      try {
        await db.insertInto("app_locks").values({ lock_key: key, owner, expires_at: new Date(now + LOCK_TTL_MS) }).execute();
        return true;
      } catch (e) {
        // InnoDB reports a deadlock when several sessions insert the same key at once: nothing was taken — try again.
        if (isDeadlock(e)) return false;
        if (!isUniqueViolation(e)) throw e;
        // Held by someone: take it over only if their lease expired (conditional update).
        try {
          const r = await db.updateTable("app_locks").set({ owner, expires_at: new Date(now + LOCK_TTL_MS) }).where("lock_key", "=", key).where("expires_at", "<", new Date(now)).executeTakeFirst();
          return Number(r.numUpdatedRows) === 1;
        } catch (e2) {
          if (isDeadlock(e2)) return false;
          throw e2;
        }
      }
    },
    async (key, owner) => {
      await db.deleteFrom("app_locks").where("lock_key", "=", key).where("owner", "=", owner).execute();
    },
  );

  return {
    lock,
    async marker(namespace, key, now = new Date()) {
      try {
        await db.insertInto("markers").values({ namespace, marker_key: key, created_at: now }).execute();
        return true;
      } catch (e) {
        if (isUniqueViolation(e)) return false;
        throw e;
      }
    },
    async next(counter) {
      return sqlTx(db, async (trx) => {
        const row = await trx.selectFrom("counters").select("value").where("name", "=", counter).forUpdate().executeTakeFirst();
        if (!row) {
          try {
            await trx.insertInto("counters").values({ name: counter, value: 1 }).execute();
            return 1;
          } catch (e) {
            if (!isUniqueViolation(e)) throw e;
            throw Object.assign(new Error("counter race"), { code: "40001" }); // retried by sqlTx
          }
        }
        const value = Number(row.value) + 1;
        await trx.updateTable("counters").set({ value }).where("name", "=", counter).execute();
        return value;
      });
    },
    ledger: {
      async add(e, now = new Date()) {
        const existing = await db.selectFrom("ledger_entries").selectAll().where("ledger", "=", e.ledger).where("reference", "=", e.reference).executeTakeFirst();
        if (existing) return entryFromRow(existing as EntryRow);
        if (!Number.isSafeInteger(e.amount) || e.amount === 0) throw new Error("Invalid ledger amount");
        try {
          return await sqlTx(db, async (trx) => {
            // Lock (or create) the owner's balance row: serialises every change to this balance.
            let owner = await trx.selectFrom("ledger_owners").select("balance").where("ledger", "=", e.ledger).where("owner", "=", e.owner).forUpdate().executeTakeFirst();
            if (!owner) {
              try {
                await trx.insertInto("ledger_owners").values({ ledger: e.ledger, owner: e.owner, balance: 0 }).execute();
              } catch (err) {
                if (!isUniqueViolation(err)) throw err;
                throw Object.assign(new Error("owner race"), { code: "40001" });
              }
              owner = { balance: 0 };
            }
            const balance = Number(owner.balance);
            if (e.amount < 0 && balance + e.amount < 0) throw new LedgerFloorError("Insufficient balance");
            const row = { id: newId(), ledger: e.ledger, owner: e.owner, amount: e.amount, reference: e.reference, meta: JSON.stringify(e.meta ?? {}), created_at: now };
            await trx.insertInto("ledger_entries").values(row).execute();
            await trx.updateTable("ledger_owners").set({ balance: balance + e.amount }).where("ledger", "=", e.ledger).where("owner", "=", e.owner).execute();
            return entryFromRow({ ...row, meta: e.meta ?? {} });
          });
        } catch (err) {
          // Same reference applied concurrently by another request: return that one (idempotent).
          if (isUniqueViolation(err)) {
            const again = await db.selectFrom("ledger_entries").selectAll().where("ledger", "=", e.ledger).where("reference", "=", e.reference).executeTakeFirst();
            if (again) return entryFromRow(again as EntryRow);
          }
          throw err;
        }
      },
      async balance(ledger, owner) {
        const r = await db.selectFrom("ledger_owners").select("balance").where("ledger", "=", ledger).where("owner", "=", owner).executeTakeFirst();
        return r ? Number(r.balance) : 0;
      },
      async entries(ledger, owner) {
        return (await db.selectFrom("ledger_entries").selectAll().where("ledger", "=", ledger).where("owner", "=", owner).orderBy("created_at").orderBy("id").execute()).map((r) => entryFromRow(r as EntryRow));
      },
      async byReference(ledger, reference) {
        const r = await db.selectFrom("ledger_entries").selectAll().where("ledger", "=", ledger).where("reference", "=", reference).executeTakeFirst();
        return r ? entryFromRow(r as EntryRow) : null;
      },
      async eraseOwner(ledger, owner) {
        await sqlTx(db, async (trx) => {
          await trx.deleteFrom("ledger_entries").where("ledger", "=", ledger).where("owner", "=", owner).execute();
          await trx.deleteFrom("ledger_owners").where("ledger", "=", ledger).where("owner", "=", owner).execute();
        });
      },
    },
  };
}

// ── MongoDB ──────────────────────────────────────────────────────────────────────────────────────

type EntryDoc = { _id: string; ledger: string; owner: string; amount: number; reference: string; meta: Record<string, unknown>; created_at: Date };
const entryFromDoc = (d: EntryDoc): LedgerEntry => Object.freeze({ id: d._id, ledger: d.ledger, owner: d.owner, amount: d.amount, reference: d.reference, meta: d.meta ?? {}, createdAt: toIso(d.created_at) });

export function createMongoPrimitives(conn: Promise<MongoConn>): Primitives {
  const col = async <T extends { _id: string }>(name: string) => (await conn).db.collection<T>(name);
  const lock = makeLock(
    async (key, owner, now) => {
      const locks = await col<{ _id: string; owner: string; expires_at: Date }>("app_locks");
      try {
        // Insert if free, or take over an expired lease — one atomic upsert keyed by _id.
        const r = await locks.updateOne({ _id: key, expires_at: { $lt: new Date(now) } }, { $set: { owner, expires_at: new Date(now + LOCK_TTL_MS) } }, { upsert: true });
        return r.upsertedCount === 1 || r.modifiedCount === 1;
      } catch (e) {
        if (isMongoDuplicate(e)) return false; // a live lease exists
        throw e;
      }
    },
    async (key, owner) => {
      await (await col<{ _id: string; owner: string }>("app_locks")).deleteOne({ _id: key, owner });
    },
  );

  return {
    lock,
    async marker(namespace, key, now = new Date()) {
      try {
        await (await col<{ _id: string; created_at: Date }>("markers")).insertOne({ _id: `${namespace}:${key}`, created_at: now });
        return true;
      } catch (e) {
        if (isMongoDuplicate(e)) return false;
        throw e;
      }
    },
    async next(counter) {
      const d = await (await col<{ _id: string; value: number }>("counters")).findOneAndUpdate({ _id: counter }, { $inc: { value: 1 } }, { upsert: true, returnDocument: "after" });
      return d!.value;
    },
    ledger: {
      async add(e, now = new Date()) {
        const c = await conn;
        const entries = c.db.collection<EntryDoc>("ledger_entries");
        const existing = await entries.findOne({ ledger: e.ledger, reference: e.reference });
        if (existing) return entryFromDoc(existing);
        if (!Number.isSafeInteger(e.amount) || e.amount === 0) throw new Error("Invalid ledger amount");
        const doc: EntryDoc = { _id: newId(), ledger: e.ledger, owner: e.owner, amount: e.amount, reference: e.reference, meta: e.meta ?? {}, created_at: now };
        try {
          await mongoTx(c, async (session) => {
            const owners = c.db.collection<{ _id: string; balance: number }>("ledger_owners");
            const id = `${e.ledger}:${e.owner}`;
            // Conditional balance change: a debit only matches while the balance covers it (never negative).
            const filter = e.amount < 0 ? { _id: id, balance: { $gte: -e.amount } } : { _id: id };
            const r = await owners.updateOne(filter, { $inc: { balance: e.amount } }, { upsert: e.amount > 0, session });
            if (r.matchedCount === 0 && r.upsertedCount === 0) throw new LedgerFloorError("Insufficient balance");
            await entries.insertOne(doc, { session });
          });
          return entryFromDoc(doc);
        } catch (err) {
          if (isMongoDuplicate(err)) {
            const again = await entries.findOne({ ledger: e.ledger, reference: e.reference });
            if (again) return entryFromDoc(again);
          }
          throw err;
        }
      },
      async balance(ledger, owner) {
        const d = await (await col<{ _id: string; balance: number }>("ledger_owners")).findOne({ _id: `${ledger}:${owner}` });
        return d?.balance ?? 0;
      },
      async entries(ledger, owner) {
        return (await (await col<EntryDoc>("ledger_entries")).find({ ledger, owner }).sort({ created_at: 1, _id: 1 }).toArray()).map(entryFromDoc);
      },
      async byReference(ledger, reference) {
        const d = await (await col<EntryDoc>("ledger_entries")).findOne({ ledger, reference });
        return d ? entryFromDoc(d) : null;
      },
      async eraseOwner(ledger, owner) {
        const c = await conn;
        await mongoTx(c, async (session) => {
          await c.db.collection<EntryDoc>("ledger_entries").deleteMany({ ledger, owner }, { session });
          await c.db.collection<{ _id: string }>("ledger_owners").deleteOne({ _id: `${ledger}:${owner}` }, { session });
        });
      },
    },
  };
}

export { sql };
