import { resolveCommerce } from "./resolve";

/**
 * The single entry point the storefront uses for commerce data. Import it from Server Components /
 * server code only. Provider is chosen by COMMERCE_PROVIDER; see ./resolve.ts for the fail-closed rules.
 */
export const commerce = resolveCommerce(process.env);

export type * from "./types";
