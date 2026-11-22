import type { MetadataRoute } from "next";
import { contentPageList } from "@/lib/content/pages";
import { noticeIndex } from "@/lib/legal";
import { siteUrl } from "@/lib/seo/site";
import { getSitemapData } from "@/lib/storefront";

/**
 * CMS-03 XML sitemap: home, category / sub-category / collection pages, every product, help and legal pages.
 * Only canonical, indexable URLs — no filters, sorts, search, account, checkout or admin.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const fixed: MetadataRoute.Sitemap = [
    ...contentPageList().map((p) => ({ url: siteUrl(p.path), lastModified: p.lastUpdated, changeFrequency: "monthly" as const, priority: 0.3 })),
    { url: siteUrl("/help/size-guide"), changeFrequency: "monthly", priority: 0.3 },
    { url: siteUrl("/legal"), changeFrequency: "yearly", priority: 0.1 },
    ...noticeIndex().flatMap((n) => [
      { url: siteUrl(`/legal/${n.slug}`), lastModified: n.lastUpdated, changeFrequency: "yearly" as const, priority: 0.1 },
      ...n.languages.filter((l) => l !== "en").map((l) => ({ url: siteUrl(`/legal/${n.slug}/${l}`), lastModified: n.lastUpdated, changeFrequency: "yearly" as const, priority: 0.1 })),
    ]),
    { url: siteUrl("/grievance"), changeFrequency: "yearly", priority: 0.1 },
  ];
  const data = await getSitemapData();
  if (!data) return fixed;
  const { products, tree, collections } = data;
  return [
    { url: siteUrl("/"), changeFrequency: "daily", priority: 1 },
    { url: siteUrl("/men"), changeFrequency: "daily", priority: 0.9 },
    ...tree.flatMap((c) => [
      { url: siteUrl(`/men/${c.handle}`), changeFrequency: "daily" as const, priority: 0.8 },
      ...c.subcategories.map((s) => ({ url: siteUrl(`/men/${c.handle}/${s.handle}`), changeFrequency: "daily" as const, priority: 0.7 })),
    ]),
    ...collections.map((c) => ({ url: siteUrl(`/collections/${c.handle}`), changeFrequency: "daily" as const, priority: 0.7 })),
    ...products.map((p) => ({
      url: siteUrl(`/products/${p.handle}`),
      changeFrequency: "weekly" as const,
      priority: 0.6,
      ...(p.images.some((i) => i.url) ? { images: p.images.filter((i) => i.url).map((i) => new URL(i.url!, siteUrl("/")).toString()) } : {}),
    })),
    ...fixed,
  ];
}
