import type { Metadata } from "next";
import { WishlistView } from "@/components/account/wishlist-view";

export const metadata: Metadata = { title: "Wishlist", robots: { index: false, follow: false } };

export default function WishlistPage() {
  return (
    <div className="mx-auto max-w-[1440px] px-2.5 py-6 lg:px-10 lg:py-10">
      <h1 className="type-section mb-5 px-1.5 lg:mb-8 lg:px-0">Wishlist</h1>
      <WishlistView />
    </div>
  );
}
