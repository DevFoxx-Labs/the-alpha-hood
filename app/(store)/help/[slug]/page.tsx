import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContentView } from "@/components/content/content-view";
import { isContentSlug, renderContentPage } from "@/lib/content/pages";

const HELP = ["shipping", "faq"] as const;

export function generateStaticParams() {
  return HELP.map((slug) => ({ slug }));
}

function helpSlug(slug: string) {
  return isContentSlug(slug) && (HELP as readonly string[]).includes(slug) ? slug : null;
}

export async function generateMetadata({ params }: PageProps<"/help/[slug]">): Promise<Metadata> {
  const slug = helpSlug((await params).slug);
  if (!slug) return {};
  const page = renderContentPage(slug);
  return { title: page.title, description: page.description, alternates: { canonical: page.path } };
}

/** CMS-04 help pages (shipping, FAQ). Returns & cancellation live in the Refund & Cancellation Policy. */
export default async function HelpPage({ params }: PageProps<"/help/[slug]">) {
  const slug = helpSlug((await params).slug);
  if (!slug) notFound();
  // MASCOT_PROMPTS #10 "Delivery run" on Shipping; #11 "Thinking" on the FAQ.
  const art = slug === "shipping" ? "alpha-10-delivery-run" : "alpha-11-thinking";
  return <ContentView page={renderContentPage(slug)} crumb={{ label: "Help", href: "/help/faq" }} art={art} />;
}
