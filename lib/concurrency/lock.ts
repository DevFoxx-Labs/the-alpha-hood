import { dbStores } from "@/lib/db";
import { devSingleton } from "@/lib/mock-guard";

/**
 * Keyed async mutex — the in-process stand-in for a row lock (`SELECT … FOR UPDATE`). Serialises
 * multi-step money flows (place order, payment events) per key. With a real database these flows run in a
 * transaction with row locks / conditional updates instead; the call sites stay the same.
 */
export interface KeyedLock {
  run<T>(key: string, fn: () => Promise<T>): Promise<T>;
}

export function createKeyedLock(): KeyedLock {
  const tails = new Map<string, Promise<unknown>>();
  return {
    async run(key, fn) {
      const previous = tails.get(key) ?? Promise.resolve();
      let release!: () => void;
      const current = new Promise<void>((r) => (release = r));
      const tail = previous.then(() => current);
      tails.set(key, tail);
      await previous;
      try {
        return await fn();
      } finally {
        release();
        if (tails.get(key) === tail) tails.delete(key);
      }
    },
  };
}

const memoryLocks = () => devSingleton("keyed_lock", createKeyedLock);

/** Database-backed mutex when the own backend is configured (correct across servers), else in-process. */
export function resolveLocks(env: Record<string, string | undefined> = process.env): KeyedLock {
  return dbStores(env)?.locks ?? memoryLocks();
}

export const locks: KeyedLock = { run: (key, fn) => resolveLocks().run(key, fn) };
