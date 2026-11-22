import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DynamicMarker } from "@/components/store/dynamic-marker";
import { TextPageSkeleton } from "@/components/content/text-page-skeleton";
import { NoticeView } from "@/components/legal/notice-view";
import { isNoticeSlug, NOTICE_SLUGS, NOTICES, noticeLanguages, renderNotice } from "@/lib/legal";

export function generateStaticParams() {
  return NOTICE_SLUGS.filter((slug) => noticeLanguages(slug).includes("hi")).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/legal/[slug]/hi">): Promise<Metadata> {
  const { slug } = await params;
  if (!isNoticeSlug(slug) || !NOTICES[slug].text.hi) return {};
  return { title: NOTICES[slug].text.hi.title, alternates: { canonical: `/legal/${slug}/hi` } };
}

/** Instant navigation: `params` are URL data, so the text streams inside <Suspense> with a same-width skeleton. */
export default function LegalNoticeHindiPage({ params }: PageProps<"/legal/[slug]/hi">) {
  return (
    <>
      <DynamicMarker />
      <Suspense fallback={<TextPageSkeleton />}>
        <LegalNoticeHindiContent params={params} />
      </Suspense>
    </>
  );
}

/** Hindi version of a notice (DPDP: notice available in Eighth-Schedule languages). */
async function LegalNoticeHindiContent({ params }: Pick<PageProps<"/legal/[slug]/hi">, "params">) {
  const { slug } = await params;
  if (!isNoticeSlug(slug)) notFound();
  const notice = renderNotice(slug, "hi");
  if (!notice) notFound();
  return <NoticeView notice={notice} />;
}
