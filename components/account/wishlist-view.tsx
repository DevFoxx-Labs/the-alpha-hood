"use client";

import { Mascot } from "@/components/brand/mascot";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ProductGrid } from "@/components/home/product-grid";
import { ProductCard } from "@/components/store/product-card";
import { useStoreUI } from "@/components/store/store-ui-provider";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Product } from "@/lib/commerce/types";

/** ACC-02 wishlist (kept on this device; account sync is a later item — docs/known-gaps.md). */
export function WishlistView() {
  const { wishlist } = useStoreUI();
  const ids = [...wishlist].sort().join(",");
  const [products, setProducts] = useState<Product[] | null>(null);

  useEffect(() => {
    if (!ids) return;
    let cancelled = false;
    fetch(`/api/products/by-ids?ids=${encodeURIComponent(ids)}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ products: Product[] }>) : { products: [] }))
      .then((d) => !cancelled && setProducts(d.products))
      .catch(() => !cancelled && setProducts([]));
    return () => {
      cancelled = true;
    };
  }, [ids]);

  if (!ids) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <Mascot name="alpha-13-sleeping" sizes="(min-width: 1024px) 360px, 280px" className="w-[280px] lg:w-[360px]" />
        <p className="font-display text-[28px] uppercase leading-none">Nothing saved yet</p>
        <p className="type-body">Tap the heart on anything you like to save it here.</p>
        <Button asChild>
          <Link href="/collections/new-in">Shop new in</Link>
        </Button>
      </div>
    );
  }
  if (!products) {
    return (
      <ProductGrid>
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="aspect-[3/4] w-full" />
        ))}
      </ProductGrid>
    );
  }
  const visible = products.filter((p) => wishlist.has(p.id));
  return (
    <ProductGrid>
      {visible.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </ProductGrid>
  );
}
