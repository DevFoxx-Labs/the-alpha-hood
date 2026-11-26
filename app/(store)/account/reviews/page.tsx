import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountReviews } from "@/components/account/routes";

export const metadata: Metadata = { title: "My reviews", robots: { index: false, follow: false } };

/** Account screen — personal data loads on the client from no-store APIs (never prerendered). */
export default function Page() {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-[1280px]" aria-busy="true" />}>
      <AccountReviews />
    </Suspense>
  );
}
