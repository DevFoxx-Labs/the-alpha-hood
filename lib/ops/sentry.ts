import { randomBytes } from "node:crypto";
import type { Env } from "@/lib/mock-guard";

/**
 * Server error reporting to Sentry without the SDK: one small HTTPS POST per error (Sentry's envelope endpoint).
 *
 * - On only when SENTRY_DSN is set (Admin → Settings → Error Tracking, or the environment).
 * - The DSN must be one of Sentry's own ingest hosts (`o<org>.ingest[.<region>].sentry.io`), so a saved value can
 *   never make this server call an arbitrary address.
 * - No personal data: the error type, message and stack, the route pattern and path (no query string), the method,
 *   and the release. Never headers, cookies, IP addresses or request bodies. The message is scrubbed of things
 *   that look like phone numbers, emails and long tokens.
 * - Never throws and never waits long: 3 s timeout, at most 20 events a minute per server.
 */
const DSN_RE = /^https:\/\/([0-9a-f]{32})@(o\d{1,12}\.ingest(?:\.[a-z]{2})?\.sentry\.io)\/(\d{1,12})$/;

export interface SentryTarget {
  url: string;
  dsn: string;
  environment: string;
}

export function readSentry(env: Env = process.env): SentryTarget | null {
  const dsn = env.SENTRY_DSN?.trim() ?? "";
  const m = DSN_RE.exec(dsn);
  if (!m) return null;
  const environment = /^[a-z0-9_-]{2,40}$/.test(env.SENTRY_ENVIRONMENT ?? "") ? env.SENTRY_ENVIRONMENT! : env.NODE_ENV === "production" ? "production" : "development";
  return { url: `https://${m[2]}/api/${m[3]}/envelope/`, dsn, environment };
}

/** Removes things that look like personal data or secrets from free text. */
export function scrub(text: string): string {
  return text
    .replace(/[^\s@"'<>]{1,64}@[^\s@"'<>]{1,190}\.[A-Za-z]{2,24}/g, "[email]")
    // Tokens before numbers: a long key that contains digits must go as a whole, not be cut by the number rule.
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[token]")
    .replace(/\+?\d[\d\s-]{8,14}\d/g, "[number]")
    .slice(0, 1_000);
}

function frames(stack: string | undefined) {
  if (!stack) return undefined;
  const out = stack
    .split("\n")
    .slice(1, 30)
    .map((line) => /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/.exec(line))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ function: m[1] ?? "<anonymous>", filename: m[2].replace(/^.*[\\/](?=(app|lib|components|node_modules)[\\/])/, ""), lineno: Number(m[3]), colno: Number(m[4]) }))
    .reverse();
  return out.length ? { frames: out } : undefined;
}

export interface ErrorContext {
  path?: string;
  method?: string;
  routePath?: string;
  routeType?: string;
}

export function buildEnvelope(error: unknown, ctx: ErrorContext, target: SentryTarget, now = new Date()): string {
  const err = error instanceof Error ? error : new Error(typeof error === "string" ? error : "Non-error thrown");
  const eventId = randomBytes(16).toString("hex");
  const digest = typeof (error as { digest?: unknown })?.digest === "string" ? (error as { digest: string }).digest.slice(0, 64) : undefined;
  const event = {
    event_id: eventId,
    timestamp: now.getTime() / 1000,
    platform: "node",
    level: "error",
    environment: target.environment,
    server_name: "alpha-hood",
    transaction: ctx.routePath?.slice(0, 200),
    exception: { values: [{ type: (err.name || "Error").slice(0, 100), value: scrub(err.message ?? ""), stacktrace: frames(err.stack) }] },
    // Path only: query strings can carry order numbers, phone numbers or tokens.
    request: ctx.path ? { url: ctx.path.split("?")[0].slice(0, 300), method: ctx.method?.slice(0, 10) } : undefined,
    tags: { route_type: ctx.routeType?.slice(0, 40), ...(digest ? { digest } : {}) },
  };
  return [JSON.stringify({ event_id: eventId, sent_at: now.toISOString(), dsn: target.dsn }), JSON.stringify({ type: "event" }), JSON.stringify(event)].join("\n");
}

const g = globalThis as { __alpha_hood_sentry_window?: { start: number; count: number } };
const MAX_PER_MINUTE = 20;

/** Sends one error. Resolves to whether it was sent; never throws. */
export async function reportError(error: unknown, ctx: ErrorContext = {}, env: Env = process.env, fetcher: typeof fetch = fetch): Promise<boolean> {
  try {
    const target = readSentry(env);
    if (!target) return false;
    const now = Date.now();
    const w = (g.__alpha_hood_sentry_window ??= { start: now, count: 0 });
    if (now - w.start > 60_000) Object.assign(w, { start: now, count: 0 });
    if (++w.count > MAX_PER_MINUTE) return false; // an error storm must not become a request storm
    const res = await fetcher(target.url, { method: "POST", redirect: "error", signal: AbortSignal.timeout(3_000), headers: { "content-type": "application/x-sentry-envelope" }, body: buildEnvelope(error, ctx, target) });
    return res.ok;
  } catch {
    return false;
  }
}
