import type { Metadata } from "next";
import { BagView } from "@/components/bag/bag-view";

export const metadata: Metadata = { title: "Your bag", robots: { index: false, follow: false } };

/** CART-01/02 — the bag is per-browser (HttpOnly cookie), so it renders on the client from /api/cart. */
export default function BagPage() {
  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6 lg:px-10 lg:py-10">
      <h1 className="type-section mb-5 lg:mb-8">Your bag</h1>
      <BagView />
    </div>
  );
}
