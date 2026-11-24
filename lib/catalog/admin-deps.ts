import { revalidateTag } from "next/cache";
import { dbStores } from "@/lib/db";
import type { Env } from "@/lib/mock-guard";
import type { CatalogAdminDeps } from "./admin";
import { CATALOG_TAG } from "./cache-tag";

/**
 * Product editing exists only on the own backend (COMMERCE_PROVIDER=own + a database). Anywhere else the
 * catalogue belongs to its platform and the admin is read-only — returns null (fail closed).
 */
export function catalogAdminDeps(env: Env = process.env): CatalogAdminDeps | null {
  if (env.COMMERCE_PROVIDER !== "own") return null;
  const db = dbStores(env);
  if (!db) return null;
  return {
    store: db.catalog,
    media: db.media,
    invalidate() {
      db.own().invalidate();
      try {
        revalidateTag(CATALOG_TAG, "max"); // pages refresh in the background (stale-while-revalidate)
      } catch {
        // Outside a Next.js request (tests, scripts) there is no page cache to refresh.
      }
    },
  };
}
