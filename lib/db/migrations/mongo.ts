import type { Db } from "mongodb";

/**
 * MongoDB "migrations": collections + indexes (the constraints MongoDB enforces), versioned in `_migrations`.
 * Idempotent: createCollection skips existing ones and createIndex with the same spec is a no-op.
 * The same uniqueness rules as SQL (one customer per phone, one row per id) live in UNIQUE indexes.
 */
export interface MongoMigration {
  name: string;
  up(db: Db): Promise<void>;
  down(db: Db): Promise<void>;
}

const MONEY_COLLECTIONS = [
  "app_locks",
  "markers",
  "counters",
  "carts",
  "orders",
  "inventory_skus",
  "inventory_reservations",
  "ledger_owners",
  "ledger_entries",
  "loyalty_members",
  "loyalty_referrals",
  "gift_cards",
];

const ADMIN_COLLECTIONS = ["staff", "staff_invites", "staff_tickets", "staff_sessions", "audit_log", "rate_limits", "product_alerts", "ugc_posts", "notify_outbox", "flow_checkouts"];
const CATALOG_COLLECTIONS =["products", "catalog_documents", "reviews", "review_votes"];
const AFTERSALES_COLLECTIONS =["returns", "return_photos", "privacy_requests", "newsletter_subscribers"];

async function ensureCollection(db: Db, name: string) {
  const exists = await db.listCollections({ name }, { nameOnly: true }).hasNext();
  if (!exists) await db.createCollection(name);
}

export const MONGO_MIGRATIONS: MongoMigration[] = [
  {
    name: "2026_11_26_001_core_identity",
    async up(db) {
      for (const c of ["consent_records", "customers", "sessions", "otp_challenges", "otp_sends"]) await ensureCollection(db, c);
      await db.collection("consent_records").createIndexes([
        { key: { user_id: 1, created_at: 1 }, name: "consent_records_user_idx" },
        { key: { visitor_id: 1, created_at: 1 }, name: "consent_records_visitor_idx" },
        { key: { subscriber_id: 1, created_at: 1 }, name: "consent_records_subscriber_idx" },
      ]);
      await db.collection("customers").createIndexes([
        { key: { phone: 1 }, name: "customers_phone_uq", unique: true },
        { key: { created_at: -1 }, name: "customers_created_idx" },
        { key: { "addresses.id": 1 }, name: "customers_address_id_idx", sparse: true },
      ]);
      await db.collection("sessions").createIndexes([
        { key: { customer_id: 1 }, name: "sessions_customer_idx" },
        // MongoDB removes expired sessions on its own (TTL index); reads still check expires_at.
        { key: { expires_at: 1 }, name: "sessions_expires_ttl", expireAfterSeconds: 0 },
      ]);
      await db.collection("otp_challenges").createIndexes([
        { key: { phone: 1 }, name: "otp_challenges_phone_idx" },
        { key: { expires_at: 1 }, name: "otp_challenges_expires_ttl", expireAfterSeconds: 3600 },
      ]);
      await db.collection("otp_sends").createIndexes([
        { key: { phone: 1, sent_at: 1 }, name: "otp_sends_phone_idx" },
        { key: { sent_at: 1 }, name: "otp_sends_ttl", expireAfterSeconds: 2 * 86_400 },
      ]);
    },
    async down(db) {
      for (const c of ["otp_sends", "otp_challenges", "sessions", "customers", "consent_records"]) {
        if (await db.listCollections({ name: c }, { nameOnly: true }).hasNext()) await db.collection(c).drop();
      }
    },
  },
  {
    name: "2026_11_26_002_money",
    async up(db) {
      for (const c of MONEY_COLLECTIONS) await ensureCollection(db, c);
      await db.collection("app_locks").createIndexes([{ key: { expires_at: 1 }, name: "app_locks_expires_idx" }]);
      await db.collection("orders").createIndexes([
        { key: { customerId: 1, idempotencyKey: 1 }, name: "orders_idem_uq", unique: true },
        { key: { customerId: 1, createdAt: -1 }, name: "orders_customer_idx" },
        { key: { status: 1 }, name: "orders_status_idx" },
        { key: { createdAt: -1 }, name: "orders_created_idx" },
        { key: { id: 1 }, name: "orders_id_uq", unique: true },
        // One order per gateway payment id across all orders (multikey UNIQUE).
        { key: { "attempts.paymentId": 1 }, name: "orders_payment_uq", unique: true, partialFilterExpression: { "attempts.paymentId": { $exists: true } } },
      ]);
      await db.collection("inventory_reservations").createIndexes([
        { key: { state: 1, expires_at: 1 }, name: "inventory_res_state_idx" },
        { key: { "items.key": 1 }, name: "inventory_res_items_idx" },
      ]);
      await db.collection("ledger_entries").createIndexes([
        { key: { ledger: 1, reference: 1 }, name: "ledger_entries_ref_uq", unique: true },
        { key: { ledger: 1, owner: 1, created_at: 1 }, name: "ledger_entries_owner_idx" },
      ]);
      await db.collection("loyalty_members").createIndexes([{ key: { referral_code: 1 }, name: "loyalty_members_code_uq", unique: true }]);
      await db.collection("loyalty_referrals").createIndexes([{ key: { referrer_id: 1 }, name: "loyalty_referrals_referrer_idx" }]);
      await db.collection("gift_cards").createIndexes([{ key: { issued_at: -1 }, name: "gift_cards_issued_idx" }]);
    },
    async down(db) {
      for (const c of MONEY_COLLECTIONS) {
        if (await db.listCollections({ name: c }, { nameOnly: true }).hasNext()) await db.collection(c).drop();
      }
    },
  },
  {
    name: "2026_11_26_003_aftersales",
    async up(db) {
      for (const c of AFTERSALES_COLLECTIONS) await ensureCollection(db, c);
      await db.collection("returns").createIndexes([
        { key: { orderNumber: 1 }, name: "returns_order_idx" },
        { key: { customerId: 1, createdAt: -1 }, name: "returns_customer_idx" },
        { key: { createdAt: -1 }, name: "returns_created_idx" },
      ]);
      await db.collection("return_photos").createIndexes([{ key: { owner_id: 1, created_at: -1 }, name: "return_photos_owner_idx" }]);
      await db.collection("privacy_requests").createIndexes([
        { key: { contact: 1, createdAt: -1 }, name: "privacy_requests_contact_idx" },
        { key: { createdAt: -1 }, name: "privacy_requests_created_idx" },
      ]);
      await db.collection("newsletter_subscribers").createIndexes([
        { key: { channel: 1, contact: 1 }, name: "newsletter_contact_uq", unique: true },
        { key: { id: 1 }, name: "newsletter_id_uq", unique: true },
      ]);
    },
    async down(db) {
      for (const c of AFTERSALES_COLLECTIONS) {
        if (await db.listCollections({ name: c }, { nameOnly: true }).hasNext()) await db.collection(c).drop();
      }
    },
  },
  {
    name: "2026_11_26_004_catalog",
    async up(db) {
      for (const c of CATALOG_COLLECTIONS) await ensureCollection(db, c);
      await db.collection("products").createIndexes([
        { key: { handle: 1 }, name: "products_handle_uq", unique: true },
        { key: { sku: 1 }, name: "products_sku_uq", unique: true },
        { key: { status: 1 }, name: "products_status_idx" },
        { key: { styleId: 1 }, name: "products_style_idx" },
      ]);
      await db.collection("reviews").createIndexes([
        { key: { styleId: 1 }, name: "reviews_style_idx" },
        { key: { category: 1 }, name: "reviews_category_idx" },
      ]);
    },
    async down(db) {
      for (const c of CATALOG_COLLECTIONS) {
        if (await db.listCollections({ name: c }, { nameOnly: true }).hasNext()) await db.collection(c).drop();
      }
    },
  },
  {
    name: "2026_11_26_005_admin_growth",
    async up(db) {
      for (const c of ADMIN_COLLECTIONS) await ensureCollection(db, c);
      await db.collection("staff").createIndexes([{ key: { email: 1 }, name: "staff_email_uq", unique: true }]);
      await db.collection("staff_sessions").createIndexes([
        { key: { staffId: 1 }, name: "staff_sessions_staff_idx" },
        { key: { expiresAtDate: 1 }, name: "staff_sessions_ttl", expireAfterSeconds: 0 },
      ]);
      await db.collection("staff_tickets").createIndexes([{ key: { expiresAtDate: 1 }, name: "staff_tickets_ttl", expireAfterSeconds: 0 }]);
      await db.collection("audit_log").createIndexes([
        { key: { at: -1 }, name: "audit_log_at_idx" },
        { key: { actorId: 1, at: -1 }, name: "audit_log_actor_idx" },
        { key: { target: 1, at: -1 }, name: "audit_log_target_idx" },
      ]);
      // Expired windows are removed by MongoDB itself.
      await db.collection("rate_limits").createIndexes([{ key: { resetAtDate: 1 }, name: "rate_limits_ttl", expireAfterSeconds: 0 }]);
      await db.collection("product_alerts").createIndexes([
        { key: { openKey: 1 }, name: "product_alerts_open_uq", unique: true, partialFilterExpression: { openKey: { $type: "string" } } },
        { key: { customerId: 1 }, name: "product_alerts_customer_idx" },
        { key: { productId: 1, firedAt: 1 }, name: "product_alerts_product_idx" },
      ]);
      await db.collection("ugc_posts").createIndexes([
        { key: { status: 1, createdAt: -1 }, name: "ugc_posts_status_idx" },
        { key: { customerId: 1 }, name: "ugc_posts_customer_idx" },
      ]);
      await db.collection("notify_outbox").createIndexes([
        { key: { customerId: 1, createdAt: -1 }, name: "notify_outbox_customer_idx" },
        { key: { status: 1, createdAt: 1 }, name: "notify_outbox_status_idx" },
      ]);
    },
    async down(db) {
      for (const c of ADMIN_COLLECTIONS) {
        if (await db.listCollections({ name: c }, { nameOnly: true }).hasNext()) await db.collection(c).drop();
      }
    },
  },
  {
    name: "2026_11_27_006_switch_over",
    async up(db) {
      await ensureCollection(db, "product_media");
      await db.collection("carts").createIndexes([{ key: { updated_at: 1 }, name: "carts_updated_idx" }]);
      await db.collection("return_photos").createIndexes([{ key: { attached_to: 1, created_at: 1 }, name: "return_photos_orphan_idx" }]);
      await db.collection("inventory_reservations").createIndexes([{ key: { expires_at: 1 }, name: "inventory_res_expires_idx" }]);
    },
    async down(db) {
      if (await db.listCollections({ name: "product_media" }, { nameOnly: true }).hasNext()) await db.collection("product_media").drop();
    },
  },
  {
    name: "2026_11_27_007_outbox_delivery",
    async up(db) {
      // Existing queued messages become deliverable; the worker claims by (status, nextAttemptAt).
      await db.collection("notify_outbox").updateMany({ attempts: { $exists: false } }, { $set: { attempts: 0, nextAttemptAt: 0, claimedAt: 0, results: {} } });
      await db.collection("notify_outbox").createIndexes([{ key: { status: 1, nextAttemptAt: 1 }, name: "notify_outbox_due_idx" }]);
    },
    async down() {
      // additive only — nothing to undo
    },
  },
  {
    name: "2026_11_28_008_staff_password_reset",
    async up() {
      // Schemaless: `resetFor` is an optional field on staff_invites; documents without it read as join invites.
    },
    async down() {
      // additive only — nothing to undo
    },
  },
  {
    name: "2026_11_28_009_app_settings",
    async up(db) {
      // Admin → Settings: _id is the overridden environment variable; `value` is sealed (AES-256-GCM).
      await ensureCollection(db, "app_settings");
    },
    async down(db) {
      if (await db.listCollections({ name: "app_settings" }, { nameOnly: true }).hasNext()) await db.collection("app_settings").drop();
    },
  },
  {
    name: "2026_11_28_010_providers",
    async up(db) {
      // Admin-managed providers (SMS first): sealed document; at most one active per kind.
      await ensureCollection(db, "providers");
      await db.collection("providers").createIndexes([{ key: { kind: 1, active: 1 }, name: "providers_one_active_uq", unique: true, partialFilterExpression: { active: true } }]);
    },
    async down(db) {
      if (await db.listCollections({ name: "providers" }, { nameOnly: true }).hasNext()) await db.collection("providers").drop();
    },
  },
  {
    name: "2026_11_29_011_media_storage_key",
    async up() {
      // Schemaless: `storageKey` is an optional field on product_media; documents without it keep their bytes.
    },
    async down() {
      // additive only — nothing to undo
    },
  },
  {
    name: "2026_11_29_012_customer_identities",
    async up(db) {
      // Google / Facebook sign-in links; _id = "<provider>|<subject>" (one social account → one customer).
      await ensureCollection(db, "customer_identities");
      await db.collection("customer_identities").createIndexes([{ key: { customerId: 1 }, name: "customer_identities_customer_idx" }]);
    },
    async down(db) {
      if (await db.listCollections({ name: "customer_identities" }, { nameOnly: true }).hasNext()) await db.collection("customer_identities").drop();
    },
  },
];
