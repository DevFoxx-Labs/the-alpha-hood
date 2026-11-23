/**
 * Own-backend database selection. One business layer (lib/* services), three storage engines:
 *
 *   DATABASE_DRIVER = mysql | postgres | mongodb
 *   DATABASE_URL    = mysql://user:pass@host:3306/db | postgres://user:pass@host:5432/db | mongodb://host:27017/db?replicaSet=rs0
 *
 * Unset → no database: dev/tests use the in-memory stores, production refuses (fail closed, unchanged).
 * A driver/URL mismatch or a URL without a database name is a configuration error (thrown, never guessed).
 *
 * This file is imported by the migration CLI (plain Node), so it uses relative imports only.
 */
export const DRIVERS = ["mysql", "postgres", "mongodb"] as const;
export type Driver = (typeof DRIVERS)[number];

export interface DbConfig {
  driver: Driver;
  url: string;
}

type Env = Record<string, string | undefined>;

const SCHEMES: Record<Driver, string[]> = {
  mysql: ["mysql:"],
  postgres: ["postgres:", "postgresql:"],
  mongodb: ["mongodb:", "mongodb+srv:"],
};

export class DbConfigError extends Error {}

function parse(url: string): URL {
  // `mongodb+srv:` and others parse fine with the WHATWG URL parser.
  try {
    return new URL(url);
  } catch {
    throw new DbConfigError("DATABASE_URL is not a valid URL.");
  }
}

export function readDbConfig(env: Env = process.env): DbConfig | null {
  const driver = env.DATABASE_DRIVER?.trim();
  const url = env.DATABASE_URL?.trim();
  if (!driver && !url) return null;
  if (!driver || !(DRIVERS as readonly string[]).includes(driver)) throw new DbConfigError(`DATABASE_DRIVER must be one of ${DRIVERS.join(", ")}.`);
  if (!url) throw new DbConfigError("DATABASE_URL is required when DATABASE_DRIVER is set.");
  const u = parse(url);
  if (!SCHEMES[driver as Driver].includes(u.protocol)) throw new DbConfigError(`DATABASE_URL scheme ${u.protocol} doesn't match DATABASE_DRIVER=${driver}.`);
  if (!databaseName({ driver: driver as Driver, url })) throw new DbConfigError("DATABASE_URL must name a database (…/alpha_hood_dev).");
  return { driver: driver as Driver, url };
}

export function databaseName(cfg: DbConfig): string {
  return decodeURIComponent(parse(cfg.url).pathname.replace(/^\//, "").split("/")[0] ?? "");
}

/** Safe to print: no user name or password. */
export function describeTarget(cfg: DbConfig): string {
  const u = parse(cfg.url);
  return `${cfg.driver}://${u.hostname}${u.port ? `:${u.port}` : ""}/${databaseName(cfg)}`;
}

export function isLocalTarget(cfg: DbConfig): boolean {
  const host = parse(cfg.url).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

/**
 * Database-safety rule: wiping / dropping is allowed ONLY on a local database whose name ends in `_test` or `_dev`,
 * and never when NODE_ENV=production. Everything else (staging, production, any remote host) is refused.
 */
export function assertDestructiveAllowed(cfg: DbConfig, env: Env = process.env): void {
  const name = databaseName(cfg);
  if (env.NODE_ENV === "production") throw new DbConfigError("Refusing a destructive database operation in production.");
  if (!isLocalTarget(cfg)) throw new DbConfigError(`Refusing a destructive operation on a non-local database (${describeTarget(cfg)}).`);
  if (!/_(test|dev)$/.test(name)) throw new DbConfigError(`Refusing a destructive operation: database "${name}" must end in _test or _dev.`);
}
