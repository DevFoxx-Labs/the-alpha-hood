import { rupees, type Paise } from "@/lib/format";
import type { DeliveryPromise } from "@/lib/shipping";

/**
 * CHK-07 COD risk controls. Hard rules block COD; soft signals add to a risk score stored on the order so
 * ops can confirm high-risk COD orders before shipping (WhatsApp/IVR confirmation is P1).
 * DEMO thresholds — confirm with the owner (PRD §15 Q4).
 */
export const COD_RULES = {
  maxOrderValue: rupees(5000),
  minAddressQuality: 40,
  maxCustomerRto: 2,
  /** Demo pincode prefixes with high return-to-origin history. */
  highRtoPincodePrefixes: ["8452", "8241"],
  highRiskScore: 60,
};

export interface CodDecision {
  allowed: boolean;
  /** Customer-facing reasons COD isn't available. */
  reasons: string[];
  /** 0–100, stored on the order for ops. */
  score: number;
  needsConfirmation: boolean;
}

export function codDecision(input: {
  codEnabled: boolean;
  total: Paise;
  promise: Pick<DeliveryPromise, "serviceable" | "cod" | "pincode">;
  customer: { codBlocked: boolean; rtoCount: number; orderCount: number };
  addressQuality: number;
}): CodDecision {
  const reasons: string[] = [];
  let score = 0;

  if (!input.codEnabled) reasons.push("Cash on delivery is unavailable right now.");
  if (!input.promise.serviceable || !input.promise.cod.available) reasons.push("Cash on delivery isn't available for this pincode.");
  if (input.total > COD_RULES.maxOrderValue) {
    reasons.push(`Cash on delivery is available on orders up to ₹${COD_RULES.maxOrderValue / 100}.`);
  }
  if (input.customer.codBlocked || input.customer.rtoCount >= COD_RULES.maxCustomerRto) {
    reasons.push("Cash on delivery isn't available for this account. Pay online instead.");
  }
  if (COD_RULES.highRtoPincodePrefixes.some((p) => input.promise.pincode.startsWith(p))) {
    reasons.push("Cash on delivery isn't available for this pincode.");
  }
  if (input.addressQuality < COD_RULES.minAddressQuality) {
    reasons.push("Add a house/flat number and a landmark to use cash on delivery.");
  }

  if (input.customer.orderCount === 0) score += 25;
  score += Math.round((100 - input.addressQuality) * 0.4);
  score += input.customer.rtoCount * 20;
  if (input.total > COD_RULES.maxOrderValue * 0.6) score += 15;
  score = Math.min(100, score);

  return { allowed: reasons.length === 0, reasons: [...new Set(reasons)], score, needsConfirmation: score >= COD_RULES.highRiskScore };
}
