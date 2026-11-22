import { devSingleton } from "@/lib/mock-guard";

/**
 * Fixed-window rate limiter.
 *
 * In-memory: correct for `next dev`, a single Node server and tests. On serverless/multi-instance hosting
 * each instance counts separately, so production must move this to a shared store (Redis/Upstash) —
 * tracked in docs/known-gaps.md. The interface stays the same.
 */
export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  hit(key: string, limit: number, windowMs: number, now?: number): RateLimitResult;
  reset(): void;
}

const MAX_KEYS = 50_000;

export function createRateLimiter(): RateLimiter {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  function sweep(now: number) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }

  return {
    hit(key, limit, windowMs, now = Date.now()) {
      let bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= now) {
        if (buckets.size >= MAX_KEYS) sweep(now);
        bucket = { count: 0, resetAt: now + windowMs };
        buckets.set(key, bucket);
      }
      bucket.count += 1;
      const ok = bucket.count <= limit;
      return {
        ok,
        remaining: Math.max(0, limit - bucket.count),
        retryAfterSeconds: ok ? 0 : Math.ceil((bucket.resetAt - now) / 1000),
      };
    },
    reset() {
      buckets.clear();
    },
  };
}

export const rateLimiter = devSingleton("rate_limiter", createRateLimiter);
