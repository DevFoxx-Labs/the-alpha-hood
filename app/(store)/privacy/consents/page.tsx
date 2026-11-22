import type { Metadata } from "next";
import Link from "next/link";
import { ConsentsView } from "@/components/consent/consents-view";

export const metadata: Metadata = {
  title: "Your consents",
  robots: { index: false, follow: true },
};

export default function ConsentsPage() {
  return (
    <div className="mx-auto max-w-[860px] px-4 py-10 lg:px-0 lg:py-16">
      <nav aria-label="Breadcrumb" className="mb-6 text-[12px] text-ink-2">
        <Link href="/privacy" className="hover:underline">
          Privacy &amp; your data
        </Link>{" "}
        / <span className="text-ink">Your consents</span>
      </nav>
      <h1 className="type-section">Your consents</h1>
      <p className="mt-4 text-[15px] leading-[1.6] text-ink-2">
        What you have agreed to, when, and under which version of our notices. Switching something off takes effect
        immediately.
      </p>
      <div className="mt-10">
        <ConsentsView />
      </div>
    </div>
  );
}
