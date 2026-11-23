import { createHash } from "node:crypto";
import { dbStores } from "@/lib/db";
import { devSingleton } from "@/lib/mock-guard";
import { securityEvent } from "@/lib/security/log";

/**
 * Fixed-window rate limiter.
 *
 * - Own backend configured: counters live in the database (one atomic increment per hit), so every server shares
 *   them. Keys are stored as SHA-256 hashes — limiter keys contain IPs and phone numbers, which have no business
 *   sitting in a table (DPDP data minimisation).
 * - Otherwise: in-process counters (correct for `next dev`, one Node server and tests).
 * If the database is unreachable the in-process counter is used for that request (logged), so limits never
 * switch off entirely.
 */
export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  hit(key: string, limit: number, windowMs: number, now?: number): Promise<RateLimitResult>;
  /** True while the key is still under its limit; doesn't count as a hit. */
  peek(key: string, limit: number, windowMs: number, now?: number): Promise<boolean>;
  /** Clears in-process counters (tests). Database counters are cleared with the test database. */
  reset(): void;
}

/** Window counter storage. `hit` increments atomically (starting a new window when the old one ended). */
export interface RateCounterStore {
  hit(keyHash: string, windowMs: number, now: number): Promise<{ count: number; resetAt: number }>;
  peek(keyHash: string, now: number): Promise<{ count: number; resetAt: number } | null>;
}

const MAX_KEYS = 50_000;

function result(count: number, resetAt: number, limit: number, now: number): RateLimitResult {
  const ok = count <= limit;
  return { ok, remaining: Math.max(0, limit - count), retryAfterSeconds: ok ? 0 : Math.max(1, Math.ceil((resetAt - now) / 1000)) };
}

export function createMemoryCounters(): RateCounterStore & { clear(): void } {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  const sweep = (now: number) => {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  };
  return {
    async hit(key, windowMs, now) {
      let b = buckets.get(key);
      if (!b || b.resetAt <= now) {
        if (buckets.size >= MAX_KEYS) sweep(now);
        b = { count: 0, resetAt: now + windowMs };
        buckets.set(key, b);
      }
      b.count += 1;
      return { ...b };
    },
    async peek(key, now) {
      const b = buckets.get(key);
      return b && b.resetAt > now ? { ...b } : null;
    },
    clear() {
      buckets.clear();
    },
  };
}

export function createRateLimiter(counters?: () => RateCounterStore | null, memory = createMemoryCounters()): RateLimiter {
  const store = () => counters?.() ?? memory;
  async function run<T>(fn: (s: RateCounterStore) => Promise<T>): Promise<T> {
    const s = store();
    if (s === memory) return fn(memory);
    try {
      return await fn(s);
    } catch {
      securityEvent("rate_limit_store_error", {});
      return fn(memory);
    }
  }
  return {
    async hit(key, limit, windowMs, now = Date.now()) {
      const k = createHash("sha256").update(key).digest("hex");
      const b = await run((s) => s.hit(k, windowMs, now));
      return result(b.count, b.resetAt, limit, now);
    },
    async peek(key, limit, _windowMs, now = Date.now()) {
      const k = createHash("sha256").update(key).digest("hex");
      const b = await run((s) => s.peek(k, now));
      return !b || b.count < limit;
    },
    reset() {
      memory.clear();
    },
  };
}

// Only the in-process counters are kept across hot reloads; the database store is looked up through the current
// module on every call (a long-running dev server never keeps using stores built by older code).
export const rateLimiter = createRateLimiter(() => dbStores()?.rateCounters ?? null, devSingleton("rate_limiter_memory", createMemoryCounters));
