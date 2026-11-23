import type { OtpStore } from "@/lib/auth/otp";
import type { SessionStore } from "@/lib/auth/session";
import type { CommerceAdapter } from "@/lib/commerce/types";
import type { KeyedLock } from "@/lib/concurrency/lock";
import type { ConsentLedger } from "@/lib/consent/ledger";
import type { CustomerStore } from "@/lib/customers/store";
import type { GiftCardStore } from "@/lib/giftcards/store";
import type { LoyaltyStore } from "@/lib/loyalty/store";
import type { OrderStore } from "@/lib/orders/store";
import type { StoreCreditLedger } from "@/lib/wallet/store-credit";
import { type DbConfig, readDbConfig } from "./config";
import { getMongo } from "./mongo";
import { createMongoPrimitives, createSqlPrimitives, type Primitives } from "./primitives";
import { getSqlDb } from "./sql";
import { createMongoOtpStore, createMongoSessionStore, createSqlOtpStore, createSqlSessionStore } from "./stores/auth";
import { createDbCommerce, createMongoCartRepo, createMongoInventory, createSqlCartRepo, createSqlInventory } from "./stores/commerce";
import { createMongoLedger, createSqlLedger } from "./stores/consent";
import { createMongoCustomerStore, createSqlCustomerStore } from "./stores/customers";
import { createMongoOrderStore, createSqlOrderStore } from "./stores/orders";
import { createDbCreditLedger, createMongoGiftCardStore, createMongoLoyaltyStore, createSqlGiftCardStore, createSqlLoyaltyStore } from "./stores/wallet";

/**
 * Own backend: the database-backed stores for the configured engine (DATABASE_DRIVER + DATABASE_URL), or null when
 * no database is configured (then each `resolveX()` keeps its memory-in-dev / refuse-in-production behaviour).
 * Each lib/* service still owns its business rules; this only swaps where the data lives.
 *
 * Phase 1: consent ledger, customers, sessions, OTP.
 * Phase 2: locks, orders + payments + invoice series, carts + inventory (catalogue still from the adapter),
 *          store credit, Hood Coins + Alpha Club, gift cards.
 */
export interface DbStores {
  config: DbConfig;
  primitives: Primitives;
  locks: KeyedLock;
  ledger: ConsentLedger;
  customers: CustomerStore;
  sessions: SessionStore;
  otp: OtpStore;
  orders: OrderStore;
  credit: StoreCreditLedger;
  loyalty: LoyaltyStore;
  giftCards: GiftCardStore;
  /** Wraps a catalogue adapter with database carts + inventory. */
  commerce(catalog: CommerceAdapter): CommerceAdapter;
}

type Env = Record<string, string | undefined>;
const g = globalThis as unknown as { __alpha_hood_db_stores?: Map<string, DbStores> };
const cache = () => (g.__alpha_hood_db_stores ??= new Map());

export function createDbStores(cfg: DbConfig): DbStores {
  if (cfg.driver === "mongodb") {
    const conn = getMongo(cfg);
    const p = createMongoPrimitives(conn);
    return {
      config: cfg,
      primitives: p,
      locks: p.lock,
      ledger: createMongoLedger(conn),
      customers: createMongoCustomerStore(conn),
      sessions: createMongoSessionStore(conn),
      otp: createMongoOtpStore(conn),
      orders: createMongoOrderStore(conn, p),
      credit: createDbCreditLedger(p),
      loyalty: createMongoLoyaltyStore(conn, p),
      giftCards: createMongoGiftCardStore(conn, p),
      commerce: (catalog) => createDbCommerce(catalog, createMongoCartRepo(conn), createMongoInventory(conn, p, catalog)),
    };
  }
  const db = getSqlDb(cfg);
  const p = createSqlPrimitives(db);
  return {
    config: cfg,
    primitives: p,
    locks: p.lock,
    ledger: createSqlLedger(db),
    customers: createSqlCustomerStore(db),
    sessions: createSqlSessionStore(db),
    otp: createSqlOtpStore(db),
    orders: createSqlOrderStore(db, p),
    credit: createDbCreditLedger(p),
    loyalty: createSqlLoyaltyStore(db, p),
    giftCards: createSqlGiftCardStore(db, p),
    commerce: (catalog) => createDbCommerce(catalog, createSqlCartRepo(db), createSqlInventory(db, p, catalog)),
  };
}

/** Forgets cached store sets (call after closing a connection, e.g. in test teardown). */
export function forgetDbStores(): void {
  cache().clear();
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
