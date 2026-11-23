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
  };
}
