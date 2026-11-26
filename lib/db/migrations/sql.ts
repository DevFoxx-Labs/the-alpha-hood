import { type Kysely, sql } from "kysely";
import type { Migration } from "kysely/migration";
import type { Driver } from "../config.ts";

/**
 * SQL migrations, shared by MySQL 8 and PostgreSQL. Rules (database-safety): additive only, `IF NOT EXISTS`
 * (idempotent / resumable), reversible `down()` (local _dev/_test only — guarded by the runner), never edit a
 * migration once it has run anywhere shared: add a new one. InnoDB + utf8mb4 on MySQL.
 */
type AnyDb = Kysely<unknown>;

// Engine-specific column types.
const t = (d: Driver) => ({
  ts: d === "postgres" ? sql`timestamptz(3)` : sql`datetime(3)`,
  json: d === "postgres" ? sql`jsonb` : sql`json`,
  bool: d === "postgres" ? sql`boolean` : sql`tinyint(1)`,
  falseDefault: d === "postgres" ? sql`false` : sql`0`,
});

const mysqlTable = (d: Driver) => (d === "mysql" ? sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci` : sql``);

async function createIndex(db: AnyDb, d: Driver, name: string, table: string, cols: string[], unique = false) {
  if (d === "postgres") {
    await db.schema.createIndex(name).ifNotExists().on(table).columns(cols).$call((b) => (unique ? b.unique() : b)).execute();
    return;
  }
  // MySQL has no CREATE INDEX IF NOT EXISTS: check information_schema first (idempotent re-run).
  const exists = await sql<{ n: number }>`SELECT COUNT(*) AS n FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = ${table} AND index_name = ${name}`.execute(db);
  if (Number(exists.rows[0]?.n ?? 0) > 0) return;
  await db.schema.createIndex(name).on(table).columns(cols).$call((b) => (unique ? b.unique() : b)).execute();
}

async function hasColumn(db: AnyDb, d: Driver, table: string, column: string): Promise<boolean> {
  const r =
    d === "postgres"
      ? await sql<{ n: number }>`SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_name = ${table} AND column_name = ${column}`.execute(db)
      : await sql<{ n: number }>`SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ${table} AND column_name = ${column}`.execute(db);
  return Number(r.rows[0]?.n ?? 0) > 0;
}

export function sqlMigrations(d: Driver): Record<string, Migration> {
  const c = t(d);
  return {
    "2026_11_26_001_core_identity": {
      async up(db: AnyDb) {
        // DPDP consent ledger — append-only (no update/delete in the app; erasure is its own audited job).
        await db.schema
          .createTable("consent_records")
          .ifNotExists()
          .addColumn("id", "varchar(64)", (col) => col.primaryKey())
          .addColumn("user_id", "varchar(64)")
          .addColumn("visitor_id", "varchar(64)")
          .addColumn("subscriber_id", "varchar(64)")
          .addColumn("purpose", "varchar(40)", (col) => col.notNull())
          .addColumn("status", "varchar(16)", (col) => col.notNull())
          .addColumn("method", "varchar(24)", (col) => col.notNull())
          .addColumn("source", "varchar(12)", (col) => col.notNull())
          .addColumn("notice_version", "varchar(200)", (col) => col.notNull())
          .addColumn("ip_address", "varchar(45)", (col) => col.notNull())
          .addColumn("user_agent", "varchar(300)", (col) => col.notNull())
          .addColumn("created_at", c.ts, (col) => col.notNull())
          .modifyEnd(mysqlTable(d))
          .execute();
        await createIndex(db, d, "consent_records_user_idx", "consent_records", ["user_id", "created_at"]);
        await createIndex(db, d, "consent_records_visitor_idx", "consent_records", ["visitor_id", "created_at"]);
        await createIndex(db, d, "consent_records_subscriber_idx", "consent_records", ["subscriber_id", "created_at"]);

        await db.schema
          .createTable("customers")
          .ifNotExists()
          .addColumn("id", "varchar(64)", (col) => col.primaryKey())
          .addColumn("phone", "varchar(64)", (col) => col.notNull().unique())
          .addColumn("name", "varchar(80)")
          .addColumn("email", "varchar(254)")
          .addColumn("created_at", c.ts, (col) => col.notNull())
          .addColumn("order_count", "integer", (col) => col.notNull().defaultTo(0))
          .addColumn("coupon_uses", c.json, (col) => col.notNull())
          .addColumn("cod_blocked", c.bool, (col) => col.notNull().defaultTo(c.falseDefault))
          .addColumn("rto_count", "integer", (col) => col.notNull().defaultTo(0))
          .addColumn("erased_at", c.ts)
          .modifyEnd(mysqlTable(d))
          .execute();
        await createIndex(db, d, "customers_created_idx", "customers", ["created_at"]);

        await db.schema
          .createTable("customer_addresses")
          .ifNotExists()
          .addColumn("id", "varchar(64)", (col) => col.primaryKey())
          .addColumn("customer_id", "varchar(64)", (col) => col.notNull().references("customers.id").onDelete("cascade"))
          .addColumn("position", "integer", (col) => col.notNull())
          .addColumn("name", "varchar(80)", (col) => col.notNull())
          .addColumn("phone", "varchar(16)", (col) => col.notNull())
          .addColumn("pincode", "varchar(6)", (col) => col.notNull())
          .addColumn("line1", "varchar(160)", (col) => col.notNull())
          .addColumn("line2", "varchar(160)", (col) => col.notNull())
          .addColumn("landmark", "varchar(120)", (col) => col.notNull())
          .addColumn("city", "varchar(80)", (col) => col.notNull())
          .addColumn("state", "varchar(60)", (col) => col.notNull())
          .addColumn("type", "varchar(10)", (col) => col.notNull())
          .modifyEnd(mysqlTable(d))
          .execute();
        await createIndex(db, d, "customer_addresses_customer_idx", "customer_addresses", ["customer_id", "position"]);

        // Sessions: only the SHA-256 of the token is stored (a leaked table can't be replayed).
        await db.schema
          .createTable("sessions")
          .ifNotExists()
          .addColumn("token_hash", "char(64)", (col) => col.primaryKey())
          .addColumn("customer_id", "varchar(64)", (col) => col.notNull())
          .addColumn("created_at", c.ts, (col) => col.notNull())
          .addColumn("expires_at", c.ts, (col) => col.notNull())
          .modifyEnd(mysqlTable(d))
          .execute();
        await createIndex(db, d, "sessions_customer_idx", "sessions", ["customer_id"]);
        await createIndex(db, d, "sessions_expires_idx", "sessions", ["expires_at"]);

        // OTP: only an HMAC of the code; attempts/used changed by conditional updates (no double use).
        await db.schema
          .createTable("otp_challenges")
          .ifNotExists()
          .addColumn("id", "varchar(64)", (col) => col.primaryKey())
          .addColumn("phone", "varchar(16)", (col) => col.notNull())
          .addColumn("code_hash", "char(64)", (col) => col.notNull())
          .addColumn("expires_at", c.ts, (col) => col.notNull())
          .addColumn("attempts", "integer", (col) => col.notNull().defaultTo(0))
          .addColumn("used", c.bool, (col) => col.notNull().defaultTo(c.falseDefault))
          .modifyEnd(mysqlTable(d))
          .execute();
        await createIndex(db, d, "otp_challenges_phone_idx", "otp_challenges", ["phone"]);

        await db.schema
          .createTable("otp_sends")
          .ifNotExists()
          .addColumn("id", "varchar(64)", (col) => col.primaryKey())
          .addColumn("phone", "varchar(16)", (col) => col.notNull())
          .addColumn("sent_at", c.ts, (col) => col.notNull())
          .modifyEnd(mysqlTable(d))
          .execute();
        await createIndex(db, d, "otp_sends_phone_idx", "otp_sends", ["phone", "sent_at"]);
      },
      async down(db: AnyDb) {
        for (const table of ["otp_sends", "otp_challenges", "sessions", "customer_addresses", "customers", "consent_records"]) {
          await db.schema.dropTable(table).ifExists().execute();
        }
      },
    },

    "2026_11_26_002_money": {
      async up(db: AnyDb) {
        const table = (name: string) => db.schema.createTable(name).ifNotExists();
        const end = mysqlTable(d);

        // Distributed mutex (replaces the in-process KeyedLock when a database is configured).
        await table("app_locks")
          .addColumn("lock_key", "varchar(190)", (col) => col.primaryKey())
          .addColumn("owner", "varchar(64)", (col) => col.notNull())
          .addColumn("expires_at", c.ts, (col) => col.notNull())
          .modifyEnd(end)
          .execute();

        // "Seen once" markers: processed webhook events, restock references … (UNIQUE = idempotency).
        await table("markers")
          .addColumn("namespace", "varchar(40)", (col) => col.notNull())
          .addColumn("marker_key", "varchar(190)", (col) => col.notNull())
          .addColumn("created_at", c.ts, (col) => col.notNull())
          .addPrimaryKeyConstraint("markers_pk", ["namespace", "marker_key"])
          .modifyEnd(end)
          .execute();

        // Gap-free counters (GST invoice series per financial year).
        await table("counters")
          .addColumn("name", "varchar(100)", (col) => col.primaryKey())
          .addColumn("value", "bigint", (col) => col.notNull())
          .modifyEnd(end)
          .execute();

        await table("carts")
          .addColumn("id", "varchar(64)", (col) => col.primaryKey())
          .addColumn("doc", c.json, (col) => col.notNull())
          .addColumn("version", "integer", (col) => col.notNull())
          .addColumn("updated_at", c.ts, (col) => col.notNull())
          .modifyEnd(end)
          .execute();

        // Orders: indexed columns for every lookup + the full order document (JSON).
        await table("orders")
          .addColumn("number", "varchar(32)", (col) => col.primaryKey())
          .addColumn("id", "varchar(64)", (col) => col.notNull().unique())
          .addColumn("customer_id", "varchar(64)", (col) => col.notNull())
          .addColumn("status", "varchar(24)", (col) => col.notNull())
          .addColumn("idempotency_key", "varchar(100)", (col) => col.notNull())
          .addColumn("created_at", c.ts, (col) => col.notNull())
          .addColumn("doc", c.json, (col) => col.notNull())
          .addColumn("version", "integer", (col) => col.notNull())
          .modifyEnd(end)
          .execute();
        await createIndex(db, d, "orders_idem_uq", "orders", ["customer_id", "idempotency_key"], true);
        await createIndex(db, d, "orders_customer_idx", "orders", ["customer_id", "created_at"]);
        await createIndex(db, d, "orders_status_idx", "orders", ["status"]);
        await createIndex(db, d, "orders_created_idx", "orders", ["created_at"]);

        // One order per gateway payment id (UNIQUE) — a payment can never be attached to two orders.
        await table("order_payments")
          .addColumn("payment_id", "varchar(100)", (col) => col.primaryKey())
          .addColumn("order_number", "varchar(32)", (col) => col.notNull().references("orders.number").onDelete("restrict"))
          .modifyEnd(end)
          .execute();

        await table("inventory_skus")
          .addColumn("product_id", "varchar(64)", (col) => col.notNull())
          .addColumn("size", "varchar(16)", (col) => col.notNull())
          .addColumn("on_hand", "integer", (col) => col.notNull())
          .addPrimaryKeyConstraint("inventory_skus_pk", ["product_id", "size"])
          .modifyEnd(end)
          .execute();

        await table("inventory_reservations")
          .addColumn("reference", "varchar(100)", (col) => col.primaryKey())
          .addColumn("state", "varchar(12)", (col) => col.notNull())
          .addColumn("expires_at", c.ts, (col) => col.notNull())
          .modifyEnd(end)
          .execute();
        await table("inventory_reservation_items")
          .addColumn("reference", "varchar(100)", (col) => col.notNull().references("inventory_reservations.reference").onDelete("cascade"))
          .addColumn("product_id", "varchar(64)", (col) => col.notNull())
          .addColumn("size", "varchar(16)", (col) => col.notNull())
          .addColumn("quantity", "integer", (col) => col.notNull())
          .addPrimaryKeyConstraint("inventory_reservation_items_pk", ["reference", "product_id", "size"])
          .modifyEnd(end)
          .execute();
        await createIndex(db, d, "inventory_res_items_sku_idx", "inventory_reservation_items", ["product_id", "size"]);

        // Append-only money ledgers (store credit, Hood Coins, gift cards): UNIQUE(ledger, reference) makes every
        // credit / debit idempotent; the owner balance row is locked to keep balances from going negative.
        await table("ledger_owners")
          .addColumn("ledger", "varchar(20)", (col) => col.notNull())
          .addColumn("owner", "varchar(100)", (col) => col.notNull())
          .addColumn("balance", "bigint", (col) => col.notNull())
          .addPrimaryKeyConstraint("ledger_owners_pk", ["ledger", "owner"])
          .modifyEnd(end)
          .execute();
        await table("ledger_entries")
          .addColumn("id", "varchar(64)", (col) => col.primaryKey())
          .addColumn("ledger", "varchar(20)", (col) => col.notNull())
          .addColumn("owner", "varchar(100)", (col) => col.notNull())
          .addColumn("amount", "bigint", (col) => col.notNull())
          .addColumn("reference", "varchar(190)", (col) => col.notNull())
          .addColumn("meta", c.json, (col) => col.notNull())
          .addColumn("created_at", c.ts, (col) => col.notNull())
          .modifyEnd(end)
          .execute();
        await createIndex(db, d, "ledger_entries_ref_uq", "ledger_entries", ["ledger", "reference"], true);
        await createIndex(db, d, "ledger_entries_owner_idx", "ledger_entries", ["ledger", "owner", "created_at"]);

        await table("loyalty_members")
          .addColumn("customer_id", "varchar(64)", (col) => col.primaryKey())
          .addColumn("joined_at", c.ts, (col) => col.notNull())
          .addColumn("referral_code", "varchar(16)", (col) => col.notNull().unique())
          .addColumn("visitor_id", "varchar(64)")
          .modifyEnd(end)
          .execute();
        await table("loyalty_referrals")
          .addColumn("order_number", "varchar(32)", (col) => col.primaryKey())
          .addColumn("code", "varchar(16)", (col) => col.notNull())
          .addColumn("referrer_id", "varchar(64)", (col) => col.notNull())
          .addColumn("friend_id", "varchar(64)", (col) => col.notNull())
          .addColumn("created_at", c.ts, (col) => col.notNull())
          .modifyEnd(end)
          .execute();
        await createIndex(db, d, "loyalty_referrals_referrer_idx", "loyalty_referrals", ["referrer_id"]);

        // Gift cards: only the SHA-256 of the code is stored.
        await table("gift_cards")
          .addColumn("hash", "char(64)", (col) => col.primaryKey())
          .addColumn("last4", "varchar(4)", (col) => col.notNull())
          .addColumn("initial", "integer", (col) => col.notNull())
          .addColumn("issued_at", c.ts, (col) => col.notNull())
          .addColumn("expires_at", c.ts, (col) => col.notNull())
          .addColumn("issued_by", "varchar(254)", (col) => col.notNull())
          .addColumn("note", "varchar(200)", (col) => col.notNull())
          .addColumn("disabled", c.bool, (col) => col.notNull().defaultTo(c.falseDefault))
          .modifyEnd(end)
          .execute();
        await createIndex(db, d, "gift_cards_issued_idx", "gift_cards", ["issued_at"]);
      },
      async down(db: AnyDb) {
        for (const t of [
          "gift_cards",
          "loyalty_referrals",
          "loyalty_members",
          "ledger_entries",
          "ledger_owners",
          "inventory_reservation_items",
          "inventory_reservations",
          "inventory_skus",
          "order_payments",
          "orders",
          "carts",
          "counters",
          "markers",
          "app_locks",
        ]) {
          await db.schema.dropTable(t).ifExists().execute();
        }
      },
    },

    "2026_11_26_003_aftersales": {
      async up(db: AnyDb) {
        const table = (name: string) => db.schema.createTable(name).ifNotExists();
        const end = mysqlTable(d);
        const blob = d === "postgres" ? sql`bytea` : sql`mediumblob`; // ≤ 16 MB; photos are capped at 5 MB

        // Returns: indexed lookup columns + the full request document; updates under FOR UPDATE.
        await table("returns")
          .addColumn("number", "varchar(32)", (col) => col.primaryKey())
          .addColumn("order_number", "varchar(32)", (col) => col.notNull())
          .addColumn("customer_id", "varchar(64)", (col) => col.notNull())
          .addColumn("status", "varchar(24)", (col) => col.notNull())
          .addColumn("created_at", c.ts, (col) => col.notNull())
          .addColumn("doc", c.json, (col) => col.notNull())
          .addColumn("version", "integer", (col) => col.notNull())
          .modifyEnd(end)
          .execute();
        await createIndex(db, d, "returns_order_idx", "returns", ["order_number"]);
        await createIndex(db, d, "returns_customer_idx", "returns", ["customer_id", "created_at"]);
        await createIndex(db, d, "returns_created_idx", "returns", ["created_at"]);

        // Return photos (private): EXIF already stripped before insert; only reachable through an owner check.
        await table("return_photos")
          .addColumn("id", "varchar(40)", (col) => col.primaryKey())
          .addColumn("owner_id", "varchar(64)", (col) => col.notNull())
          .addColumn("type", "varchar(16)", (col) => col.notNull())
          .addColumn("bytes", blob, (col) => col.notNull())
          .addColumn("created_at", c.ts, (col) => col.notNull())
          .addColumn("attached_to", "varchar(32)")
          .modifyEnd(end)
          .execute();
        await createIndex(db, d, "return_photos_owner_idx", "return_photos", ["owner_id", "created_at"]);

        // DPDP grievance inbox: requests are compliance records (kept; not erased with the account).
        await table("privacy_requests")
          .addColumn("reference", "varchar(16)", (col) => col.primaryKey())
          .addColumn("type", "varchar(32)", (col) => col.notNull())
          .addColumn("contact", "varchar(254)", (col) => col.notNull())
          .addColumn("status", "varchar(16)", (col) => col.notNull())
          .addColumn("created_at", c.ts, (col) => col.notNull())
          .addColumn("doc", c.json, (col) => col.notNull())
          .modifyEnd(end)
          .execute();
        await createIndex(db, d, "privacy_requests_contact_idx", "privacy_requests", ["contact", "created_at"]);
        await createIndex(db, d, "privacy_requests_created_idx", "privacy_requests", ["created_at"]);

        // Newsletter: one current subscriber per (channel, contact) — UNIQUE, so racing sign-ups can't duplicate.
        await table("newsletter_subscribers")
          .addColumn("id", "varchar(64)", (col) => col.primaryKey())
          .addColumn("channel", "varchar(10)", (col) => col.notNull())
          .addColumn("contact", "varchar(254)", (col) => col.notNull())
          .addColumn("status", "varchar(24)", (col) => col.notNull())
          .addColumn("created_at", c.ts, (col) => col.notNull())
          .modifyEnd(end)
          .execute();
        await createIndex(db, d, "newsletter_contact_uq", "newsletter_subscribers", ["channel", "contact"], true);
      },
      async down(db: AnyDb) {
        for (const t of ["newsletter_subscribers", "privacy_requests", "return_photos", "returns"]) {
          await db.schema.dropTable(t).ifExists().execute();
        }
      },
    },

    "2026_11_26_004_catalog": {
      async up(db: AnyDb) {
        const table = (name: string) => db.schema.createTable(name).ifNotExists();
        const end = mysqlTable(d);

        // Products: indexed / UNIQUE columns + the full product document; edits are version-checked.
        await table("products")
          .addColumn("id", "varchar(64)", (col) => col.primaryKey())
          .addColumn("handle", "varchar(120)", (col) => col.notNull().unique())
          .addColumn("sku", "varchar(40)", (col) => col.notNull().unique())
          .addColumn("style_id", "varchar(64)", (col) => col.notNull())
          .addColumn("category", "varchar(64)", (col) => col.notNull())
          .addColumn("status", "varchar(12)", (col) => col.notNull())
          .addColumn("created_at", c.ts, (col) => col.notNull())
          .addColumn("updated_at", c.ts, (col) => col.notNull())
          .addColumn("version", "integer", (col) => col.notNull())
          .addColumn("doc", c.json, (col) => col.notNull())
          .modifyEnd(end)
          .execute();
        await createIndex(db, d, "products_status_idx", "products", ["status"]);
        await createIndex(db, d, "products_style_idx", "products", ["style_id"]);

        // Category tree, homepage rail and collection rules (one versioned document).
        await table("catalog_documents")
          .addColumn("name", "varchar(40)", (col) => col.primaryKey())
          .addColumn("doc", c.json, (col) => col.notNull())
          .addColumn("updated_at", c.ts, (col) => col.notNull())
          .modifyEnd(end)
          .execute();

        await table("reviews")
          .addColumn("id", "varchar(80)", (col) => col.primaryKey())
          .addColumn("style_id", "varchar(64)", (col) => col.notNull())
          .addColumn("category", "varchar(64)", (col) => col.notNull())
          .addColumn("rating", "integer", (col) => col.notNull())
          .addColumn("helpful", "integer", (col) => col.notNull().defaultTo(0))
          .addColumn("created_at", c.ts, (col) => col.notNull())
          .addColumn("doc", c.json, (col) => col.notNull())
          .modifyEnd(end)
          .execute();
        await createIndex(db, d, "reviews_style_idx", "reviews", ["style_id"]);
        await createIndex(db, d, "reviews_category_idx", "reviews", ["category"]);

        // One helpful vote per (review, voter): the PK makes a second vote fail.
        await table("review_votes")
          .addColumn("review_id", "varchar(80)", (col) => col.notNull().references("reviews.id").onDelete("cascade"))
          .addColumn("voter_id", "varchar(64)", (col) => col.notNull())
          .addColumn("created_at", c.ts, (col) => col.notNull())
          .addPrimaryKeyConstraint("review_votes_pk", ["review_id", "voter_id"])
          .modifyEnd(end)
          .execute();
      },
      async down(db: AnyDb) {
        for (const t of ["review_votes", "reviews", "catalog_documents", "products"]) await db.schema.dropTable(t).ifExists().execute();
      },
    },

    "2026_11_26_005_admin_growth": {
      async up(db: AnyDb) {
        const table = (name: string) => db.schema.createTable(name).ifNotExists();
        const end = mysqlTable(d);

        // Staff: UNIQUE email; TOTP secret stored sealed (AES-256-GCM, lib/db/secret-box.ts).
        await table("staff")
          .addColumn("id", "varchar(40)", (col) => col.primaryKey())
          .addColumn("email", "varchar(254)", (col) => col.notNull().unique())
          .addColumn("name", "varchar(80)", (col) => col.notNull())
          .addColumn("role", "varchar(24)", (col) => col.notNull())
          .addColumn("password_hash", "varchar(300)")
          .addColumn("totp_secret_sealed", "varchar(300)")
          .addColumn("totp_enabled", c.bool, (col) => col.notNull().defaultTo(c.falseDefault))
          .addColumn("last_totp_step", "bigint", (col) => col.notNull().defaultTo(-1))
          .addColumn("disabled", c.bool, (col) => col.notNull().defaultTo(c.falseDefault))
          .addColumn("failed_logins", "integer", (col) => col.notNull().defaultTo(0))
          .addColumn("locked_until", "bigint", (col) => col.notNull().defaultTo(0))
          .addColumn("created_at", c.ts, (col) => col.notNull())
          .addColumn("last_login_at", c.ts)
          .modifyEnd(end)
          .execute();

        await table("staff_invites")
          .addColumn("token_hash", "char(64)", (col) => col.primaryKey())
          .addColumn("email", "varchar(254)", (col) => col.notNull())
          .addColumn("name", "varchar(80)", (col) => col.notNull())
          .addColumn("role", "varchar(24)", (col) => col.notNull())
          .addColumn("invited_by", "varchar(40)", (col) => col.notNull())
          .addColumn("expires_at", "bigint", (col) => col.notNull())
          .addColumn("used", c.bool, (col) => col.notNull().defaultTo(c.falseDefault))
          .modifyEnd(end)
          .execute();

        await table("staff_tickets")
          .addColumn("token_hash", "char(64)", (col) => col.primaryKey())
          .addColumn("staff_id", "varchar(40)", (col) => col.notNull())
          .addColumn("expires_at", "bigint", (col) => col.notNull())
          .addColumn("attempts", "integer", (col) => col.notNull().defaultTo(0))
          .addColumn("pending_secret_sealed", "varchar(300)")
          .modifyEnd(end)
          .execute();

        await table("staff_sessions")
          .addColumn("token_hash", "char(64)", (col) => col.primaryKey())
          .addColumn("staff_id", "varchar(40)", (col) => col.notNull())
          .addColumn("created_at", "bigint", (col) => col.notNull())
          .addColumn("last_seen", "bigint", (col) => col.notNull())
          .addColumn("expires_at", "bigint", (col) => col.notNull())
          .modifyEnd(end)
          .execute();
        await createIndex(db, d, "staff_sessions_staff_idx", "staff_sessions", ["staff_id"]);

        // Append-only audit log (no update / delete in the app).
        await table("audit_log")
          .addColumn("id", "varchar(40)", (col) => col.primaryKey())
          .addColumn("at", c.ts, (col) => col.notNull())
          .addColumn("actor_id", "varchar(40)", (col) => col.notNull())
          .addColumn("actor_email", "varchar(254)", (col) => col.notNull())
          .addColumn("action", "varchar(60)", (col) => col.notNull())
          .addColumn("target", "varchar(190)", (col) => col.notNull())
          .addColumn("details", c.json, (col) => col.notNull())
          .addColumn("ip", "varchar(45)", (col) => col.notNull())
          .modifyEnd(end)
          .execute();
        await createIndex(db, d, "audit_log_at_idx", "audit_log", ["at"]);
        await createIndex(db, d, "audit_log_actor_idx", "audit_log", ["actor_id", "at"]);
        await createIndex(db, d, "audit_log_target_idx", "audit_log", ["target", "at"]);

        // Shared rate-limit windows; keys are SHA-256 hashes (no IPs / phone numbers stored).
        await table("rate_limits")
          .addColumn("key_hash", "char(64)", (col) => col.primaryKey())
          .addColumn("count", "integer", (col) => col.notNull())
          .addColumn("reset_at", "bigint", (col) => col.notNull())
          .modifyEnd(end)
          .execute();
        await createIndex(db, d, "rate_limits_reset_idx", "rate_limits", ["reset_at"]);

        await table("product_alerts")
          .addColumn("id", "varchar(40)", (col) => col.primaryKey())
          .addColumn("customer_id", "varchar(64)", (col) => col.notNull())
          .addColumn("product_id", "varchar(64)", (col) => col.notNull())
          .addColumn("size", "varchar(16)")
          .addColumn("kind", "varchar(16)", (col) => col.notNull())
          .addColumn("price_at_set", "integer", (col) => col.notNull())
          .addColumn("created_at", c.ts, (col) => col.notNull())
          .addColumn("fired_at", c.ts)
          // One open alert per (customer, product, kind, size): the app writes '' for "no size" in this key.
          .addColumn("open_key", "varchar(200)")
          .modifyEnd(end)
          .execute();
        await createIndex(db, d, "product_alerts_open_uq", "product_alerts", ["open_key"], true);
        await createIndex(db, d, "product_alerts_customer_idx", "product_alerts", ["customer_id"]);
        await createIndex(db, d, "product_alerts_product_idx", "product_alerts", ["product_id", "fired_at"]);

        await table("ugc_posts")
          .addColumn("id", "varchar(40)", (col) => col.primaryKey())
          .addColumn("customer_id", "varchar(64)", (col) => col.notNull())
          .addColumn("status", "varchar(12)", (col) => col.notNull())
          .addColumn("created_at", c.ts, (col) => col.notNull())
          .addColumn("doc", c.json, (col) => col.notNull())
          .modifyEnd(end)
          .execute();
        await createIndex(db, d, "ugc_posts_status_idx", "ugc_posts", ["status", "created_at"]);
        await createIndex(db, d, "ugc_posts_customer_idx", "ugc_posts", ["customer_id"]);

        // Notification outbox: template + references only (no message bodies, no personal data).
        await table("notify_outbox")
          .addColumn("id", "varchar(40)", (col) => col.primaryKey())
          .addColumn("customer_id", "varchar(64)", (col) => col.notNull())
          .addColumn("template", "varchar(40)", (col) => col.notNull())
          .addColumn("marketing", c.bool, (col) => col.notNull().defaultTo(c.falseDefault))
          .addColumn("status", "varchar(12)", (col) => col.notNull())
          .addColumn("created_at", c.ts, (col) => col.notNull())
          .addColumn("doc", c.json, (col) => col.notNull())
          .modifyEnd(end)
          .execute();
        await createIndex(db, d, "notify_outbox_customer_idx", "notify_outbox", ["customer_id", "created_at"]);
        await createIndex(db, d, "notify_outbox_status_idx", "notify_outbox", ["status", "created_at"]);

        await table("flow_checkouts")
          .addColumn("customer_id", "varchar(64)", (col) => col.primaryKey())
          .addColumn("cart_id", "varchar(64)", (col) => col.notNull())
          .addColumn("started_at", "varchar(30)", (col) => col.notNull())
          .addColumn("sent_h1", c.bool, (col) => col.notNull().defaultTo(c.falseDefault))
          .addColumn("sent_h24", c.bool, (col) => col.notNull().defaultTo(c.falseDefault))
          .modifyEnd(end)
          .execute();
      },
      async down(db: AnyDb) {
        for (const t of ["flow_checkouts", "notify_outbox", "ugc_posts", "product_alerts", "rate_limits", "audit_log", "staff_sessions", "staff_tickets", "staff_invites", "staff"]) {
          await db.schema.dropTable(t).ifExists().execute();
        }
      },
    },

    "2026_11_27_006_switch_over": {
      async up(db: AnyDb) {
        const blob = d === "postgres" ? sql`bytea` : sql`mediumblob`; // ≤ 16 MB; photos are capped at 8 MB
        // Product photos: immutable, public (served from /api/media/<id>), metadata stripped before insert.
        await db.schema
          .createTable("product_media")
          .ifNotExists()
          .addColumn("id", "varchar(40)", (col) => col.primaryKey())
          .addColumn("type", "varchar(16)", (col) => col.notNull())
          .addColumn("width", "integer", (col) => col.notNull())
          .addColumn("height", "integer", (col) => col.notNull())
          .addColumn("bytes", blob, (col) => col.notNull())
          .addColumn("created_at", c.ts, (col) => col.notNull())
          .addColumn("created_by", "varchar(64)", (col) => col.notNull())
          .modifyEnd(mysqlTable(d))
          .execute();
        // Retention clean-up scans (cron sweep) by expiry column.
        await createIndex(db, d, "otp_challenges_expires_idx", "otp_challenges", ["expires_at"]);
        await createIndex(db, d, "otp_sends_sent_idx", "otp_sends", ["sent_at"]);
        await createIndex(db, d, "app_locks_expires_idx", "app_locks", ["expires_at"]);
        await createIndex(db, d, "inventory_res_expires_idx", "inventory_reservations", ["expires_at"]);
        await createIndex(db, d, "carts_updated_idx", "carts", ["updated_at"]);
        await createIndex(db, d, "return_photos_orphan_idx", "return_photos", ["attached_to", "created_at"]);
        await createIndex(db, d, "staff_tickets_expires_idx", "staff_tickets", ["expires_at"]);
        await createIndex(db, d, "staff_invites_expires_idx", "staff_invites", ["expires_at"]);
      },
      async down(db: AnyDb) {
        await db.schema.dropTable("product_media").ifExists().execute();
        for (const [t, i] of [["otp_challenges", "otp_challenges_expires_idx"], ["otp_sends", "otp_sends_sent_idx"], ["app_locks", "app_locks_expires_idx"], ["inventory_reservations", "inventory_res_expires_idx"], ["carts", "carts_updated_idx"], ["return_photos", "return_photos_orphan_idx"], ["staff_tickets", "staff_tickets_expires_idx"], ["staff_invites", "staff_invites_expires_idx"]]) {
          await (d === "postgres" ? db.schema.dropIndex(i).ifExists() : db.schema.dropIndex(i).on(t)).execute().catch(() => {});
        }
      },
    },

    "2026_11_27_007_outbox_delivery": {
      async up(db: AnyDb) {
        // Additive: delivery state for the notification worker (defaults keep existing rows valid).
        const cols: [string, string, ReturnType<typeof sql>][] = [
          ["attempts", "integer", sql`0`],
          ["next_attempt_at", "bigint", sql`0`],
          ["claimed_at", "bigint", sql`0`],
        ];
        for (const [name, type, def] of cols) {
          if (!(await hasColumn(db, d, "notify_outbox", name))) {
            await db.schema.alterTable("notify_outbox").addColumn(name, type as "integer", (col) => col.notNull().defaultTo(def)).execute();
          }
        }
        if (!(await hasColumn(db, d, "notify_outbox", "results"))) await db.schema.alterTable("notify_outbox").addColumn("results", c.json).execute();
        await createIndex(db, d, "notify_outbox_due_idx", "notify_outbox", ["status", "next_attempt_at"]);
      },
      async down(db: AnyDb) {
        for (const name of ["results", "claimed_at", "next_attempt_at", "attempts"]) {
          if (await hasColumn(db, d, "notify_outbox", name)) await db.schema.alterTable("notify_outbox").dropColumn(name).execute();
        }
      },
    },

    "2026_11_28_008_staff_password_reset": {
      async up(db: AnyDb) {
        // Additive + nullable: existing invite rows stay join invites (reset_for = NULL).
        if (!(await hasColumn(db, d, "staff_invites", "reset_for"))) {
          await db.schema.alterTable("staff_invites").addColumn("reset_for", "varchar(40)").execute();
        }
      },
      async down(db: AnyDb) {
        if (await hasColumn(db, d, "staff_invites", "reset_for")) await db.schema.alterTable("staff_invites").dropColumn("reset_for").execute();
      },
    },

    "2026_11_28_009_app_settings": {
      async up(db: AnyDb) {
        // Admin → Settings: one row per overridden environment variable; `value` is sealed (AES-256-GCM).
        await db.schema
          .createTable("app_settings")
          .ifNotExists()
          .addColumn("key", "varchar(64)", (col) => col.primaryKey())
          .addColumn("value", "text", (col) => col.notNull())
          .addColumn("updated_by", "varchar(64)", (col) => col.notNull())
          .addColumn("updated_at", c.ts, (col) => col.notNull())
          .modifyEnd(mysqlTable(d))
          .execute();
      },
      async down(db: AnyDb) {
        await db.schema.dropTable("app_settings").ifExists().execute();
      },
    },

    "2026_11_28_010_providers": {
      async up(db: AnyDb) {
        // Admin-managed providers (SMS first). `doc` is sealed; one active row per kind is a UNIQUE index:
        // inactive rows hold NULL in is_active, and NULLs never collide in MySQL or PostgreSQL.
        await db.schema
          .createTable("providers")
          .ifNotExists()
          .addColumn("id", "varchar(40)", (col) => col.primaryKey())
          .addColumn("kind", "varchar(16)", (col) => col.notNull())
          .addColumn("is_active", c.bool)
          .addColumn("doc", "text", (col) => col.notNull())
          .addColumn("updated_at", c.ts, (col) => col.notNull())
          .modifyEnd(mysqlTable(d))
          .execute();
        await createIndex(db, d, "providers_one_active_uq", "providers", ["kind", "is_active"], true);
      },
      async down(db: AnyDb) {
        await db.schema.dropTable("providers").ifExists().execute();
      },
    },
  };
}
