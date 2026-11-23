import { Migrator } from "kysely/migration";
import { assertDestructiveAllowed, type DbConfig, describeTarget } from "./config.ts";
import { MONGO_MIGRATIONS } from "./migrations/mongo.ts";
import { sqlMigrations } from "./migrations/sql.ts";
import { getMongo } from "./mongo.ts";
import { getSqlDb } from "./sql.ts";

/**
 * One migration runner for all three engines. `latest` only moves forward and is safe everywhere (additive
 * migrations). `down` / `reset` are destructive: allowed only on a local `_dev` / `_test` database (guarded).
 */
export interface MigrationStatus {
  target: string;
  applied: string[];
  pending: string[];
}

function sqlMigrator(cfg: DbConfig) {
  const db = getSqlDb(cfg);
  const migrations = sqlMigrations(cfg.driver);
  return new Migrator({
    db,
    provider: { getMigrations: async () => migrations },
    migrationTableName: "schema_migrations",
    migrationLockTableName: "schema_migrations_lock",
  });
}

export async function migrateLatest(cfg: DbConfig): Promise<MigrationStatus> {
  if (cfg.driver === "mongodb") {
    const { db } = await getMongo(cfg);
    const done = new Set((await db.collection<{ _id: string }>("_migrations").find().toArray()).map((m) => m._id));
    for (const m of MONGO_MIGRATIONS) {
      if (done.has(m.name)) continue;
      await m.up(db);
      await db.collection<{ _id: string; at: Date }>("_migrations").insertOne({ _id: m.name, at: new Date() });
    }
    return migrationStatus(cfg);
  }
  const { error, results } = await sqlMigrator(cfg).migrateToLatest();
  const failed = results?.find((r) => r.status === "Error");
  if (error || failed) throw new Error(`Migration failed${failed ? ` at ${failed.migrationName}` : ""}: ${error instanceof Error ? error.message : String(error ?? "")}`);
  return migrationStatus(cfg);
}

export async function migrationStatus(cfg: DbConfig): Promise<MigrationStatus> {
  const target = describeTarget(cfg);
  if (cfg.driver === "mongodb") {
    const { db } = await getMongo(cfg);
    const done = new Set((await db.collection<{ _id: string }>("_migrations").find().toArray()).map((m) => m._id));
    return { target, applied: MONGO_MIGRATIONS.filter((m) => done.has(m.name)).map((m) => m.name), pending: MONGO_MIGRATIONS.filter((m) => !done.has(m.name)).map((m) => m.name) };
  }
  const list = await sqlMigrator(cfg).getMigrations();
  return { target, applied: list.filter((m) => m.executedAt).map((m) => m.name), pending: list.filter((m) => !m.executedAt).map((m) => m.name) };
}

/** Rolls back every migration (local _dev/_test only). Used by `pnpm db:reset` and test setup. */
export async function migrateDownAll(cfg: DbConfig): Promise<void> {
  assertDestructiveAllowed(cfg);
  if (cfg.driver === "mongodb") {
    const { db } = await getMongo(cfg);
    for (const m of [...MONGO_MIGRATIONS].reverse()) {
      await m.down(db);
      await db.collection<{ _id: string }>("_migrations").deleteOne({ _id: m.name });
    }
    return;
  }
  const migrator = sqlMigrator(cfg);
  for (;;) {
    const status = await migrationStatus(cfg);
    if (status.applied.length === 0) return;
    const { error } = await migrator.migrateDown();
    if (error) throw error;
  }
}
