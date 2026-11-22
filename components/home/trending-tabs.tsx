"use client";

import { ProductCard } from "@/components/store/product-card";
import { SectionHeader } from "@/components/store/section-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Product } from "@/lib/commerce/types";
import { ProductGrid } from "./product-grid";

/**
 * HOME-06: product grid with category tabs. All tabs are server-rendered up front, so switching is
 * instant with no page reload or client fetch; tabs without products are dropped on the server.
 */
export function TrendingTabs({
  title,
  viewAllHref,
  tabs,
}: {
  title: string;
  viewAllHref: string;
  tabs: { id: string; label: string; products: Product[] }[];
}) {
  if (tabs.length === 0) return null;
  return (
    <div>
      <SectionHeader title={title} viewAllHref={viewAllHref} />
      <Tabs defaultValue={tabs[0].id} className="mt-5 lg:mt-6">
        <TabsList aria-label={`${title} categories`}>
          {tabs.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((t) => (
          <TabsContent key={t.id} value={t.id} className="mt-5 lg:mt-7">
            <ProductGrid>
              {t.products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </ProductGrid>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
