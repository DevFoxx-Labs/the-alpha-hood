/**
 * `pnpm ops:check` — go-live readiness for the environment in --env-file (default .env.local) or the process env.
 * Prints every check (never a secret value) and exits 1 if any blocker fails. Read-only: it never writes.
 * Production: run it in the deploy pipeline with the production environment before switching traffic.
 */
import { existsSync, readFileSync } from "node:fs";
import { describeTarget, readDbConfig } from "@/lib/db/config";
import { createDbStores } from "@/lib/db";
import { migrationStatus } from "@/lib/db/migrate";
import { closeMongo } from "@/lib/db/mongo";
import { closeSqlDb } from "@/lib/db/sql";
import { blockers, configChecks, dataChecks, type Check } from "@/lib/ops/readiness";

const envFile = process.argv.find((a) => a.startsWith("--env-file="))?.split("=")[1] ?? ".env.local";
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !line.trimStart().startsWith("#") && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

const checks: Check[] = [];
let liveSmsProvider = false;
let cfg = null;
try {
  cfg = readDbConfig();
} catch {
  // reported by configChecks
}
if (cfg) {
  console.log(`Target: ${describeTarget(cfg)}`);
  try {
    const s = createDbStores(cfg);
    const [status, records, staff] = await Promise.all([migrationStatus(cfg), s.catalog.listRecords().catch(() => []), s.staff.list().catch(() => [])]);
    const demoReviews = await s.reviewStore.countByIdPrefix("rv_style_");
    // A provider made live in Admin → SMS providers satisfies the SMS check (it passed a test SMS to go live).
    liveSmsProvider = (await s.providers.list("sms").catch(() => [])).some((r) => r.active && r.doc !== null);
    checks.push(
      ...dataChecks({
        pendingMigrations: status.pending,
        demoProducts: records.filter((r) => r.id.startsWith("mock_")).length,
        demoReviews,
        activeProducts: records.filter((r) => r.status === "active").length,
        ownersWithMfa: staff.filter((x) => x.role === "owner" && x.totpEnabled && !x.disabled).length,
        setupTokenStillSet: !!process.env.ADMIN_SETUP_TOKEN,
      }),
    );
  } catch (e) {
    checks.push({ id: "database_reachable", level: "blocker", ok: false, message: `Database not reachable: ${e instanceof Error ? e.message.split("\n")[0] : "error"}` });
  } finally {
    if (cfg.driver === "mongodb") await closeMongo(cfg);
    else await closeSqlDb(cfg);
  }
}
checks.unshift(...configChecks(process.env, { liveSmsProvider }));

for (const c of checks) console.log(`${c.ok ? "  ok " : c.level === "blocker" ? "  ✗  " : "  !  "} ${c.message}`);
const b = blockers(checks);
console.log(b.length ? `\n${b.length} blocker(s): not ready for production.` : "\nNo blockers.");
process.exitCode = b.length ? 1 : 0;
