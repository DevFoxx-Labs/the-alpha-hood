import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Mascot } from "@/components/brand/mascot";
import { OutlineMarquee } from "@/components/brand/outline-marquee";
import { DraftNotice, NoticeSections } from "@/components/legal/notice-view";
import { MASCOT, type MascotName } from "@/lib/brand/mascot";
import { renderContentPage } from "@/lib/content/pages";
import { breadcrumbJsonLd, toJsonLd } from "@/lib/seo/json-ld";
import { siteUrl } from "@/lib/seo/site";

const page = renderContentPage("about");

export const metadata: Metadata = { title: page.title, description: page.description, alternates: { canonical: page.path } };

/** MASCOT_PROMPTS #16–20: one character, every season. Links go to the matching category pages. */
const SEASONS: { name: MascotName; label: string; href: string }[] = [
  { name: "season-16-winter", label: "Winter", href: "/men/jackets" },
  { name: "season-17-linen", label: "Summer linen", href: "/men/shirts" },
  { name: "season-19-denim", label: "Denim", href: "/men/jeans" },
  { name: "season-20-monsoon", label: "Monsoon", href: "/men/jackets" },
  { name: "season-18-festive", label: "Festive", href: "/men" },
];

/**
 * CMS-04 About page with the brand mascot "ALPHA" (MASCOT_PROMPTS §7: About page → #1 hero stance, #22 The Pack).
 * Text comes from lib/content/pages.ts (draft, owner to review); the mascot carries the brand story.
 */
export default function AboutPage() {
  const pack = MASCOT["scene-22-the-pack"];
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toJsonLd(breadcrumbJsonLd([{ name: "Home", url: siteUrl("/") }, { name: page.title, url: siteUrl(page.path) }])) }}
      />

      <section className="on-dark relative isolate overflow-hidden bg-black text-white">
        <OutlineMarquee rows={4} accentRow={2} />
        <div className="relative z-[1] mx-auto grid max-w-[1440px] items-end lg:grid-cols-[1fr_520px]">
          <div className="px-4 pb-10 pt-12 lg:px-[72px] lg:py-24">
            <nav aria-label="Breadcrumb" className="mb-6 text-[12px] text-white/60">
              <Link href="/" className="hover:underline">
                Home
              </Link>{" "}
              / <span className="text-white">About us</span>
            </nav>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-volt lg:text-[12px]">About The Alpha Hood</p>
            <h1 className="mt-3 font-display text-[60px] uppercase leading-[0.86] lg:text-[128px]">
              Built for
              <br />
              the ones
              <br />
              who lead
            </h1>
            <p className="mt-5 max-w-[520px] text-[14px] leading-[1.6] text-white/75 lg:text-[17px]">{page.description}</p>
          </div>
          {/* #1 "Hero stance" — transparent cut-out on black; the page's LCP image. */}
          <Mascot name="alpha-01-hero-stance" priority sizes="(min-width: 1024px) 520px, 70vw" className="mx-auto w-[70%] max-w-[360px] lg:w-full lg:max-w-none" />
        </div>
      </section>

      <article className="mx-auto max-w-[860px] px-4 py-12 lg:px-0 lg:py-16">
        <DraftNotice />
        <NoticeSections sections={page.sections} />
        <p className="mt-6 text-[13px] leading-[1.6] text-ink-2">
          Meet <b className="text-ink">Alpha</b> — our wolf in a black hoodie. He shows up in the moments between the clothes: when
          your bag is empty, when you&apos;re finding your size, and when your order is on its way.
        </p>
      </article>

      <section className="on-dark grid bg-black text-white lg:grid-cols-2" aria-labelledby="pack-h">
        <div className="relative aspect-[4/5] lg:aspect-auto lg:min-h-[620px]" style={pack.bg ? { backgroundColor: pack.bg } : undefined}>
          <Image src={pack.src} alt="Alpha and three wolf friends in streetwear under a city underpass" fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
        </div>
        <div className="flex flex-col justify-center gap-4 px-6 py-12 lg:px-[72px]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-volt">The Pack</p>
          <h2 id="pack-h" className="font-display text-[52px] uppercase leading-[0.88] lg:text-[96px]">
            Different
            <br />
            fits.
            <br />
            One pack.
          </h2>
          <p className="max-w-[440px] text-[14px] leading-[1.6] text-white/75 lg:text-[16px]">
            Puffers, overshirts, varsity jackets and the heavyweight hoodie. Everyone wears it their way.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-4 py-12 lg:px-10 lg:py-16" aria-labelledby="seasons-h">
        <h2 id="seasons-h" className="font-display text-[34px] uppercase leading-none lg:text-[52px]">
          Every season
        </h2>
        <ul className="scrollbar-none -mx-4 mt-6 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 lg:mx-0 lg:mt-8 lg:grid lg:grid-cols-5 lg:gap-4 lg:overflow-visible lg:px-0">
          {SEASONS.map((s) => (
            <li key={s.name} className="w-[46%] shrink-0 snap-start lg:w-auto">
              <Link href={s.href} className="group block">
                <Mascot name={s.name} blend sizes="(min-width: 1024px) 20vw, 46vw" imgClassName="transition-transform duration-[400ms] ease-out group-hover:scale-[1.03] motion-reduce:transition-none" className="overflow-hidden" />
                <span className="mt-2 block text-[12px] font-semibold uppercase tracking-[0.08em]">{s.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
