import { requireStaff } from "@/lib/admin/auth";
import { privateJson } from "@/lib/admin/http";
import { COMBOS } from "@/lib/promotions/combos";
import { DEMO_COUPONS, isCouponLive } from "@/lib/promotions/coupons";

/** ADM-05 promotions (read-only until the platform holds them). */
export async function GET(request: Request) {
  const auth = requireStaff(request, "promotions.read");
  if (!auth.ok) return auth.response;
  const now = new Date();
  return privateJson({
    coupons: DEMO_COUPONS.map((c) => ({ code: c.code, description: c.description, kind: c.kind, value: c.value, minCart: c.minCart, maxDiscount: c.maxDiscount ?? null, firstOrderOnly: !!c.firstOrderOnly, prepaidOnly: !!c.prepaidOnly, perCustomerLimit: c.perCustomerLimit ?? null, live: isCouponLive(c, now) })),
    combos: COMBOS.map((c) => ({ id: c.id, title: c.title, size: c.size, price: c.price, collection: c.collection })),
  });
}
