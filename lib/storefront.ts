import { cacheLife } from "next/cache";
import { commerce } from "@/lib/commerce";
import type { Category, Product } from "@/lib/commerce/types";
import { cms } from "@/lib/cms";
import { findLook, type Look } from "@/lib/promotions/looks";
import { completeTheLook, lookFor, similarProducts } from "@/lib/recommend/service";
import { bestCouponFor, DEMO_COUPONS } from "@/lib/promotions/coupons";
import { reviews } from "@/lib/reviews";
import { isLive, liveBlocks } from "@/lib/cms/schedule";
import type { CatalogQuery, CatalogScope } from "@/lib/catalog/types";
import type { HomeBlock } from "@/lib/cms/types";

/**
 * Server-side data loaders for store pages. Cached for minutes (CDN/ISR-friendly, PRD §7); CMS schedules
 * (CMS-02) are evaluated inside the cache, so a scheduled block appears within one cache lifetime.
 *
 * When commerce or CMS is not configured (production before the platform decision), loaders return null
 * and pages fall back to a holding state instead of serving demo data.
 */
export function storefrontAvailable(): boolean {
  return commerce.name !== "disabled" && cms.name !== "disabled";
}

export async function getShell() {
  "use cache";
  cacheLife("minutes");
  if (!storefrontAvailable()) return null;
  const [announcements, headerLinks, menu, footer, trendingSearches, catalogue] = await Promise.all([
    cms.getAnnouncements(),
    cms.getHeaderLinks(),
    cms.getMenu(),
    cms.getFooter(),
    cms.getTrendingSearches(),
    commerce.listProducts({ limit: 60 }),
  ]);
  // Mini-cart "complete your fit" row: in-stock add-ons at ₹999 or less.
  const upsell = catalogue.products.filter((p) => p.price <= 99_900 && p.sizes.some((s) => s.stock > 0)).slice(0, 3);
  return { announcements, headerLinks, menu, footer, trendingSearches, upsell };
}

export type ResolvedHomeBlock =
  | { block: Extract<HomeBlock, { type: "category_rail" }>; categories: Category[] }
  | { block: Extract<HomeBlock, { type: "product_tabs" }>; tabs: { id: string; label: string; products: Product[] }[] }
  | { block: Extract<HomeBlock, { type: "product_grid" }>; products: Product[] }
  | { block: Extract<HomeBlock, { type: "shop_the_look" }>; look: Look | null; products: Product[] }
  | { block: Exclude<HomeBlock, { type: "category_rail" | "product_tabs" | "product_grid" | "shop_the_look" }> };

export async function getHomePage(): Promise<ResolvedHomeBlock[] | null> {
  "use cache";
  cacheLife("minutes");
  if (!storefrontAvailable()) return null;

  const blocks = liveBlocks(await cms.getHomepage(), new Date());
  return Promise.all(
    blocks.map(async (block): Promise<ResolvedHomeBlock> => {
      switch (block.type) {
        case "category_rail":
          return { block, categories: await commerce.listCategories() };
        case "product_tabs": {
          const tabs = await Promise.all(
            block.tabs.map(async (t) => ({
              id: t.category ?? "all",
              label: t.label,
              products: (await commerce.listProducts({ category: t.category, limit: block.perTab })).products,
            })),
          );
          return { block, tabs: tabs.filter((t) => t.products.length > 0) };
        }
        case "product_grid":
          return { block, products: (await commerce.listProducts({ sort: block.sort, limit: block.limit })).products };
        case "shop_the_look": {
          const look = findLook(block.lookId);
          const products = look ? (await Promise.all(look.productIds.map((id) => commerce.getProductById(id)))).filter((p): p is Product => !!p) : [];
          return { block, look: look && products.length === look.productIds.length ? look : null, products };
        }
        default:
          return { block };
      }
    }),
  );
}

// ── Listing pages (M3) ────────────────────────────────────────────────────────────────────────────

export async function getCategoryNode(handle: string) {
  "use cache";
  cacheLife("minutes");
  if (!storefrontAvailable()) return null;
  return commerce.getCategory(handle);
}

export async function getCollectionInfo(handle: string) {
  "use cache";
  cacheLife("minutes");
  if (!storefrontAvailable()) return null;
  return commerce.getCollection(handle);
}

export async function getCategoryTree() {
  "use cache";
  cacheLife("minutes");
  if (!storefrontAvailable()) return null;
  return commerce.listCategoryTree();
}

/** Scope + parsed URL query → products, totals and facets. Cached per canonical query. */
export async function getListing(scope: CatalogScope, query: CatalogQuery) {
  "use cache";
  cacheLife("minutes");
  if (!storefrontAvailable()) return null;
  return commerce.searchCatalog(scope, query);
}

export async function getListingTile() {
  "use cache";
  cacheLife("minutes");
  if (!storefrontAvailable()) return null;
  const tile = await cms.getListingTile();
  return tile && isLive(tile, new Date()) ? tile : null;
}

/** PLP-06 suggestions. */
export async function getBestsellers(limit = 4) {
  "use cache";
  cacheLife("minutes");
  if (!storefrontAvailable()) return [];
  return (await commerce.listProducts({ limit })).products;
}

/**
 * Build-time params. Cache Components requires at least one entry, so without a backend a placeholder
 * is returned (its page renders the holding state).
 */
export async function categoryParams(): Promise<{ category: string }[]> {
  const tree = storefrontAvailable() ? await commerce.listCategoryTree() : [];
  return tree.length ? tree.map((c) => ({ category: c.handle })) : [{ category: "all" }];
}

export async function subcategoryParams(): Promise<{ category: string; sub: string }[]> {
  const tree = storefrontAvailable() ? await commerce.listCategoryTree() : [];
  const out = tree.flatMap((c) => c.subcategories.map((s) => ({ category: c.handle, sub: s.handle })));
  return out.length ? out : [{ category: "all", sub: "all" }];
}

export async function collectionParams(): Promise<{ handle: string }[]> {
  const list = storefrontAvailable() ? await commerce.listCollections() : [];
  return list.length ? list.map((c) => ({ handle: c.handle })) : [{ handle: "all" }];
}

// ── Product page (M4) ─────────────────────────────────────────────────────────────────────────────

export async function getProductPage(handle: string) {
  "use cache";
  cacheLife("minutes");
  if (!storefrontAvailable()) return null;
  const product = await commerce.getProduct(handle);
  if (!product) return null;
  const [category, reviewData] = await Promise.all([
    commerce.getCategory(product.category),
    reviews.summary(product.styleId, product.category),
  ]);
  const firstPage = reviewData
    ? await reviews.list(
        reviewData.scope === "style" ? { styleId: product.styleId } : { category: product.category },
        { sort: "recent", page: 1 },
      )
    : null;
  // Coupon liveness depends on the time — evaluated inside the cache scope (PDP-02).
  const best = bestCouponFor(product.price, DEMO_COUPONS, new Date());
  const coupon = best ? { code: best.coupon.code, description: best.coupon.description, finalPrice: best.finalPrice } : null;
  // PDP-09 rails (rule-based, from the cached catalogue).
  const all = await getAllProducts();
  const look = lookFor(product.id);
  return {
    product,
    category,
    reviewData,
    firstPage,
    coupon,
    completeLook: completeTheLook(product, all),
    similar: similarProducts(product, all),
    look: look ? { id: look.id, title: look.title, percent: look.percent } : null,
  };
}

export async function productParams(): Promise<{ handle: string }[]> {
  if (!storefrontAvailable()) return [{ handle: "placeholder" }];
  const [a, b] = await Promise.all([commerce.listProducts({ limit: 60 }), commerce.listProducts({ limit: 60, offset: 60 })]);
  const all = [...a.products, ...b.products].map((p) => ({ handle: p.handle }));
  return all.length ? all : [{ handle: "placeholder" }];
}

// ── SEO & feeds (M8) ──────────────────────────────────────────────────────────────────────────────

/** Every product, paging through the adapter (sitemap + Merchant / Meta feeds). Capped as a safety net. */
export async function getAllProducts(max = 5000): Promise<Product[]> {
  "use cache";
  cacheLife("minutes");
  if (!storefrontAvailable()) return [];
  const out: Product[] = [];
  for (let offset = 0; offset < max; offset += 60) {
    const { products, total } = await commerce.listProducts({ limit: 60, offset });
    out.push(...products);
    if (products.length === 0 || out.length >= total) break;
  }
  return out;
}

export async function getSitemapData() {
  "use cache";
  cacheLife("hours");
  if (!storefrontAvailable()) return null;
  const [products, tree, collections] = await Promise.all([getAllProducts(), commerce.listCategoryTree(), commerce.listCollections()]);
  return { products, tree, collections };
}
