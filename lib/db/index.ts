import type { OtpStore } from "@/lib/auth/otp";
import type { SessionStore } from "@/lib/auth/session";
import type { CommerceAdapter } from "@/lib/commerce/types";
import type { KeyedLock } from "@/lib/concurrency/lock";
import type { ConsentLedger } from "@/lib/consent/ledger";
import type { CustomerStore } from "@/lib/customers/store";
import type { GiftCardStore } from "@/lib/giftcards/store";
import type { LoyaltyStore } from "@/lib/loyalty/store";
import type { OrderStore } from "@/lib/orders/store";
import type { NewsletterStore } from "@/lib/newsletter/service";
import type { GrievanceInbox } from "@/lib/privacy/requests";
import type { PhotoStore } from "@/lib/returns/photos";
import type { ReturnStore } from "@/lib/returns/service";
import type { CartRepo } from "@/lib/commerce/cart-engine";
import type { AuditLog } from "@/lib/admin/audit";
import type { StaffStore } from "@/lib/admin/staff";
import type { AlertStore } from "@/lib/alerts/service";
import type { FlowStore } from "@/lib/flows/service";
import type { RateCounterStore } from "@/lib/http/rate-limit";
import type { OutboxStore } from "@/lib/notify/outbox";
import type { UgcStore } from "@/lib/ugc/service";
import { createSecretBox } from "./secret-box";
import type { MediaStore } from "@/lib/catalog/media";
import type { Maintenance } from "./retention";
import { createMongoMaintenance, createSqlMaintenance } from "./stores/maintenance";
import { createMongoMediaStore, createSqlMediaStore } from "./stores/media";
import type { SettingsStore } from "@/lib/settings/store";
import { createMongoSettingsStore, createSqlSettingsStore } from "./stores/settings";
import type { ProviderStore } from "@/lib/providers/store";
import { createMongoProviderStore, createSqlProviderStore } from "./stores/providers";
import { createMongoAudit, createMongoRateCounters, createMongoStaffStore, createSqlAudit, createSqlRateCounters, createSqlStaffStore } from "./stores/admin";
import {
  createMongoAlertStore,
  createMongoFlowStore,
  createMongoOutbox,
  createMongoUgcStore,
  createSqlAlertStore,
  createSqlFlowStore,
  createSqlOutbox,
  createSqlUgcStore,
} from "./stores/growth";
import { createOwnCatalog } from "@/lib/catalog/own";
import type { CatalogStore } from "@/lib/catalog/store";
import { type ReviewStore, reviewsFromStore } from "@/lib/reviews/store";
import type { ReviewsAdapter } from "@/lib/reviews/types";
import { createMongoCatalogStore, createMongoReviewStore, createSqlCatalogStore, createSqlReviewStore } from "./stores/catalog";
import type { StoreCreditLedger } from "@/lib/wallet/store-credit";
import {
  createMongoInbox,
  createMongoNewsletterStore,
  createMongoPhotoStore,
  createMongoReturnStore,
  createSqlInbox,
  createSqlNewsletterStore,
  createSqlPhotoStore,
  createSqlReturnStore,
} from "./stores/aftersales";
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
 * Phase 3: returns + return photos, DPDP grievance inbox, newsletter subscribers.
 * Phase 4: products, category tree + collections, reviews (COMMERCE_PROVIDER=own).
 * Phase 5: staff + MFA (TOTP secrets sealed), audit log, shared rate limits, product alerts, #WearTheHood posts,
 *          notification outbox, scheduled-flow state.
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
  returns: ReturnStore;
  photos: PhotoStore;
  inbox: GrievanceInbox;
  newsletter: NewsletterStore;
  catalog: CatalogStore;
  reviewStore: ReviewStore;
  reviews: ReviewsAdapter;
  staff: StaffStore;
  audit: AuditLog;
  rateCounters: RateCounterStore;
  alerts: AlertStore;
  ugc: UgcStore;
  outbox: OutboxStore;
  flows: FlowStore;
  media: MediaStore;
  /** Admin → Settings: sealed overrides of environment variables. */
  settings: SettingsStore;
  /** Admin-managed providers (SMS): sealed documents, one active per kind. */
  providers: ProviderStore;
  maintenance: Maintenance;
  /** COMMERCE_PROVIDER=own: catalogue, bag and stock all on this database (built once, cached). */
  own(): OwnCommerce;
}

export interface OwnCommerce {
  commerce: CommerceAdapter;
  /** Drops this server's catalogue snapshot after an admin edit. */
  invalidate(): void;
}

type Env = Record<string, string | undefined>;
// Per module instance (not globalThis): a hot reload or a new deploy builds fresh store objects from the current
// code instead of reusing ones built by older code. The expensive parts — connection pools — are cached
// separately (lib/db/sql.ts, lib/db/mongo.ts) and stay shared.
const storeCache = new Map<string, DbStores>();
const cache = () => storeCache;

function catalogParts(
  catalog: CatalogStore,
  reviewStore: ReviewStore,
  bag: (catalog: CommerceAdapter) => { repo: CartRepo; inventory: CommerceAdapter["inventory"] },
): Pick<DbStores, "catalog" | "reviewStore" | "reviews" | "own"> {
  let own: OwnCommerce | null = null;
  return {
    catalog,
    reviewStore,
    reviews: reviewsFromStore(reviewStore),
    own() {
      if (own) return own;
      const cat = createOwnCatalog(catalog, reviewStore);
      // The reader is the catalogue; bag + stock wrap it (inventory seeds a new SKU from the product's stock).
      const readOnly = { ...cat.reader, name: "own" } as CommerceAdapter;
      const { repo, inventory } = bag(readOnly);
      own = { commerce: { ...createDbCommerce(readOnly, repo, inventory), name: "own" }, invalidate: cat.invalidate };
      return own;
    },
  };
}

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
      returns: createMongoReturnStore(conn),
      photos: createMongoPhotoStore(conn),
      inbox: createMongoInbox(conn),
      newsletter: createMongoNewsletterStore(conn),
      staff: createMongoStaffStore(conn, createSecretBox()),
      audit: createMongoAudit(conn),
      rateCounters: createMongoRateCounters(conn),
      alerts: createMongoAlertStore(conn),
      ugc: createMongoUgcStore(conn),
      outbox: createMongoOutbox(conn),
      flows: createMongoFlowStore(conn, p),
      media: createMongoMediaStore(conn),
      settings: createMongoSettingsStore(conn, createSecretBox()),
      providers: createMongoProviderStore(conn, createSecretBox()),
      maintenance: createMongoMaintenance(conn),
      ...catalogParts(createMongoCatalogStore(conn), createMongoReviewStore(conn), (catalog) => ({ repo: createMongoCartRepo(conn), inventory: createMongoInventory(conn, p, catalog) })),
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
    returns: createSqlReturnStore(db),
    photos: createSqlPhotoStore(db),
    inbox: createSqlInbox(db),
    newsletter: createSqlNewsletterStore(db),
    staff: createSqlStaffStore(db, createSecretBox()),
    audit: createSqlAudit(db),
    rateCounters: createSqlRateCounters(db),
    alerts: createSqlAlertStore(db),
    ugc: createSqlUgcStore(db),
    outbox: createSqlOutbox(db),
    flows: createSqlFlowStore(db, p),
    media: createSqlMediaStore(db),
    settings: createSqlSettingsStore(db, createSecretBox()),
    providers: createSqlProviderStore(db, createSecretBox()),
    maintenance: createSqlMaintenance(db),
    ...catalogParts(createSqlCatalogStore(db), createSqlReviewStore(db), (catalog) => ({ repo: createSqlCartRepo(db), inventory: createSqlInventory(db, p, catalog) })),
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
