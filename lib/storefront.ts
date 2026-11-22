import { cacheLife } from "next/cache";
import { commerce } from "@/lib/commerce";
import type { Category, Product } from "@/lib/commerce/types";
import { cms } from "@/lib/cms";
import { liveBlocks } from "@/lib/cms/schedule";
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
  const [announcements, headerLinks, menu, footer, catalogue] = await Promise.all([
    cms.getAnnouncements(),
    cms.getHeaderLinks(),
    cms.getMenu(),
    cms.getFooter(),
    commerce.listProducts({ limit: 60 }),
  ]);
  // M1 display-only bag needs sizes for in-place size change; M5 replaces this with the server cart.
  const sizesByProduct = Object.fromEntries(catalogue.products.map((p) => [p.id, p.sizes]));
  const upsell = catalogue.products.filter((p) => p.price <= 99_900 && p.sizes.some((s) => s.stock > 0)).slice(0, 3);
  return { announcements, headerLinks, menu, footer, sizesByProduct, upsell };
}

export type ResolvedHomeBlock =
  | { block: Extract<HomeBlock, { type: "category_rail" }>; categories: Category[] }
  | { block: Extract<HomeBlock, { type: "product_tabs" }>; tabs: { id: string; label: string; products: Product[] }[] }
  | { block: Extract<HomeBlock, { type: "product_grid" }>; products: Product[] }
  | { block: Exclude<HomeBlock, { type: "category_rail" | "product_tabs" | "product_grid" }> };

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
        default:
          return { block };
      }
    }),
  );
}
