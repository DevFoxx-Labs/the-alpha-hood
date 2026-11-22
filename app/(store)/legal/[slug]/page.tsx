import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DynamicMarker } from "@/components/store/dynamic-marker";
import { TextPageSkeleton } from "@/components/content/text-page-skeleton";
import { NoticeView } from "@/components/legal/notice-view";
import { isNoticeSlug, NOTICE_SLUGS, NOTICES, renderNotice } from "@/lib/legal";

export function generateStaticParams() {
  return NOTICE_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/legal/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  if (!isNoticeSlug(slug)) return {};
  return { title: NOTICES[slug].text.en.title, alternates: { canonical: `/legal/${slug}` } };
}

/** Instant navigation: `params` are URL data, so the text streams inside <Suspense> with a same-width skeleton. */
export default function LegalNoticePage({ params }: PageProps<"/legal/[slug]">) {
  return (
    <>
      <DynamicMarker />
      <Suspense fallback={<TextPageSkeleton />}>
        <LegalNoticeContent params={params} />
      </Suspense>
    </>
  );
}

async function LegalNoticeContent({ params }: Pick<PageProps<"/legal/[slug]">, "params">) {
  const { slug } = await params;
  if (!isNoticeSlug(slug)) notFound();
  const notice = renderNotice(slug, "en");
  if (!notice) notFound();
  return <NoticeView notice={notice} />;
}
