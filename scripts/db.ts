/**
 * Database CLI (own backend). Usage:
 *   pnpm db:status            which migrations ran on the configured database
 *   pnpm db:migrate           apply pending migrations (additive; safe on every environment, via the pipeline)
 *   pnpm db:reset             roll everything back and re-apply — LOCAL _dev/_test databases only (guarded)
 * Options: --env-file=.env.test.local to target the test database. Reads DATABASE_DRIVER / DATABASE_URL from the
 * environment, then .env.local (never prints credentials). Always prints the target first (database-safety §1).
 */
import { existsSync, readFileSync } from "node:fs";
import { readDbConfig, describeTarget, isLocalTarget } from "../lib/db/config.ts";
import { migrateDownAll, migrateLatest, migrationStatus } from "../lib/db/migrate.ts";
import { closeMongo } from "../lib/db/mongo.ts";
import { closeSqlDb } from "../lib/db/sql.ts";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trimStart().startsWith("#")) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, "$2");
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

const args = process.argv.slice(2);
const command = args.find((a) => !a.startsWith("--")) ?? "status";
const envFile = args.find((a) => a.startsWith("--env-file="))?.split("=")[1];
loadEnvFile(envFile ?? ".env.local");

const cfg = readDbConfig();
if (!cfg) {
  console.error("No database configured: set DATABASE_DRIVER and DATABASE_URL (see .env.example).");
  process.exit(1);
}
const env = process.env.NODE_ENV === "production" ? "production" : isLocalTarget(cfg) ? "local" : "REMOTE (treated as production)";
console.log(`Target: ${describeTarget(cfg)}  ·  environment: ${env}`);

try {
  if (command === "status") {
    const s = await migrationStatus(cfg);
    console.log(`Applied (${s.applied.length}): ${s.applied.join(", ") || "—"}`);
    console.log(`Pending (${s.pending.length}): ${s.pending.join(", ") || "—"}`);
  } else if (command === "migrate") {
    const s = await migrateLatest(cfg);
    console.log(`Up to date. Applied: ${s.applied.length}, pending: ${s.pending.length}`);
  } else if (command === "reset") {
    await migrateDownAll(cfg); // throws unless local + _dev/_test + not production
    const s = await migrateLatest(cfg);
    console.log(`Reset done. Applied: ${s.applied.length}`);
  } else {
    console.error(`Unknown command "${command}". Use status | migrate | reset.`);
    process.exitCode = 1;
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
} finally {
  if (cfg.driver === "mongodb") await closeMongo(cfg);
  else await closeSqlDb(cfg);
}
