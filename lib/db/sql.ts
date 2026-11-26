import { Kysely, MysqlDialect, PostgresDialect } from "kysely";
import type { DbConfig } from "./config.ts";
import type { Database } from "./schema.ts";

/**
 * Kysely connections for MySQL and PostgreSQL. Drivers are loaded lazily (only the one in use). One pool per URL,
 * kept on globalThis so dev hot-reload doesn't leak pools. MySQL sessions run in UTC; `utf8mb4` throughout.
 */
export type SqlDb = Kysely<Database>;
type Cache = Map<string, SqlDb>;
const g = globalThis as unknown as { __alpha_hood_sql?: Cache };
const cache = (): Cache => (g.__alpha_hood_sql ??= new Map());

export function getSqlDb(cfg: DbConfig): SqlDb {
  if (cfg.driver === "mongodb") throw new Error("getSqlDb called for a MongoDB config");
  const hit = cache().get(cfg.url);
  if (hit) return hit;
  const db =
    cfg.driver === "mysql"
      ? new Kysely<Database>({
          dialect: new MysqlDialect({
            pool: async () => {
              const mysql = await import("mysql2");
              return mysql.createPool({
                uri: cfg.url,
                connectionLimit: 10,
                timezone: "Z",
                charset: "utf8mb4",
                dateStrings: false,
                supportBigNumbers: true,
                bigNumberStrings: false,
                connectTimeout: 10_000,
              });
            },
          }),
        })
      : new Kysely<Database>({
          dialect: new PostgresDialect({
            pool: async () => {
              const pg = await import("pg");
              const Pool = (pg.default ?? pg).Pool;
              return new Pool({ connectionString: cfg.url, max: 10, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 30_000 });
            },
          }),
        });
  cache().set(cfg.url, db);
  return db;
}

export async function closeSqlDb(cfg: DbConfig) {
  const db = cache().get(cfg.url);
  if (!db) return;
  cache().delete(cfg.url);
  await db.destroy();
}

const DEADLOCK = new Set(["ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT", "40001", "40P01"]);

/**
 * ACID unit of work: runs `fn` in one transaction and retries on deadlock / serialization failure (up to 3 tries).
 * Never call external services (gateway, SMS, email) inside `fn` — do them after commit.
 */
export async function sqlTx<T>(db: SqlDb, fn: (trx: SqlDb) => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await db.transaction().execute(async (trx) => fn(trx as unknown as SqlDb));
    } catch (e) {
      if (i >= attempts || !isDeadlock(e)) throw e;
      await new Promise((r) => setTimeout(r, 20 * i));
    }
  }
}

/** Deadlock / lock-wait / serialization failure: the statement did nothing and is safe to retry. */
export function isDeadlock(e: unknown): boolean {
  return DEADLOCK.has((e as { code?: string }).code ?? "");
}

/** Duplicate-key error from either engine (UNIQUE / PRIMARY KEY). */
export function isUniqueViolation(e: unknown): boolean {
  const code = (e as { code?: string }).code;
  return code === "ER_DUP_ENTRY" || code === "23505";
}

export const toBool = (v: boolean | number | null | undefined) => v === true || v === 1;
export const toIso = (v: Date | string) => (v instanceof Date ? v : new Date(v)).toISOString();
export function fromJson<T>(v: unknown, fallback: T): T {
  if (v === null || v === undefined) return fallback;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return fallback;
    }
  }
  return v as T;
}
