/**
 * `pnpm catalog:import <file.json> [--apply] [--production] [--env-file=…]` — load the real catalogue.
 * File shape: docs/backend/catalog-import.example.json (`{ categories?, products: [...] }`, the admin form's fields).
 * - Default is a DRY RUN: validates every product with the admin form's rules and prints what would change.
 * - `--apply` writes (upsert by SKU, version-checked). On a non-local database it also needs `--production`
 *   (database-safety: production data changes are deliberate). Each run is audited as `system:catalog-import`.
 * Demo data is never accepted on production: SKUs / ids from the demo catalogue are refused there.
 */
import { existsSync, readFileSync } from "node:fs";
import { applyImport, type ImportFile, planImport } from "@/lib/catalog/import";
import { MOCK_PRODUCTS } from "@/lib/commerce/mock/data";
import { describeTarget, isLocalTarget, readDbConfig } from "@/lib/db/config";
import { createDbStores } from "@/lib/db";
import { closeMongo } from "@/lib/db/mongo";
import { closeSqlDb } from "@/lib/db/sql";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const apply = args.includes("--apply");
const production = args.includes("--production");
const envFile = args.find((a) => a.startsWith("--env-file="))?.split("=")[1] ?? ".env.local";
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !line.trimStart().startsWith("#") && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

if (!file || !existsSync(file)) {
  console.error("Usage: pnpm catalog:import <file.json> [--apply] [--production]");
  process.exit(1);
}
const cfg = readDbConfig();
if (!cfg) {
  console.error("No database configured: set DATABASE_DRIVER and DATABASE_URL.");
  process.exit(1);
}
const local = isLocalTarget(cfg);
console.log(`Target: ${describeTarget(cfg)}  ·  ${local ? "local" : "REMOTE (treated as production)"}  ·  ${apply ? "APPLY" : "dry run"}`);
if (apply && !local && !production) {
  console.error("Refusing to write to a non-local database without --production.");
  process.exit(1);
}

let data: ImportFile;
try {
  data = JSON.parse(readFileSync(file, "utf8")) as ImportFile;
} catch {
  console.error("The file isn't valid JSON.");
  process.exit(1);
}
const demoSkus = new Set(MOCK_PRODUCTS.map((p) => p.sku));
const demoHits = (data.products ?? []).filter((p) => demoSkus.has(String((p as { sku?: unknown })?.sku ?? "").toUpperCase())).length;
if (!local && demoHits > 0) {
  // Belt and braces on top of ops:check: the demo catalogue must never be imported into a live store.
  console.error(`${demoHits} demo-catalogue SKU(s) found — demo data must never be imported into a live store.`);
  process.exit(1);
}

const stores = createDbStores(cfg);
const deps = { store: stores.catalog, media: stores.media, invalidate: () => {} };
try {
  const report = apply ? await applyImport(deps, data) : await planImport(deps, data);
  console.log(`Categories: ${report.categories}`);
  console.log(`Create: ${report.create.length}${report.create.length ? ` (${report.create.slice(0, 10).join(", ")}${report.create.length > 10 ? ", …" : ""})` : ""}`);
  console.log(`Update: ${report.update.length}${report.update.length ? ` (${report.update.slice(0, 10).join(", ")}${report.update.length > 10 ? ", …" : ""})` : ""}`);
  for (const e of report.errors.slice(0, 50)) console.log(`  ✗ #${e.index} ${e.sku}: ${e.message}`);
  if (report.errors.length) {
    console.log(`${report.errors.length} error(s) — ${apply ? "nothing was written" : "fix them before --apply"}.`);
    process.exitCode = 1;
  } else if (apply) {
    await stores.audit.append({ actorId: "system:catalog-import", actorEmail: "cli", action: "catalog.import", target: describeTarget(cfg), details: { created: report.create.length, updated: report.update.length, categories: report.categories }, ip: "cli" });
    console.log("Imported.");
  } else {
    console.log("Dry run OK. Re-run with --apply to write.");
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
} finally {
  if (cfg.driver === "mongodb") await closeMongo(cfg);
  else await closeSqlDb(cfg);
}
