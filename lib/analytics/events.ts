import type { CartLine, Product } from "@/lib/commerce/types";
import type { Paise } from "@/lib/format";

/**
 * ANL-01 event catalogue — one typed list shared by the browser (gtag / fbq) and the server (Conversions API,
 * GA4 Measurement Protocol). Amounts are integer paise in our code and converted to rupees only here.
 *
 * Privacy (DPDP): events carry product and order data only. No name, phone, email or address is ever put in
 * an event; the server adds hashed contact data for Meta only with advertising consent (lib/analytics/server.ts).
 */
export interface AnalyticsItem {
  id: string;
  name: string;
  category?: string;
  variant?: string;
  price: Paise;
  quantity?: number;
  listName?: string;
  index?: number;
}

export interface EventMap {
  view_item_list: { listName: string; items: AnalyticsItem[] };
  select_item: { listName: string; item: AnalyticsItem };
  view_item: { item: AnalyticsItem };
  add_to_wishlist: { item: AnalyticsItem };
  add_to_cart: { item: AnalyticsItem };
  view_cart: { value: Paise; items: AnalyticsItem[] };
  begin_checkout: { value: Paise; items: AnalyticsItem[]; coupon?: string | null };
  add_shipping_info: { value: Paise; items: AnalyticsItem[]; tier: "standard" | "express" };
  add_payment_info: { value: Paise; items: AnalyticsItem[]; paymentType: string };
  purchase: { orderNumber: string; value: Paise; tax: Paise; shipping: Paise; items: AnalyticsItem[]; coupon?: string | null; paymentType: string };
  refund: { orderNumber: string; value: Paise; items?: AnalyticsItem[] };
  // PRD §11 custom events
  size_guide_open: { productId: string };
  size_selected: { productId: string; size: string };
  pincode_check: { serviceable: boolean };
  coupon_apply: { code: string; success: boolean };
  cod_selected: Record<string, never>;
  search: { query: string; results: number };
  return_request: { reason: string };
  exchange_chosen: Record<string, never>;
}

export type EventName = keyof EventMap;

export const rupeesValue = (p: Paise) => Math.round(p) / 100;

/** Search terms can contain personal data typed by mistake (a phone or email): those are never sent. */
export function safeSearchTerm(q: string): string | null {
  const t = q.trim().slice(0, 80);
  if (!t) return null;
  if (/@/.test(t) || /\d{6,}/.test(t.replace(/[\s-]/g, ""))) return null;
  return t.toLowerCase();
}

/** Coupon codes are marketing codes, but a personal/referral-looking code (digits ≥ 6) is dropped. */
const safeCode = (c: string | null | undefined) => (c && /^[A-Z0-9]{2,20}$/.test(c) && !/\d{6,}/.test(c) ? c : undefined);

function ga4Item(i: AnalyticsItem) {
  return {
    item_id: i.id,
    item_name: i.name,
    item_brand: "The Alpha Hood",
    ...(i.category ? { item_category: i.category } : {}),
    ...(i.variant ? { item_variant: i.variant } : {}),
    price: rupeesValue(i.price),
    quantity: i.quantity ?? 1,
    ...(i.listName ? { item_list_name: i.listName } : {}),
    ...(i.index !== undefined ? { index: i.index } : {}),
  };
}

const total = (items: AnalyticsItem[]) => items.reduce((s, i) => s + i.price * (i.quantity ?? 1), 0);

/** GA4 recommended e-commerce parameters (https://developers.google.com/analytics/devguides/collection/ga4/ecommerce). */
export function toGa4<N extends EventName>(name: N, p: EventMap[N]): Record<string, unknown> | null {
  const e = p as EventMap[EventName] & Record<string, unknown>;
  switch (name) {
    case "view_item_list": {
      const x = e as EventMap["view_item_list"];
      return { item_list_name: x.listName, items: x.items.slice(0, 50).map(ga4Item) };
    }
    case "select_item": {
      const x = e as EventMap["select_item"];
      return { item_list_name: x.listName, items: [ga4Item(x.item)] };
    }
    case "view_item":
    case "add_to_wishlist":
    case "add_to_cart": {
      const x = e as EventMap["view_item"];
      return { currency: "INR", value: rupeesValue(x.item.price * (x.item.quantity ?? 1)), items: [ga4Item(x.item)] };
    }
    case "view_cart":
    case "begin_checkout":
    case "add_shipping_info":
    case "add_payment_info": {
      const x = e as EventMap["begin_checkout"] & Partial<EventMap["add_shipping_info"]> & Partial<EventMap["add_payment_info"]>;
      return {
        currency: "INR",
        value: rupeesValue(x.value),
        items: x.items.map(ga4Item),
        ...(safeCode(x.coupon) ? { coupon: safeCode(x.coupon) } : {}),
        ...(x.tier ? { shipping_tier: x.tier } : {}),
        ...(x.paymentType ? { payment_type: x.paymentType } : {}),
      };
    }
    case "purchase": {
      const x = e as EventMap["purchase"];
      return {
        transaction_id: x.orderNumber,
        currency: "INR",
        value: rupeesValue(x.value),
        tax: rupeesValue(x.tax),
        shipping: rupeesValue(x.shipping),
        payment_type: x.paymentType,
        items: x.items.map(ga4Item),
        ...(safeCode(x.coupon) ? { coupon: safeCode(x.coupon) } : {}),
      };
    }
    case "refund": {
      const x = e as EventMap["refund"];
      return { transaction_id: x.orderNumber, currency: "INR", value: rupeesValue(x.value), ...(x.items ? { items: x.items.map(ga4Item) } : {}) };
    }
    case "search": {
      const x = e as EventMap["search"];
      const term = safeSearchTerm(x.query);
      return term ? { search_term: term, results: x.results } : null;
    }
    case "size_guide_open":
      return { item_id: (e as EventMap["size_guide_open"]).productId };
    case "size_selected": {
      const x = e as EventMap["size_selected"];
      return { item_id: x.productId, size: x.size };
    }
    case "pincode_check":
      return { serviceable: (e as EventMap["pincode_check"]).serviceable };
    case "coupon_apply": {
      const x = e as EventMap["coupon_apply"];
      return { coupon: safeCode(x.code.toUpperCase()) ?? "other", success: x.success };
    }
    case "return_request":
      return { reason: (e as EventMap["return_request"]).reason };
    default:
      return {};
  }
}

/** Meta standard events (https://developers.facebook.com/docs/meta-pixel/reference). Others are not sent to Meta. */
const META_NAMES: Partial<Record<EventName, string>> = {
  view_item: "ViewContent",
  add_to_cart: "AddToCart",
  add_to_wishlist: "AddToWishlist",
  begin_checkout: "InitiateCheckout",
  add_payment_info: "AddPaymentInfo",
  purchase: "Purchase",
  search: "Search",
};

export function toMeta<N extends EventName>(name: N, p: EventMap[N]): { name: string; params: Record<string, unknown> } | null {
  const metaName = META_NAMES[name];
  if (!metaName) return null;
  const items: AnalyticsItem[] =
    "items" in p ? (p as { items: AnalyticsItem[] }).items : "item" in p ? [(p as { item: AnalyticsItem }).item] : [];
  if (name === "search") {
    const term = safeSearchTerm((p as EventMap["search"]).query);
    return term ? { name: metaName, params: { search_string: term } } : null;
  }
  const value = "value" in p ? (p as { value: Paise }).value : total(items);
  return {
    name: metaName,
    params: {
      currency: "INR",
      value: rupeesValue(value),
      // Ids are style-level (product.id = item_group_id in the feeds), so Meta matches product groups.
      content_type: "product_group",
      content_ids: items.map((i) => i.id),
      contents: items.map((i) => ({ id: i.id, quantity: i.quantity ?? 1, item_price: rupeesValue(i.price) })),
      num_items: items.reduce((s, i) => s + (i.quantity ?? 1), 0),
      ...(name === "purchase" ? { order_id: (p as EventMap["purchase"]).orderNumber } : {}),
    },
  };
}

/** Same id in the Pixel (eventID) and the Conversions API (event_id), so Meta counts the purchase once. */
export const purchaseEventId = (orderNumber: string) => `purchase.${orderNumber}`;

/** Item ids are the product (style + colour) id, matching `item_group_id` in the Merchant / Meta feeds. */
export function itemFromProduct(p: Pick<Product, "id" | "title" | "category" | "price">, extra: { size?: string; quantity?: number; listName?: string; index?: number } = {}): AnalyticsItem {
  return { id: p.id, name: p.title, category: p.category, price: p.price, variant: extra.size, quantity: extra.quantity, listName: extra.listName, index: extra.index };
}

export function itemFromLine(l: Pick<CartLine, "productId" | "title" | "size" | "quantity" | "price">): AnalyticsItem {
  return { id: l.productId, name: l.title, variant: l.size, quantity: l.quantity, price: l.price };
}
