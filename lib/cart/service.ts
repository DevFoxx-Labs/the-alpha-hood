import { commerce } from "@/lib/commerce";
import type { CartLine, CommerceAdapter, Product, SizeOption } from "@/lib/commerce/types";
import type { Paise } from "@/lib/format";
import { priceCart, type PaymentMethod, type PriceBreakdown } from "@/lib/pricing/price-cart";
import { DEMO_COUPONS, findCoupon, isCouponLive, type Coupon } from "@/lib/promotions/coupons";

/**
 * Bag service (CART-01/02/05): the one place a cart is read, validated and priced. Used by the bag,
 * mini-cart, checkout quote and order placement, so they can never disagree.
 */
export type LineStatus = "ok" | "price_changed" | "quantity_reduced" | "unavailable";

export interface CartLineView extends CartLine {
  status: LineStatus;
  /** Price before the change, when status = price_changed. */
  previousPrice?: Paise;
  /** Units available now for this size (capped at the per-SKU limit). */
  available: number;
  sizes: SizeOption[];
  category: string;
  subcategory?: string;
}

export interface CartView {
  id: string | null;
  lines: CartLineView[];
  couponCode: string | null;
  pricing: PriceBreakdown;
  /** True when any line needs the shopper's attention before checkout. */
  hasIssues: boolean;
  /** Lines that can be bought (status ≠ unavailable). */
  purchasable: CartLineView[];
}

export interface PricingContext {
  payment?: PaymentMethod | null;
  speed?: "standard" | "express";
  expressFee?: Paise | null;
  shipState?: string | null;
  customer?: { orderCount: number; couponUses: Record<string, number> } | null;
  now?: Date;
}

const EMPTY = (ctx: PricingContext): CartView => ({
  id: null,
  lines: [],
  couponCode: null,
  pricing: priceCart({ lines: [], now: ctx.now }),
  hasIssues: false,
  purchasable: [],
});

/**
 * Loads a cart, re-validates every line against the catalogue and live stock (price changes are adopted and
 * flagged; quantities clamped; sold-out lines flagged unavailable), then prices it.
 */
export async function loadCartView(
  cartId: string | null | undefined,
  ctx: PricingContext = {},
  adapter: CommerceAdapter = commerce,
): Promise<CartView> {
  if (!cartId) return EMPTY(ctx);
  let cart = await adapter.cart.get(cartId);
  if (!cart) return EMPTY(ctx);

  const products = new Map<string, Product | null>();
  for (const id of new Set(cart.lines.map((l) => l.productId))) products.set(id, await adapter.getProductById(id));
  const productById = (id: string) => products.get(id) ?? undefined;

  const flags = new Map<string, { status: LineStatus; previousPrice?: Paise; available: number }>();
  for (const line of cart.lines) {
    const product = productById(line.productId);
    const available = product ? Math.min(await adapter.inventory.available(line.productId, line.size, ctx.now), 5) : 0;
    if (!product || available === 0) {
      flags.set(line.id, { status: "unavailable", available: 0 });
      continue;
    }
    const priceChanged = product.price !== line.price || product.mrp !== line.mrp;
    const reduce = line.quantity > available;
    if (priceChanged || reduce) {
      cart = await adapter.cart.refreshLine(cart.id, line.id, { quantity: Math.min(line.quantity, available) });
    }
    flags.set(line.id, {
      status: reduce ? "quantity_reduced" : priceChanged ? "price_changed" : "ok",
      previousPrice: priceChanged ? line.price : undefined,
      available,
    });
  }

  const lines: CartLineView[] = cart.lines.map((l) => {
    const product = productById(l.productId);
    const f = flags.get(l.id) ?? { status: "ok" as const, available: 0 };
    return {
      ...l,
      handle: l.handle ?? product?.handle,
      status: f.status,
      previousPrice: f.previousPrice,
      available: f.available,
      sizes: product?.sizes ?? [],
      category: product?.category ?? "",
      subcategory: product?.subcategory,
    };
  });
  const purchasable = lines.filter((l) => l.status !== "unavailable");
  const coupon = cart.couponCode ? findCoupon(cart.couponCode) : null;

  return {
    id: cart.id,
    lines,
    couponCode: cart.couponCode ?? null,
    pricing: priceLines(purchasable, coupon, ctx),
    hasIssues: lines.some((l) => l.status !== "ok"),
    purchasable,
  };
}

export function priceLines(lines: CartLineView[], coupon: Coupon | null, ctx: PricingContext): PriceBreakdown {
  return priceCart({
    lines: lines.map((l) => ({
      lineId: l.id,
      productId: l.productId,
      category: l.category,
      subcategory: l.subcategory,
      quantity: l.quantity,
      unitPrice: l.price,
      unitMrp: l.mrp,
    })),
    coupon,
    payment: ctx.payment,
    speed: ctx.speed,
    expressFee: ctx.expressFee,
    shipState: ctx.shipState,
    customer: ctx.customer,
    now: ctx.now,
  });
}

/** "View all offers" (CART-02): every live coupon with its saving or the reason it doesn't apply. */
export function listOffers(view: CartView, ctx: PricingContext = {}) {
  const now = ctx.now ?? new Date();
  return DEMO_COUPONS.filter((c) => isCouponLive(c, now)).map((c) => {
    const p = priceLines(view.purchasable, c, ctx);
    return {
      code: c.code,
      description: c.description,
      ok: p.coupon?.ok ?? false,
      saving: p.coupon?.discount ?? 0,
      reason: p.coupon?.ok ? (p.coupon.provisional ?? null) : (p.coupon?.reason ?? null),
    };
  });
}

/** Strips server-only detail before sending a view to the browser. */
export function publicCartView(view: CartView) {
  return {
    lines: view.lines.map((l) => ({
      id: l.id,
      productId: l.productId,
      handle: l.handle,
      title: l.title,
      colour: l.colour,
      size: l.size,
      quantity: l.quantity,
      price: l.price,
      mrp: l.mrp,
      image: l.image,
      status: l.status,
      previousPrice: l.previousPrice,
      available: l.available,
      sizes: l.sizes.map((s) => ({ label: s.label, stock: s.stock > 0 ? 1 : 0 })),
    })),
    couponCode: view.couponCode,
    pricing: view.pricing,
    hasIssues: view.hasIssues,
  };
}

export type PublicCartView = ReturnType<typeof publicCartView>;
