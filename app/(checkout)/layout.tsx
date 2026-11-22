import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CookiePreferencesButton } from "@/components/consent/cookie-banner";
import { CheckoutHeader } from "@/components/checkout/checkout-header";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Checkout shell (CHK-01): no menu, no promos — only what's needed to pay, plus the legal links. */
export default function CheckoutLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col bg-checkout">
      <Suspense fallback={<div className="h-14 border-b border-line bg-white lg:h-16" aria-hidden="true" />}>
        <CheckoutHeader />
      </Suspense>
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="border-t border-line bg-white">
        <nav aria-label="Legal" className="mx-auto flex max-w-[1280px] flex-wrap gap-x-5 gap-y-2 px-4 py-4 text-[12px] text-ink-2 lg:px-10">
          <Link href="/legal/terms" className="hover:text-ink">Terms</Link>
          <Link href="/legal/privacy" className="hover:text-ink">Privacy</Link>
          <Link href="/legal/refund-cancellation" className="hover:text-ink">Refunds &amp; cancellation</Link>
          <Link href="/grievance" className="hover:text-ink">Grievance officer</Link>
          <CookiePreferencesButton className="hover:text-ink" />
        </nav>
      </footer>
    </div>
  );
}
