import type { Metadata } from "next";
import { Suspense } from "react";
import { DemoPay } from "@/components/checkout/demo-pay";

export const metadata: Metadata = { title: "Payment", robots: { index: false, follow: false } };

/** Demo gateway page (dev / protected preview only — its API is 404 on the live store). */
export default function DemoPayPage() {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-[720px]" aria-busy="true" />}>
      <DemoPay />
    </Suspense>
  );
}
