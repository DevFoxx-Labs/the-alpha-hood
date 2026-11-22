import type { Metadata } from "next";
import { notFound } from "next/navigation";
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

export default async function LegalNoticePage({ params }: PageProps<"/legal/[slug]">) {
  const { slug } = await params;
  if (!isNoticeSlug(slug)) notFound();
  const notice = renderNotice(slug, "en");
  if (!notice) notFound();
  return <NoticeView notice={notice} />;
}
