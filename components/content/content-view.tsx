import Link from "next/link";
import { DraftNotice, NoticeSections } from "@/components/legal/notice-view";
import type { ContentPage } from "@/lib/content/pages";
import { breadcrumbJsonLd, toJsonLd } from "@/lib/seo/json-ld";
import { siteUrl } from "@/lib/seo/site";

/** CMS-04 help / company page: same section renderer as the legal notices. */
export function ContentView({ page, crumb }: { page: ContentPage; crumb?: { label: string; href: string } }) {
  const crumbs = [{ label: "Home", href: "/" }, ...(crumb ? [crumb] : []), { label: page.title, href: page.path }];
  return (
    <article className="mx-auto max-w-[860px] px-4 py-10 lg:px-0 lg:py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd(breadcrumbJsonLd(crumbs.map((c) => ({ name: c.label, url: siteUrl(c.href) })))) }} />
      <nav aria-label="Breadcrumb" className="mb-6 text-[12px] text-ink-2">
        {crumbs.slice(0, -1).map((c) => (
          <span key={c.href}>
            <Link href={c.href} className="hover:underline">
              {c.label}
            </Link>{" "}
            /{" "}
          </span>
        ))}
        <span className="text-ink">{page.title}</span>
      </nav>
      <h1 className="type-section">{page.title}</h1>
      <p className="mt-4 text-[15px] leading-[1.6] text-ink-2">{page.description}</p>
      <div className="mt-10">
        <DraftNotice />
        <NoticeSections sections={page.sections} />
      </div>
    </article>
  );
}
