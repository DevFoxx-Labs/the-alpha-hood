import type { Metadata } from "next";
import { Suspense } from "react";
import { OrderConfirmation } from "@/components/checkout/order-confirmation";

export const metadata: Metadata = { title: "Order", robots: { index: false, follow: false } };

/** CHK-09 confirmation — loaded on the client from /api/orders/{number} (owner-only, no-store). */
export default function OrderPage() {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-[720px]" aria-busy="true" />}>
      <OrderConfirmation />
    </Suspense>
  );
}
