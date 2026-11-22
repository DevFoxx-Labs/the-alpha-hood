import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DevOrders } from "@/components/account/dev-orders";
import { devPagesEnabled } from "@/lib/dev-tools";

export const metadata: Metadata = { title: "Dev · orders", robots: { index: false, follow: false } };

/** DEV TOOL: move orders/returns through courier & warehouse steps locally (404 on the live store). */
export default function DevOrdersPage() {
  if (!devPagesEnabled()) notFound();
  return (
    <main className="mx-auto max-w-[1100px] px-4 py-10">
      <h1 className="type-section">Dev · orders &amp; returns</h1>
      <p className="mb-6 mt-2 text-[13px] text-ink-2">
        Stands in for courier webhooks and the warehouse until the admin panel (M7). Development / protected previews only.
      </p>
      <DevOrders />
    </main>
  );
}
