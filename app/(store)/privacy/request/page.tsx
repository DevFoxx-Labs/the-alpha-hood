import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PrivacyRequestForm } from "@/components/legal/privacy-request-form";
import { LEGAL_CONFIG } from "@/lib/legal/config";

export const metadata: Metadata = {
  title: "Make a privacy request",
  robots: { index: false, follow: true },
};

export default function PrivacyRequestPage() {
  return (
    <div className="mx-auto max-w-[720px] px-4 py-10 lg:px-0 lg:py-16">
      <nav aria-label="Breadcrumb" className="mb-6 text-[12px] text-ink-2">
        <Link href="/privacy" className="hover:underline">
          Privacy &amp; your data
        </Link>{" "}
        / <span className="text-ink">Make a request</span>
      </nav>
      <h1 className="type-section">Make a privacy request</h1>
      <p className="mt-4 text-[15px] leading-[1.6] text-ink-2">
        Ask for a copy of your data, a correction or deletion, nominate someone, withdraw consent, or raise a complaint.
      </p>
      <div className="mt-8">
        <Suspense fallback={<div className="h-[640px]" aria-hidden="true" />}>
          <PrivacyRequestForm ackHours={LEGAL_CONFIG.acknowledgeWithinHours} resolveDays={LEGAL_CONFIG.resolveWithinDays} />
        </Suspense>
      </div>
    </div>
  );
}
