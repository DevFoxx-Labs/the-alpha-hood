import type { Metadata } from "next";
import Link from "next/link";
import { noticeIndex } from "@/lib/legal";

export const metadata: Metadata = { title: "Legal", alternates: { canonical: "/legal" } };

/** Index of every notice with its version and date (CMS-04). */
export default function LegalIndexPage() {
  const notices = noticeIndex();
  return (
    <div className="mx-auto max-w-[860px] px-4 py-10 lg:px-0 lg:py-16">
      <h1 className="type-section">Legal</h1>
      <ul className="mt-8 divide-y divide-line border-y border-line">
        {notices.map((n) => (
          <li key={n.slug} className="flex flex-wrap items-center justify-between gap-2 py-4">
            <Link href={`/legal/${n.slug}`} className="text-[15px] font-semibold hover:underline">
              {n.title}
            </Link>
            <span className="text-[12px] uppercase tracking-[0.06em] text-ink-2">
              v{n.version}
              {n.languages.includes("hi") ? (
                <>
                  {" · "}
                  <Link href={`/legal/${n.slug}/hi`} lang="hi" className="underline underline-offset-2">
                    हिन्दी
                  </Link>
                </>
              ) : null}
            </span>
          </li>
        ))}
        <li className="py-4">
          <Link href="/grievance" className="text-[15px] font-semibold hover:underline">
            Grievance Officer
          </Link>
        </li>
        <li className="py-4">
          <Link href="/privacy" className="text-[15px] font-semibold hover:underline">
            Privacy &amp; your data
          </Link>
        </li>
      </ul>
    </div>
  );
}
