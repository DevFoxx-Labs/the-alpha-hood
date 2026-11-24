import { readDbConfig, isLocalTarget, type DbConfig } from "@/lib/db/config";

/**
 * Go-live readiness (phase 6). One list of checks that says whether this environment may serve the live store,
 * run by `pnpm ops:check` before every production deploy (docs/backend/go-live.md). Two kinds:
 * - configuration checks: pure functions of the environment (no secrets printed — only "set" / "missing");
 * - data checks: what is in the database (pending migrations, demo data, an owner with MFA).
 * A `blocker` stops the deploy; a `warning` is something to decide on consciously.
 */
type Env = Record<string, string | undefined>;

export interface Check {
  id: string;
  level: "blocker" | "warning";
  ok: boolean;
  message: string;
}

const long = (v: string | undefined, n = 32) => !!v && v.length >= n;

/** True when a remote database URL asks for TLS (credentials and personal data must not cross the network in clear). */
export function urlUsesTls(cfg: DbConfig): boolean {
  if (isLocalTarget(cfg)) return true;
  const u = cfg.url.toLowerCase();
  if (cfg.driver === "mongodb") return u.startsWith("mongodb+srv://") || /[?&](tls|ssl)=true/.test(u);
  if (cfg.driver === "postgres") return /[?&]sslmode=(require|verify-ca|verify-full)/.test(u);
  return /[?&]ssl(-mode)?=|[?&]ssl=\{|[?&]sslmode=/.test(u);
}

export function configChecks(env: Env): Check[] {
  const checks: Check[] = [];
  const add = (id: string, level: Check["level"], ok: boolean, message: string) => checks.push({ id, level, ok, message });
  let cfg: DbConfig | null = null;
  let cfgError = "";
  try {
    cfg = readDbConfig(env);
  } catch (e) {
    cfgError = e instanceof Error ? e.message : "invalid";
  }

  add("node_env", "blocker", env.NODE_ENV === "production", "NODE_ENV is production");
  add("database", "blocker", !!cfg, cfg ? "DATABASE_DRIVER + DATABASE_URL set" : `Database not configured${cfgError ? ` (${cfgError})` : ""}`);
  if (cfg) {
    add("database_remote", "warning", !isLocalTarget(cfg), "Database is a managed/remote server (not localhost)");
    add("database_tls", "blocker", urlUsesTls(cfg), "Remote database connection uses TLS");
  }
  add("commerce_own", "blocker", env.COMMERCE_PROVIDER === "own", 'COMMERCE_PROVIDER is "own" (catalogue, bag and stock on the database)');
  add("no_mock_data", "blocker", env.ALLOW_MOCK_DATA !== "true", "ALLOW_MOCK_DATA is not \"true\"");
  add("no_mock_payments", "blocker", env.ALLOW_MOCK_PAYMENTS !== "true", "ALLOW_MOCK_PAYMENTS is not \"true\" (no demo payments)");
  add("no_dev_pages", "blocker", env.ENABLE_DEV_PAGES !== "true", "ENABLE_DEV_PAGES is not \"true\"");
  add("otp_pepper", "blocker", long(env.OTP_PEPPER), "OTP_PEPPER set (≥ 32 characters)");
  add("secret_box", "blocker", !!env.SECRET_BOX_KEY && Buffer.from(env.SECRET_BOX_KEY, "base64").length === 32, "SECRET_BOX_KEY set (32 bytes, base64)");
  add("cron_secret", "blocker", long(env.CRON_SECRET), "CRON_SECRET set (≥ 32 characters)");
  add("site_url", "blocker", /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}$/i.test(env.SITE_URL ?? ""), "SITE_URL is the public https address");
  for (const k of ["LEGAL_ENTITY_NAME", "LEGAL_REGISTERED_ADDRESS", "GRIEVANCE_OFFICER_NAME", "GRIEVANCE_OFFICER_EMAIL", "SUPPORT_EMAIL"]) {
    add(`legal_${k.toLowerCase()}`, "blocker", !!env[k] && !/TO BE PROVIDED|example/i.test(env[k]!), `${k} set (notices need real contact details — DPDP)`);
  }
  add("checkout_enabled", "warning", env.CHECKOUT_ENABLED === "true", "CHECKOUT_ENABLED is \"true\" (store sells)");
  const rzp = env.PAYMENT_GATEWAY === "razorpay";
  add("payment_gateway", "warning", rzp, rzp ? "PAYMENT_GATEWAY is razorpay (online payments on)" : "No payment gateway — only COD can take orders");
  if (rzp) {
    add("razorpay_keys", "blocker", /^rzp_live_[A-Za-z0-9]{8,32}$/.test(env.RAZORPAY_KEY_ID ?? "") && (env.RAZORPAY_KEY_SECRET ?? "").length >= 16, "Razorpay LIVE key id + key secret set (rzp_live_…)");
    add("razorpay_webhook", "blocker", (env.RAZORPAY_WEBHOOK_SECRET ?? "").length >= 16, "RAZORPAY_WEBHOOK_SECRET set (≥ 16 characters)");
  }
  add("indexing", "warning", env.ALLOW_INDEXING === "true", "ALLOW_INDEXING is \"true\" (search engines may index)");
  return checks;
}

export interface DataFacts {
  pendingMigrations: string[];
  demoProducts: number;
  demoReviews: number;
  activeProducts: number;
  ownersWithMfa: number;
  setupTokenStillSet: boolean;
}

export function dataChecks(f: DataFacts): Check[] {
  return [
    { id: "migrations", level: "blocker", ok: f.pendingMigrations.length === 0, message: f.pendingMigrations.length ? `Pending migrations: ${f.pendingMigrations.join(", ")}` : "All migrations applied" },
    { id: "demo_products", level: "blocker", ok: f.demoProducts === 0, message: f.demoProducts ? `${f.demoProducts} demo products in the database — remove before going live` : "No demo products" },
    { id: "demo_reviews", level: "blocker", ok: f.demoReviews === 0, message: f.demoReviews ? `${f.demoReviews} demo reviews in the database — fake reviews must never go live` : "No demo reviews" },
    { id: "catalogue", level: "warning", ok: f.activeProducts > 0, message: `${f.activeProducts} active products` },
    { id: "owner_mfa", level: "blocker", ok: f.ownersWithMfa > 0, message: f.ownersWithMfa ? "An owner has signed in with two-step verification" : "No owner with MFA yet (create one at /admin/setup)" },
    { id: "setup_token", level: "warning", ok: !(f.ownersWithMfa > 0 && f.setupTokenStillSet), message: "ADMIN_SETUP_TOKEN removed once the owner exists" },
  ];
}

export const blockers = (checks: Check[]) => checks.filter((c) => !c.ok && c.level === "blocker");
