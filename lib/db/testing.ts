import { existsSync, readFileSync } from "node:fs";
import { createOtpStore } from "@/lib/auth/otp";
import { createMemorySessionStore } from "@/lib/auth/session";
import { createMemoryLedger } from "@/lib/consent/ledger";
import { createMemoryCustomerStore } from "@/lib/customers/store";
import { assertDestructiveAllowed, type DbConfig } from "./config";
import { createDbStores, type DbStores } from "./index";
import { migrateDownAll, migrateLatest } from "./migrate";
import { closeMongo } from "./mongo";
import { closeSqlDb } from "./sql";

/**
 * Contract-test targets: the memory stores plus every TEST_*_URL in the environment or `.env.test.local`.
 * Each database target must be a LOCAL database whose name ends in `_test` (checked before anything is wiped);
 * it is rolled back and re-migrated from scratch before the suite runs.
 */
export type StoresUnderTest = Omit<DbStores, "config">;

export interface Target {
  name: string;
  cfg: DbConfig | null;
  setup(): Promise<StoresUnderTest>;
  teardown(): Promise<void>;
}

function testEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  if (existsSync(".env.test.local")) {
    for (const line of readFileSync(".env.test.local", "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !line.trimStart().startsWith("#")) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  }
  for (const k of ["TEST_MYSQL_URL", "TEST_POSTGRES_URL", "TEST_MONGODB_URL"]) if (process.env[k]) out[k] = process.env[k]!;
  return out;
}

export function testTargets(): Target[] {
  const env = testEnv();
  const targets: Target[] = [
    {
      name: "memory",
      cfg: null,
      async setup() {
        return { ledger: createMemoryLedger(), customers: createMemoryCustomerStore(), sessions: createMemorySessionStore(), otp: createOtpStore() };
      },
      async teardown() {},
    },
  ];
  const add = (name: string, driver: DbConfig["driver"], url: string | undefined) => {
    if (!url) return;
    const cfg: DbConfig = { driver, url };
    targets.push({
      name,
      cfg,
      async setup() {
        assertDestructiveAllowed(cfg, { NODE_ENV: "test" });
        await migrateDownAll(cfg);
        await migrateLatest(cfg);
        const stores = createDbStores(cfg);
        return { ledger: stores.ledger, customers: stores.customers, sessions: stores.sessions, otp: stores.otp };
      },
      async teardown() {
        if (driver === "mongodb") await closeMongo(cfg);
        else await closeSqlDb(cfg);
      },
    });
  };
  add("mysql", "mysql", env.TEST_MYSQL_URL);
  add("postgres", "postgres", env.TEST_POSTGRES_URL);
  add("mongodb", "mongodb", env.TEST_MONGODB_URL);
  return targets;
}
