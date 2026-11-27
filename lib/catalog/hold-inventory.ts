import { CommerceError, type CommerceAdapter } from "@/lib/commerce/types";

/**
 * The storefront inventory for "Show as sold out" (lib/catalog/hold.ts): a held product has nothing to sell, so the
 * bag, Buy now and checkout all refuse it on the server whatever the screen shows. Admin reads (snapshot / adjust)
 * and real stock are untouched. Kept free of other imports: `lib/db` builds the adapter with it.
 */
type Inventory = CommerceAdapter["inventory"];

export function holdInventory(inventory: Inventory, isHeld: (productId: string) => Promise<boolean>): Inventory {
  return {
    ...inventory,
    async available(productId, size, now) {
      return (await isHeld(productId)) ? 0 : inventory.available(productId, size, now);
    },
    async reserve(reference, items, ttlMs, now) {
      // A checkout already holding its units (switched on mid-payment) is left alone; new holds are refused.
      if (!(await inventory.isHeld(reference, now))) {
        for (const i of items) if (await isHeld(i.productId)) throw new CommerceError("out_of_stock", "Not enough stock");
      }
      return inventory.reserve(reference, items, ttlMs, now);
    },
  };
}
