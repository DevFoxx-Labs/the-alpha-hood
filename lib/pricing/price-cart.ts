import { STORE_CONFIG } from "@/lib/config/store";
import { rupees, type Paise } from "@/lib/format";
import { automaticUnitDiscount, PREPAID_OFFER, type AutomaticDiscount, AUTOMATIC_DISCOUNTS } from "@/lib/promotions/automatic";
import { applyCombos, COMBOS, type Combo, type ComboApplication, type ComboResult } from "@/lib/promotions/combos";
import { evaluateCoupon, type Coupon } from "@/lib/promotions/coupons";
import { gstClassFor, inclusiveTax, isIntraState, rateFor, splitTax } from "./gst";

/**
 * The ONE place money is computed (CART-02, CHK-05/07/10, PROMO-01…04). Bag, checkout quote, order
 * placement and the payment amount all call this on the server with catalogue prices — never client values.
 *
 * Order of operations: catalogue price → automatic discount → combos → coupon → prepaid offer → shipping,
 * express and COD fees. Free shipping is judged on the goods value after combos and coupon (before the
 * prepaid offer, so choosing UPI never adds a shipping fee).
 */
export const SHIPPING_FEE: Paise = rupees(79);
export const COD_FEE: Paise = rupees(49);

export type PaymentMethod = "upi" | "card" | "netbanking" | "wallet" | "cod";
export const PAYMENT_METHODS: PaymentMethod[] = ["upi", "card", "netbanking", "wallet", "cod"];

export interface PricingLineInput {
  lineId: string;
  productId: string;
  category: string;
  subcategory?: string;
  quantity: number;
  /** Catalogue selling price per unit (paise). */
  unitPrice: Paise;
  unitMrp: Paise;
}

export interface PricingInput {
  lines: PricingLineInput[];
  coupon?: Coupon | null;
  payment?: PaymentMethod | null;
  speed?: "standard" | "express";
  /** Express fee from the shipping partner (null = not available). */
  expressFee?: Paise | null;
  shipState?: string | null;
  customer?: { orderCount: number; couponUses: Record<string, number> } | null;
  now?: Date;
  /** Overridable for tests. */
  rules?: { combos?: Combo[]; automatic?: AutomaticDiscount[] };
}

export interface PricedLine {
  lineId: string;
  quantity: number;
  unitPrice: Paise;
  unitMrp: Paise;
  automaticDiscount: Paise;
  comboDiscount: Paise;
  couponDiscount: Paise;
  prepaidDiscount: Paise;
  /** What the customer pays for this line (tax inclusive). */
  net: Paise;
  gstRate: number;
  gst: Paise;
}

export interface PriceBreakdown {
  lines: PricedLine[];
  itemCount: number;
  mrpTotal: Paise;
  sellingTotal: Paise;
  saleDiscount: Paise;
  automaticDiscount: Paise;
  comboDiscount: Paise;
  couponDiscount: Paise;
  prepaidDiscount: Paise;
  goodsTotal: Paise;
  shipping: Paise;
  expressFee: Paise;
  codFee: Paise;
  total: Paise;
  savings: Paise;
  gst: { cgst: Paise; sgst: Paise; igst: Paise; total: Paise };
  combos: ComboApplication[];
  comboProgress: ComboResult["progress"];
  coupon: { code: string; ok: boolean; discount: Paise; reason?: string; provisional?: string | null } | null;
  freeShippingRemaining: Paise;
}

function assertLine(l: PricingLineInput) {
  for (const v of [l.quantity, l.unitPrice, l.unitMrp]) {
    if (!Number.isSafeInteger(v) || v < 0) throw new Error("Invalid pricing input");
  }
  if (l.quantity < 1 || l.quantity > STORE_CONFIG.maxQtyPerSku) throw new Error("Invalid quantity");
}

export function priceCart(input: PricingInput): PriceBreakdown {
  const now = input.now ?? new Date();
  input.lines.forEach(assertLine);

  // 1. Automatic discounts per unit.
  const base = input.lines.map((l) => {
    const auto = automaticUnitDiscount(l.unitPrice, l.category, now, input.rules?.automatic ?? AUTOMATIC_DISCOUNTS);
    return { ...l, effectiveUnit: l.unitPrice - auto.discount, autoTotal: auto.discount * l.quantity };
  });

  // 2. Combos on the post-automatic unit price.
  const combo = applyCombos(
    base.map((l) => ({ lineId: l.lineId, unitPrice: l.effectiveUnit, quantity: l.quantity, category: l.category, subcategory: l.subcategory })),
    input.rules?.combos ?? COMBOS,
    now,
  );
  const afterCombo = base.map((l) => ({ ...l, value: l.effectiveUnit * l.quantity - (combo.lineDiscounts.get(l.lineId) ?? 0) }));

  // 3. Coupon.
  const payment = input.payment ?? null;
  let couponInfo: PriceBreakdown["coupon"] = null;
  let couponAlloc = new Map<string, Paise>();
  if (input.coupon) {
    const ev = evaluateCoupon(input.coupon, {
      lines: afterCombo.map((l) => ({
        lineId: l.lineId,
        category: l.category,
        value: l.value,
        nonComboValue: (l.quantity - (combo.lineBundledUnits.get(l.lineId) ?? 0)) * l.effectiveUnit,
      })),
      payment: payment === null ? null : payment === "cod" ? "cod" : "prepaid",
      customer: input.customer
        ? { orderCount: input.customer.orderCount, uses: input.customer.couponUses[input.coupon.code] ?? 0 }
        : null,
      now,
    });
    if (ev.ok) {
      couponAlloc = ev.allocations;
      couponInfo = { code: input.coupon.code, ok: true, discount: ev.discount, provisional: ev.provisional };
    } else {
      couponInfo = { code: input.coupon.code, ok: false, discount: 0, reason: ev.reason };
    }
  }

  const afterCoupon = afterCombo.map((l) => ({ ...l, value: l.value - (couponAlloc.get(l.lineId) ?? 0) }));
  const goodsBeforePrepaid = afterCoupon.reduce((n, l) => n + l.value, 0);

  // 4. Prepaid offer.
  const prepaidAlloc = new Map<string, Paise>();
  let prepaidDiscount = 0;
  if (payment && (PREPAID_OFFER.methods as readonly string[]).includes(payment) && goodsBeforePrepaid > 0) {
    prepaidDiscount = Math.min(Math.floor((goodsBeforePrepaid * PREPAID_OFFER.percent) / 100), PREPAID_OFFER.max);
    let allocated = 0;
    afterCoupon.forEach((l, i) => {
      const share = i === afterCoupon.length - 1 ? prepaidDiscount - allocated : Math.floor((prepaidDiscount * l.value) / goodsBeforePrepaid);
      allocated += share;
      prepaidAlloc.set(l.lineId, share);
    });
  }

  // 5. Lines with GST.
  const intra = isIntraState(input.shipState);
  const gst = { cgst: 0, sgst: 0, igst: 0, total: 0 };
  const lines: PricedLine[] = afterCoupon.map((l) => {
    const net = l.value - (prepaidAlloc.get(l.lineId) ?? 0);
    const rate = rateFor(gstClassFor(l.category), Math.floor(net / l.quantity));
    const tax = inclusiveTax(net, rate);
    const split = splitTax(tax, intra);
    gst.cgst += split.cgst;
    gst.sgst += split.sgst;
    gst.igst += split.igst;
    gst.total += tax;
    return {
      lineId: l.lineId,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      unitMrp: l.unitMrp,
      automaticDiscount: l.autoTotal,
      comboDiscount: combo.lineDiscounts.get(l.lineId) ?? 0,
      couponDiscount: couponAlloc.get(l.lineId) ?? 0,
      prepaidDiscount: prepaidAlloc.get(l.lineId) ?? 0,
      net,
      gstRate: rate,
      gst: tax,
    };
  });

  const mrpTotal = input.lines.reduce((n, l) => n + l.unitMrp * l.quantity, 0);
  const sellingTotal = input.lines.reduce((n, l) => n + l.unitPrice * l.quantity, 0);
  const goodsTotal = lines.reduce((n, l) => n + l.net, 0);
  const hasItems = lines.length > 0;
  const shipping = !hasItems || goodsBeforePrepaid >= STORE_CONFIG.freeShippingThreshold ? 0 : SHIPPING_FEE;
  const expressFee = hasItems && input.speed === "express" && input.expressFee ? input.expressFee : 0;
  const codFee = hasItems && payment === "cod" ? COD_FEE : 0;
  const sum = (k: keyof Pick<PricedLine, "automaticDiscount" | "comboDiscount" | "couponDiscount">) => lines.reduce((n, l) => n + l[k], 0);

  const breakdown: PriceBreakdown = {
    lines,
    itemCount: lines.reduce((n, l) => n + l.quantity, 0),
    mrpTotal,
    sellingTotal,
    saleDiscount: Math.max(0, mrpTotal - sellingTotal),
    automaticDiscount: sum("automaticDiscount"),
    comboDiscount: sum("comboDiscount"),
    couponDiscount: sum("couponDiscount"),
    prepaidDiscount,
    goodsTotal,
    shipping,
    expressFee,
    codFee,
    total: goodsTotal + shipping + expressFee + codFee,
    savings: 0,
    gst,
    combos: combo.applications,
    comboProgress: combo.progress,
    coupon: couponInfo,
    freeShippingRemaining: hasItems ? Math.max(0, STORE_CONFIG.freeShippingThreshold - goodsBeforePrepaid) : STORE_CONFIG.freeShippingThreshold,
  };
  breakdown.savings =
    breakdown.saleDiscount + breakdown.automaticDiscount + breakdown.comboDiscount + breakdown.couponDiscount + breakdown.prepaidDiscount;
  return breakdown;
}
