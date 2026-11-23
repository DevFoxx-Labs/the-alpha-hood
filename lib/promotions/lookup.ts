import { referralCoupon } from "@/lib/loyalty/service";
import { type Coupon, findCoupon } from "./coupons";

/**
 * Every code a shopper can type: the live coupon list, then Alpha Club referral codes (LOY-02). SERVER ONLY — it
 * reaches the loyalty store (database). Kept out of `coupons.ts`, which the browser bundle imports for types and
 * display maths, so database drivers never end up in client code.
 */
export async function lookupCoupon(code: string): Promise<Coupon | null> {
  return findCoupon(code) ?? referralCoupon(code);
}
