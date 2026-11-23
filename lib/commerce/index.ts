import { resolveCommerce } from "./resolve";
import type { CommerceAdapter } from "./types";

/**
 * The single entry point the storefront uses for commerce data. Import it from Server Components /
 * server code only. Provider is chosen by COMMERCE_PROVIDER; see ./resolve.ts for the fail-closed rules.
 *
 * Resolved on each access (the adapters themselves are cached singletons), so the choice always follows the
 * current environment — e.g. DATABASE_DRIVER switching bags + stock to the own backend — instead of whatever
 * the environment was when this module was first imported.
 */
export const commerce: CommerceAdapter = new Proxy({} as CommerceAdapter, {
  get(_, key) {
    const adapter = resolveCommerce(process.env);
    const value = Reflect.get(adapter, key);
    return typeof value === "function" ? value.bind(adapter) : value;
  },
});

export type * from "./types";
