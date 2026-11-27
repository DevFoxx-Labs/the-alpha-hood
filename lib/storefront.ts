import { cacheLife, cacheTag } from "next/cache";
import { CATALOG_TAG } from "@/lib/catalog/cache-tag";
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
import { applyHomepage, landingLayout } from "@/lib/cms/homepage";
import { MOCK_DROP_HOMEPAGE } from "@/lib/cms/mock-home";
import { storedCatalogDocs } from "@/lib/cms/stored";
import { dropNavigation } from "@/lib/cms/drop-nav";
import { shopAllCategories } from "@/lib/catalog/taxonomy";

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
  cacheTag(CATALOG_TAG);
  if (!storefrontAvailable()) return null;
  const [announcements, headerLinks, menu, footer, trendingSearches, catalogue] = await Promise.all([
    cms.getAnnouncements(),
    cms.getHeaderLinks(),
    cms.getMenu(),
    cms.getFooter(),
    cms.getTrendingSearches(),
    commerce.listProducts({ limit: 60 }),
  ]);
  // "Exclusive drop" layout: header links, menu and the footer's Shop column offer only the drop's pieces.
  const docs = await storedCatalogDocs();
  if (landingLayout(docs?.homepage) === "drop") {
    const home = (await getHomePage()) ?? [];
    const pieces = home.flatMap((r) => (r.block.type === "product_spotlight" && "initial" in r && r.products.length ? [{ title: r.block.title, product: r.products[r.initial] ?? r.products[0] }] : []));
    const nav = dropNavigation(pieces, { menu, footer });
    // Mini-cart add-ons: the drop's other pieces only.
    const upsell = pieces.map((p) => p.product).filter((p) => p.sizes.some((s) => s.stock > 0)).slice(0, 3);
    return { announcements, headerLinks: nav.headerLinks, menu: nav.menu, footer: nav.footer, trendingSearches, upsell };
  }
  // Mini-cart "complete your fit" row: in-stock add-ons at ₹999 or less.
  const upsell = catalogue.products.filter((p) => p.price <= 99_900 && p.sizes.some((s) => s.stock > 0)).slice(0, 3);
  return { announcements, headerLinks, menu, footer, trendingSearches, upsell };
}

export type ResolvedHomeBlock =
  | { block: Extract<HomeBlock, { type: "category_rail" }>; categories: Category[] }
  | { block: Extract<HomeBlock, { type: "product_tabs" }>; tabs: { id: string; label: string; products: Product[] }[] }
  | { block: Extract<HomeBlock, { type: "product_grid" }>; products: Product[] }
  | { block: Extract<HomeBlock, { type: "ambassador" }>; products: Product[] }
  | { block: Extract<HomeBlock, { type: "limited_edition" }>; products: Product[] }
  /** Every colour of the style (the picked colour first in its own place); empty = nothing to show. */
  | { block: Extract<HomeBlock, { type: "product_spotlight" }>; products: Product[]; initial: number }
  | { block: Extract<HomeBlock, { type: "shop_the_look" }>; look: Look | null; products: Product[] }
  | { block: Exclude<HomeBlock, { type: "category_rail" | "product_tabs" | "product_grid" | "shop_the_look" | "ambassador" | "limited_edition" | "product_spotlight" }> };

export async function getHomePage(): Promise<ResolvedHomeBlock[] | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag(CATALOG_TAG);
  if (!storefrontAvailable()) return null;

  // Admin → Homepage content (hero, campaign band, SEO block) replaces the built-in parts it covers.
  // Landing page layout (Admin → Homepage): the full store, or the "Exclusive drop" page for a few signed pieces.
  const [storeBlocks, docs] = await Promise.all([cms.getHomepage(), storedCatalogDocs()]);
  const layout = landingLayout(docs?.homepage);
  const builtIn = layout === "drop" ? MOCK_DROP_HOMEPAGE : storeBlocks;
  const blocks = liveBlocks(applyHomepage(builtIn, docs?.homepage, layout), new Date());
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
        case "product_spotlight": {
          let main = block.productId ? await commerce.getProductById(block.productId) : null;
          // Built-in DEMO (no product picked): the style with the most colours in its category, black first.
          if (!main && block.demoCategory) {
            const inCat = (await commerce.listProducts({ category: block.demoCategory, limit: 60 })).products;
            main = [...inCat].sort((a, b) => b.colours.length - a.colours.length || Number(/black/i.test(b.colour.name)) - Number(/black/i.test(a.colour.name)))[0] ?? null;
          }
          if (!main) return { block, products: [], initial: 0 };
          const handles = main.colours.map((c) => c.handle).filter((h): h is string => !!h);
          const variants = handles.length ? (await Promise.all(handles.map((h) => (h === main!.handle ? main : commerce.getProduct(h))))).filter((p): p is Product => !!p) : [main];
          const list = variants.length ? variants : [main];
          return { block, products: list, initial: Math.max(0, list.findIndex((p) => p.id === main!.id)) };
        }
        case "ambassador":
        case "limited_edition": {
          const max = block.type === "ambassador" ? 4 : 3;
          // Admin's picks, in their order; picks that are gone / archived drop out.
          let products = (await Promise.all(block.productIds.map((id) => commerce.getProductById(id)))).filter((p): p is Product => !!p);
          // Built-in DEMO block (no admin content yet): show the priciest pieces so the layout can be seen in development.
          const customised = block.type === "ambassador" ? !!docs?.homepage?.ambassador : !!docs?.homepage?.limited;
          if (!customised && products.length === 0) {
            products = (await commerce.listProducts({ limit: 60 })).products.sort((a, b) => b.price - a.price).slice(block.type === "ambassador" ? 0 : 4, (block.type === "ambassador" ? 0 : 4) + max);
          }
          return block.type === "ambassador" ? { block, products: products.slice(0, max) } : { block, products: products.slice(0, max) };
        }
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
  cacheTag(CATALOG_TAG);
  if (!storefrontAvailable()) return null;
  return commerce.getCategory(handle);
}

export async function getCollectionInfo(handle: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag(CATALOG_TAG);
  if (!storefrontAvailable()) return null;
  return commerce.getCollection(handle);
}

export async function getCategoryTree() {
  "use cache";
  cacheLife("minutes");
  cacheTag(CATALOG_TAG);
  if (!storefrontAvailable()) return null;
  return commerce.listCategoryTree();
}

/** The categories the "Shop all" page shows: chosen in Admin → Categories (in that order), else all of them. */
export async function getShopAllCategories() {
  "use cache";
  cacheLife("minutes");
  cacheTag(CATALOG_TAG);
  if (!storefrontAvailable()) return null;
  const [tree, docs] = await Promise.all([commerce.listCategoryTree(), storedCatalogDocs()]);
  return shopAllCategories(tree, docs?.shopAll);
}

/** Scope + parsed URL query → products, totals and facets. Cached per canonical query. */
export async function getListing(scope: CatalogScope, query: CatalogQuery) {
  "use cache";
  cacheLife("minutes");
  cacheTag(CATALOG_TAG);
  if (!storefrontAvailable()) return null;
  return commerce.searchCatalog(scope, query);
}

export async function getListingTile() {
  "use cache";
  cacheLife("minutes");
  cacheTag(CATALOG_TAG);
  if (!storefrontAvailable()) return null;
  const tile = await cms.getListingTile();
  return tile && isLive(tile, new Date()) ? tile : null;
}

/** PLP-06 suggestions. */
export async function getBestsellers(limit = 4) {
  "use cache";
  cacheLife("minutes");
  cacheTag(CATALOG_TAG);
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
  cacheTag(CATALOG_TAG);
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
  // "Exclusive drop" layout: a few signed pieces, so no cross-selling the rest of the catalogue — no Complete the
  // look / You may also like / Shop the look rails and no Recently viewed (the page reads `drop`).
  const drop = landingLayout((await storedCatalogDocs())?.homepage) === "drop";
  if (drop) return { product, category, reviewData, firstPage, coupon, completeLook: [], similar: [], look: null, drop };
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
    drop,
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
  cacheTag(CATALOG_TAG);
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
  cacheTag(CATALOG_TAG);
  if (!storefrontAvailable()) return null;
  const [products, tree, collections] = await Promise.all([getAllProducts(), commerce.listCategoryTree(), commerce.listCollections()]);
  return { products, tree, collections };
}
