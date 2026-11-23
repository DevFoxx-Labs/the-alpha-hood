/**
 * `pnpm db:seed` — loads the DEMO catalogue (products, categories, collections, demo reviews) into the configured
 * database so the store runs fully on the own backend (COMMERCE_PROVIDER=own) in development.
 * LOCAL `_dev` / `_test` databases only: demo products and fake reviews must never reach a live store.
 * Idempotent. Options: --env-file=.env.test.local. Prints the target first (database-safety §1).
 */
import { existsSync, readFileSync } from "node:fs";
import { seedDemoCatalog } from "@/lib/catalog/seed";
import { assertDestructiveAllowed, describeTarget, readDbConfig } from "@/lib/db/config";
import { createDbStores } from "@/lib/db";
import { closeMongo } from "@/lib/db/mongo";
import { closeSqlDb } from "@/lib/db/sql";

const envFile = process.argv.find((a) => a.startsWith("--env-file="))?.split("=")[1] ?? ".env.local";
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !line.trimStart().startsWith("#") && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

const cfg = readDbConfig();
if (!cfg) {
  console.error("No database configured: set DATABASE_DRIVER and DATABASE_URL (see .env.example).");
  process.exit(1);
}
console.log(`Target: ${describeTarget(cfg)}`);
try {
  const r = await seedDemoCatalog(createDbStores(cfg), () => assertDestructiveAllowed(cfg));
  console.log(`Demo catalogue seeded: ${r.products} new products (existing ones kept), reviews checked: ${r.reviews}.`);
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
} finally {
  if (cfg.driver === "mongodb") await closeMongo(cfg);
  else await closeSqlDb(cfg);
}
