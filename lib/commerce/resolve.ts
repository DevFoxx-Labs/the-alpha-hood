import { dbStores } from "@/lib/db";
import { devSingleton, type Env, mockDataAllowed } from "@/lib/mock-guard";
import { createMockAdapter } from "./mock";
import type { CommerceAdapter } from "./types";

/**
 * Picks the commerce adapter. Fails closed:
 * - an unknown provider throws;
 * - the mock adapter is refused when NODE_ENV=production unless ALLOW_MOCK_DATA is exactly "true"
 *   (used only for preview builds — never set it on the live store).
 * Real adapters (shopify | medusa) are added once the PRD §4 platform decision is made.
 */
export function resolveCommerce(env: Env): CommerceAdapter {
  const provider = env.COMMERCE_PROVIDER ?? "mock";

  switch (provider) {
    case "mock": {
      if (!mockDataAllowed(env)) {
        return refusingAdapter(
          "Mock commerce is disabled in production. Set COMMERCE_PROVIDER to a real platform.",
        );
      }
      // One instance per process: carts and stock must be shared by every route bundle.
      const catalog = devSingleton("commerce_mock", createMockAdapter);
      // Own backend: bags and stock live in the database; products still come from the catalogue (phase 4).
      const db = dbStores(env);
      return db ? devSingleton(`commerce_db_${db.config.driver}`, () => db.commerce(catalog)) : catalog;
    }
    default:
      throw new Error(`Unknown COMMERCE_PROVIDER "${provider}"`);
  }
}

/**
 * An adapter whose every call throws. Lets `next build` import the module without crashing,
 * while any request that would actually read mock data in production fails loudly.
 */
function refusingAdapter(message: string): CommerceAdapter {
  const fail = async (): Promise<never> => {
    throw new Error(message);
  };
  return {
    name: "disabled",
    getProduct: fail,
    getProductById: fail,
    listProducts: fail,
    getCollection: fail,
    listCollections: fail,
    listCategories: fail,
    listCategoryTree: fail,
    getCategory: fail,
    searchCatalog: fail,
    suggest: fail,
    cart: { get: fail, create: fail, addLine: fail, updateLine: fail, removeLine: fail, setCoupon: fail, refreshLine: fail, clear: fail },
    inventory: { available: fail, reserve: fail, commit: fail, release: fail, isHeld: fail, restock: fail, adjust: fail, snapshot: fail },
  };
}
