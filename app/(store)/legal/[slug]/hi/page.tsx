import type { Metadata } from "next";
import { notFound } from "next/navigation";
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

/** Hindi version of a notice (DPDP: notice available in Eighth-Schedule languages). */
export default async function LegalNoticeHindiPage({ params }: PageProps<"/legal/[slug]/hi">) {
  const { slug } = await params;
  if (!isNoticeSlug(slug)) notFound();
  const notice = renderNotice(slug, "hi");
  if (!notice) notFound();
  return <NoticeView notice={notice} />;
}
