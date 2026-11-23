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
];
