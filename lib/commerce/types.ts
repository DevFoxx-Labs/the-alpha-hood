import type { Paise } from "@/lib/format";

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
}

export interface ProductImage {
  /** Real photo URL once available; until then `art` drives a placeholder drawing. */
  url?: string;
  alt: string;
  art: GarmentKind;
  colour: string;
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
}

export interface Category {
  handle: string;
  title: string;
  image: ProductImage;
}

export interface Collection {
  handle: string;
  title: string;
  description?: string;
}

export interface CartLine {
  id: string;
  productId: string;
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
  listProducts(options?: ListOptions): Promise<{ products: Product[]; total: number }>;
  getCollection(
    handle: string,
    options?: ListOptions,
  ): Promise<{ collection: Collection; products: Product[]; total: number } | null>;
  listCategories(): Promise<Category[]>;
  cart: {
    get(cartId: string): Promise<Cart | null>;
    create(): Promise<Cart>;
    addLine(cartId: string, input: { productId: string; size: string; quantity: number }): Promise<Cart>;
    updateLine(cartId: string, lineId: string, input: { quantity?: number; size?: string }): Promise<Cart>;
    removeLine(cartId: string, lineId: string): Promise<Cart>;
  };
  // checkout.* and customer.* are added with milestones M5 / M6.
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
