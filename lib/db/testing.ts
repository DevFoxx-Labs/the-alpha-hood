import { existsSync, readFileSync } from "node:fs";
import { createOtpStore } from "@/lib/auth/otp";
import { createMemorySessionStore } from "@/lib/auth/session";
import { createMockAdapter } from "@/lib/commerce/mock";
import type { CommerceAdapter } from "@/lib/commerce/types";
import { createKeyedLock } from "@/lib/concurrency/lock";
import { createMemoryLedger } from "@/lib/consent/ledger";
import { createMemoryCustomerStore } from "@/lib/customers/store";
import { createMemoryGiftCardStore } from "@/lib/giftcards/store";
import { createMemoryLoyaltyStore } from "@/lib/loyalty/store";
import { createMemoryNewsletterStore } from "@/lib/newsletter/service";
import { createMemoryOrderStore } from "@/lib/orders/store";
import { createMemoryInbox } from "@/lib/privacy/requests";
import { createMemoryPhotoStore } from "@/lib/returns/photos";
import { createMemoryReturnStore } from "@/lib/returns/service";
import { createMemoryCatalogStore } from "@/lib/catalog/store";
import { createMemoryReviewStore } from "@/lib/reviews/store";
import { createMemoryAudit } from "@/lib/admin/audit";
import { createStaffStore } from "@/lib/admin/staff";
import { createMemoryAlertStore } from "@/lib/alerts/service";
import { createMemoryFlowStore } from "@/lib/flows/service";
import { createMemoryCounters } from "@/lib/http/rate-limit";
import { createMemoryOutbox } from "@/lib/notify/outbox";
import { createMemoryUgcStore } from "@/lib/ugc/service";
import { createMemoryCreditLedger } from "@/lib/wallet/store-credit";
import { assertDestructiveAllowed, type DbConfig } from "./config";
import { createDbStores, type DbStores, forgetDbStores } from "./index";
import { migrateDownAll, migrateLatest } from "./migrate";
import { closeMongo } from "./mongo";
import { closeSqlDb } from "./sql";

/**
 * Contract-test targets: the memory stores plus every TEST_*_URL in the environment or `.env.test.local`.
 * Each database target must be a LOCAL database whose name ends in `_test` (checked before anything is wiped);
 * it is rolled back and re-migrated from scratch before the suite runs.
 */
export type StoresUnderTest = Omit<DbStores, "config" | "primitives" | "commerce" | "own" | "reviews"> & { commerce: CommerceAdapter };

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
        return {
          locks: createKeyedLock(),
          ledger: createMemoryLedger(),
          customers: createMemoryCustomerStore(),
          sessions: createMemorySessionStore(),
          otp: createOtpStore(),
          orders: createMemoryOrderStore(),
          credit: createMemoryCreditLedger(),
          loyalty: createMemoryLoyaltyStore(),
          giftCards: createMemoryGiftCardStore(),
          commerce: createMockAdapter(),
          returns: createMemoryReturnStore(),
          photos: createMemoryPhotoStore(),
          inbox: createMemoryInbox(),
          newsletter: createMemoryNewsletterStore(),
          catalog: createMemoryCatalogStore(),
          reviewStore: createMemoryReviewStore(),
          staff: createStaffStore(),
          audit: createMemoryAudit(),
          rateCounters: createMemoryCounters(),
          alerts: createMemoryAlertStore(),
          ugc: createMemoryUgcStore(),
          outbox: createMemoryOutbox(),
          flows: createMemoryFlowStore(),
        };
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
        const s = createDbStores(cfg);
        return {
          locks: s.locks,
          ledger: s.ledger,
          customers: s.customers,
          sessions: s.sessions,
          otp: s.otp,
          orders: s.orders,
          credit: s.credit,
          loyalty: s.loyalty,
          giftCards: s.giftCards,
          commerce: s.commerce(createMockAdapter()),
          returns: s.returns,
          photos: s.photos,
          inbox: s.inbox,
          newsletter: s.newsletter,
          catalog: s.catalog,
          reviewStore: s.reviewStore,
          staff: s.staff,
          audit: s.audit,
          rateCounters: s.rateCounters,
          alerts: s.alerts,
          ugc: s.ugc,
          outbox: s.outbox,
          flows: s.flows,
        };
      },
      async teardown() {
        if (driver === "mongodb") await closeMongo(cfg);
        else await closeSqlDb(cfg);
        // Stores (and the dev commerce singleton) built on the closed connection must not be reused.
        forgetDbStores();
        delete (globalThis as Record<string, unknown>)[`__alpha_hood_commerce_db_${driver}`];
      },
    });
  };
  add("mysql", "mysql", env.TEST_MYSQL_URL);
  add("postgres", "postgres", env.TEST_POSTGRES_URL);
  add("mongodb", "mongodb", env.TEST_MONGODB_URL);
  return targets;
}
