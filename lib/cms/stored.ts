import type { CatalogDocs } from "@/lib/catalog/store";
import { dbStores } from "@/lib/db";
import type { Env } from "@/lib/mock-guard";

/**
 * The catalogue documents saved in the admin (homepage content, Shop all list) — own backend only
 * (COMMERCE_PROVIDER=own + a database). Elsewhere: null, and the store shows its built-in content.
 * Server only (lib/db); called from the cached loaders in lib/storefront.ts, which the admin's saves refresh
 * through the catalogue cache tag.
 */
export async function storedCatalogDocs(env: Env = process.env): Promise<CatalogDocs | null> {
  if (env.COMMERCE_PROVIDER !== "own") return null;
  const db = dbStores(env);
  if (!db) return null;
  return db.catalog.getDocs();
}
