/**
 * `pnpm admin:reset-link --email=owner@example.com [--reset-mfa] [--env-file=.env.local]` — break-glass reset for when
 * email reset isn't possible (no email provider, mailbox lost) and no other owner can help. `--reset-mfa` also clears
 * two-step verification (lost phone); it is set up again at the next sign-in. Needs shell access to the server and the database
 * credentials, so it is not reachable from the web. Prints the target database and a one-time link valid 1 hour.
 * Without `--reset-mfa`, two-step verification is untouched, so the link alone never gets anyone in. Audited with
 * actor `cli`. Normal cases: "Forgot password?" on the sign-in page (email code), or another owner's "Reset link".
 */
import { existsSync, readFileSync } from "node:fs";
import { createPasswordReset } from "@/lib/admin/auth";
import { findByEmail } from "@/lib/admin/staff";
import { createDbStores } from "@/lib/db";
import { describeTarget, readDbConfig } from "@/lib/db/config";
import { closeMongo } from "@/lib/db/mongo";
import { closeSqlDb } from "@/lib/db/sql";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const envFile = arg("env-file") ?? ".env.local";
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !line.trimStart().startsWith("#") && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

const email = arg("email");
if (!email) {
  console.error("Usage: pnpm admin:reset-link --email=you@example.com [--reset-mfa] [--env-file=.env.local]");
  process.exit(2);
}

const cfg = readDbConfig();
if (!cfg) {
  console.error("No database configured (DATABASE_DRIVER / DATABASE_URL). Dev memory staff can't be reset from a script.");
  process.exit(2);
}
console.log(`Target: ${describeTarget(cfg)}`);
try {
  const stores = createDbStores(cfg);
  const staff = await findByEmail(stores.staff, email);
  if (!staff) {
    console.error("No staff member with that email.");
    process.exitCode = 1;
  } else {
    const resetMfa = process.argv.includes("--reset-mfa");
    if (resetMfa) {
      await stores.staff.update(staff.id, (s) => {
        s.totpEnabled = false;
        s.totpSecret = null;
        s.lastTotpStep = -1;
      });
      await stores.staff.deleteSessionsOf(staff.id);
      await stores.audit.append({ actorId: "cli", actorEmail: "cli", action: "staff.update", target: staff.id, details: { resetMfa: true, via: "cli" }, ip: "cli" });
      console.log("Two-step verification cleared; it will be set up again at the next sign-in.");
    }
    const token = await createPasswordReset(stores.staff, staff, "cli");
    await stores.audit.append({ actorId: "cli", actorEmail: "cli", action: "staff.password_reset_link", target: staff.id, details: { via: "cli" }, ip: "cli" });
    const base = (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? "").replace(/\/$/, "");
    console.log(`One-time reset link for ${staff.name} (valid 1 hour, works once):\n${base}/admin/reset/${token}`);
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  if (cfg.driver === "mongodb") await closeMongo(cfg);
  else await closeSqlDb(cfg);
}
