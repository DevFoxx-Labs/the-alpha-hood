import type { OtpStore } from "@/lib/auth/otp";
import type { SessionStore } from "@/lib/auth/session";
import type { ConsentLedger } from "@/lib/consent/ledger";
import type { CustomerStore } from "@/lib/customers/store";
import { type DbConfig, readDbConfig } from "./config";
import { getMongo } from "./mongo";
import { getSqlDb } from "./sql";
import { createMongoOtpStore, createMongoSessionStore, createSqlOtpStore, createSqlSessionStore } from "./stores/auth";
import { createMongoLedger, createSqlLedger } from "./stores/consent";
import { createMongoCustomerStore, createSqlCustomerStore } from "./stores/customers";

/**
 * Own backend: the database-backed stores for the configured engine (DATABASE_DRIVER + DATABASE_URL), or null when
 * no database is configured (then each `resolveX()` keeps its memory-in-dev / refuse-in-production behaviour).
 * Each lib/* service still owns its business rules; this only swaps where the data lives.
 *
 * Phase 1 (2026-11-26): consent ledger, customers, sessions, OTP. Other stores follow in later phases.
 */
export interface DbStores {
  config: DbConfig;
  ledger: ConsentLedger;
  customers: CustomerStore;
  sessions: SessionStore;
  otp: OtpStore;
}

type Env = Record<string, string | undefined>;
const g = globalThis as unknown as { __alpha_hood_db_stores?: Map<string, DbStores> };
const cache = () => (g.__alpha_hood_db_stores ??= new Map());

export function createDbStores(cfg: DbConfig): DbStores {
  if (cfg.driver === "mongodb") {
    const conn = getMongo(cfg);
    return { config: cfg, ledger: createMongoLedger(conn), customers: createMongoCustomerStore(conn), sessions: createMongoSessionStore(conn), otp: createMongoOtpStore(conn) };
  }
  const db = getSqlDb(cfg);
  return { config: cfg, ledger: createSqlLedger(db), customers: createSqlCustomerStore(db), sessions: createSqlSessionStore(db), otp: createSqlOtpStore(db) };
}

export function dbStores(env: Env = process.env): DbStores | null {
  const cfg = readDbConfig(env);
  if (!cfg) return null;
  const key = `${cfg.driver}|${cfg.url}`;
  const hit = cache().get(key);
  if (hit) return hit;
  const stores = createDbStores(cfg);
  cache().set(key, stores);
  return stores;
}
