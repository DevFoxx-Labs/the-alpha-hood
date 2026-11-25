import type { CatalogQuery, CatalogResult, CatalogScope, SearchSuggestions } from "@/lib/catalog/types";
import type { Paise } from "@/lib/format";
import type { GstClass } from "@/lib/pricing/gst";

/**
 * Platform-neutral commerce types (PRD §4, §8). The storefront only talks to `CommerceAdapter`,
 * so the backend (headless Shopify or Medusa — decision pending) can be swapped without UI changes.
 */

/** Placeholder garment drawings used until real photography exists (DESIGN.md §5). */
export type GarmentKind =
  | "tee"
  | "oversized"
  | "shirt"
  | "check"
  | "hoodie"
  | "jacket"
  | "puffer"
  | "sweater"
  | "jeans"
  | "baggy"
  | "cargo"
  | "trouser"
  | "sneaker"
  | "shades"
  | "cap"
  | "polo";

export interface Colour {
  name: string;
  hex: string;
  /** Handle of the product page for this colour (each colour is its own URL — PDP-03). */
  handle?: string;
}

export interface ProductImage {
  /** Real photo URL once available; until then `art` drives a placeholder drawing. */
  url?: string;
  alt: string;
  art: GarmentKind;
  colour: string;
  /**
   * Shot type. Drawings: front / back / detail close-up / on model. Photos: staff tag the on-hanger cutouts
   * front / back / side — the collection rail (PLP-08) turns a garment from its side shot to its front shot.
   */
  view?: "front" | "back" | "side" | "detail" | "model";
}

export interface SizeOption {
  label: string;
  /** Units available. 0 = sold out. */
  stock: number;
}

export type ProductBadge = "NEW" | "BESTSELLER";

export interface Product {
  id: string;
  handle: string;
  title: string;
  category: string;
  price: Paise;
  mrp: Paise;
  badge?: ProductBadge;
  rating?: { average: number; count: number };
  colour: Colour;
  colours: Colour[];
  sizes: SizeOption[];
  images: ProductImage[];
  /** Sub-category handle within `category`, e.g. "baggy" in /men/jeans/baggy. */
  subcategory?: string;
  /** Filter attributes (PLP-02); values are slugs from lib/catalog/attributes.ts. */
  attributes: ProductAttributes;
  /** Colour family used by the colour filter (several shades map to one family). */
  colourFamily: string;
  /** ISO date the style went live (sort: new arrivals). */
  createdAt: string;
  /** Platform popularity score (sales + views); default sort (PLP-03). */
  popularity: number;
  /** Search keywords / synonyms beyond the title. */
  tags: string[];
  /** Colour group: every colour of a style shares it (reviews, size chart). */
  styleId: string;
  sku: string;
  description: string;
  /** PDP-07 Specifications (label → value), e.g. Collar: Spread. */
  specs: { label: string; value: string }[];
  sizeChart: SizeChartKind;
  /** e.g. { height: "6'0\"", size: "M" } — shown as the fit note (PDP-03). */
  model?: { height: string; size: string };
  /** Legal Metrology declarations (PDP-07). Never invented: placeholders until the supplier provides them. */
  legal: { manufacturer: string; packer?: string; importer?: string; countryOfOrigin: string; netQuantity: string };
  /** GST class for the rate table (absent = derived from the category). */
  gstClass?: GstClass;
  /** HSN code printed on the tax invoice (4, 6 or 8 digits; absent = the class default). */
  hsn?: string;
  /** Search-engine title / description for this colour's page (absent = derived from the product). */
  seo?: { title?: string; description?: string };
}

export type SizeChartKind = "tops" | "bottoms" | "shoes" | "none";

export interface ProductAttributes {
  fit?: string;
  fabric?: string;
  sleeve?: string;
  pattern?: string;
  occasion?: string;
}

export interface Category {
  handle: string;
  title: string;
  image: ProductImage;
  /** Link override (e.g. the home rail's "Oversized Tees" → /men/t-shirts/oversized). */
  href?: string;
}

/** A category page node (PLP-01) with its sub-category image rail. */
export interface CategoryNode {
  handle: string;
  title: string;
  image: ProductImage;
  subcategories: { handle: string; title: string; image: ProductImage }[];
}

export interface Collection {
  handle: string;
  title: string;
  description?: string;
}

export interface CartLine {
  id: string;
  productId: string;
  /** Product page handle (link back from the bag). */
  handle?: string;
  title: string;
  colour: string;
  size: string;
  quantity: number;
  price: Paise;
  mrp: Paise;
  image: ProductImage;
}

export interface Cart {
  id: string;
  lines: CartLine[];
  /** Sum of line price × quantity. */
  subtotal: Paise;
  /** Sum of line MRP × quantity. */
  totalMrp: Paise;
  itemCount: number;
  /** Coupon code the shopper applied (re-evaluated on every read). */
  couponCode?: string | null;
}

export interface ListOptions {
  category?: string;
  /** `featured` = platform default order; `newest` = most recently added first. Sold-out always last. */
  sort?: "featured" | "newest";
  limit?: number;
  offset?: number;
}

export interface CommerceAdapter {
  readonly name: string;
  getProduct(handle: string): Promise<Product | null>;
  getProductById(id: string): Promise<Product | null>;
  listProducts(options?: ListOptions): Promise<{ products: Product[]; total: number }>;
  getCollection(handle: string): Promise<Collection | null>;
  /** Featured categories for the homepage rail (HOME-02). */
  listCategories(): Promise<Category[]>;
  /** Every category page with its sub-categories (PLP-01). */
  listCategoryTree(): Promise<CategoryNode[]>;
  getCategory(handle: string): Promise<CategoryNode | null>;
  listCollections(): Promise<Collection[]>;
  /** PLP / search results: scope + filters + sort + page, with facet counts (PLP-02…04, SRCH-02). */
  searchCatalog(scope: CatalogScope, query: CatalogQuery): Promise<CatalogResult>;
  /** Instant search suggestions (SRCH-01). */
  suggest(q: string, limit?: number): Promise<SearchSuggestions>;
  cart: {
    get(cartId: string): Promise<Cart | null>;
    create(): Promise<Cart>;
    addLine(cartId: string, input: { productId: string; size: string; quantity: number }): Promise<Cart>;
    updateLine(cartId: string, lineId: string, input: { quantity?: number; size?: string }): Promise<Cart>;
    removeLine(cartId: string, lineId: string): Promise<Cart>;
    setCoupon(cartId: string, code: string | null): Promise<Cart>;
    /** CART-05: re-copy price/MRP from the catalogue and clamp quantity to what's available. */
    refreshLine(cartId: string, lineId: string, input: { quantity: number }): Promise<Cart>;
    /** Empties the cart after an order is placed. */
    clear(cartId: string): Promise<void>;
  };
  /** Stock with reservations (ADM-02: held for 15 minutes during checkout). */
  inventory: {
    /** Units available to sell now (stock − active reservations − sold). */
    available(productId: string, size: string, now?: Date): Promise<number>;
    /** All-or-nothing reservation; throws CommerceError("out_of_stock") if any line can't be held. */
    reserve(reference: string, items: { productId: string; size: string; quantity: number }[], ttlMs: number, now?: Date): Promise<void>;
    /** Converts a reservation into a sale. Idempotent. */
    commit(reference: string): Promise<void>;
    /** Releases a reservation (payment failed / expired / cancelled). Idempotent. */
    release(reference: string): Promise<void>;
    /** True if the reservation exists and has not expired or been released. */
    isHeld(reference: string, now?: Date): Promise<boolean>;
    /** Puts sold units back (cancellation, return after QC). Idempotent per reference. */
    restock(reference: string, items: { productId: string; size: string; quantity: number }[]): Promise<void>;
    /** ADM-02 manual stock correction (warehouse count); result never below zero. Returns the new on-hand. */
    adjust(productId: string, size: string, delta: number): Promise<number>;
    /** ADM-02 per-SKU view: on hand (stock − sold), held by checkouts/exchanges, available. */
    snapshot(now?: Date): Promise<{ productId: string; size: string; onHand: number; held: number; available: number }[]>;
  };
}

export class CommerceError extends Error {
  constructor(
    public readonly code: "not_found" | "invalid_input" | "out_of_stock" | "limit_exceeded",
    message: string,
  ) {
    super(message);
    this.name = "CommerceError";
  }
}
