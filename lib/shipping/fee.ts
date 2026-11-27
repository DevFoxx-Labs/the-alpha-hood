import { STORE_CONFIG } from "@/lib/config/store";
import type { Paise } from "@/lib/format";

/** Free standard shipping above the threshold (STORE_CONFIG). */
export function shippingFee(subtotal: Paise): Paise {
  return subtotal >= STORE_CONFIG.freeShippingThreshold ? 0 : STORE_CONFIG.shippingFee;
}
