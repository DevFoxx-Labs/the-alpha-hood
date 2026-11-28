import { Facebook01Icon, InstagramIcon, NewTwitterIcon, YoutubeIcon } from "@hugeicons/core-free-icons";
import { Mascot } from "@/components/brand/mascot";
import { cacheLife } from "next/cache";
import Link from "next/link";
import { CookiePreferencesButton } from "@/components/consent/cookie-banner";
import { Icon } from "@/components/ui/icon";
import type { FooterContent } from "@/lib/cms/types";
import { LEGAL_CONFIG, isPlaceholder } from "@/lib/legal/config";
import { Logo } from "./logo";
import { NewsletterForm } from "./newsletter-form";

const SOCIAL_ICONS = { Instagram: InstagramIcon, YouTube: YoutubeIcon, Facebook: Facebook01Icon, X: NewTwitterIcon } as const;

/** Legal links required on every page (DPDP rule §1/§4, CMS-04). Always rendered, even without the CMS. */
const LEGAL_LINKS = [
  { label: "Privacy", href: "/legal/privacy" },
  { label: "Terms", href: "/legal/terms" },
  { label: "Refunds & cancellation", href: "/legal/refund-cancellation" },
  { label: "Cookie policy", href: "/legal/cookies" },
  { label: "Grievance officer", href: "/grievance" },
  { label: "Your consents", href: "/privacy/consents" },
];

async function copyrightYear() {
  "use cache";
  cacheLife("days");
  return new Date().getFullYear();
}

const linkCls = "text-[13px] text-white/70 transition-colors hover:text-white";

/**
 * GLB-05 footer (black). `content` comes from the CMS; when the CMS is unavailable only the legal row
 * renders, so the legal pages keep working.
 */
export async function SiteFooter({ content }: { content: FooterContent | null }) {
  const year = await copyrightYear();
  const owner = isPlaceholder(LEGAL_CONFIG.entityName) ? "The Alpha Hood" : LEGAL_CONFIG.entityName;

  return (
    <footer className="on-dark bg-black text-white">
      {content ? (
        <div className="mx-auto grid max-w-[1440px] grid-cols-2 gap-x-6 gap-y-10 px-4 pb-10 pt-12 lg:grid-cols-[1.3fr_0.8fr_0.8fr_0.8fr_1.6fr] lg:gap-10 lg:px-10 lg:pt-16">
          <div className="col-span-2 lg:col-span-1">
            <Logo tone="light" lazy />
            <p className="mt-4 max-w-[300px] text-[14px] leading-[1.6] text-white/70">{content.blurb}</p>
          </div>
          {content.columns.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h2 className="type-label text-white">{col.title}</h2>
              <ul className="mt-4 flex flex-col gap-2.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    {/* No prefetch: ~20 footer links each fetched a route shell on every page view, taking
                        bandwidth from images. Rarely-used links load on click (web-performance rule). */}
                    <Link href={l.href} prefetch={false} className={linkCls}>
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
          <div className="col-span-2 lg:col-span-1">
            <div className="flex items-end gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="type-label text-white">{content.newsletter.heading}</h2>
                <p className="mb-4 mt-3 text-[13px] leading-[1.6] text-white/70">{content.newsletter.text}</p>
              </div>
              {/* MASCOT_PROMPTS #4 "Pointing at you" — newsletter CTA (transparent cut-out on black). */}
              <Mascot name="alpha-04-pointing" sizes="96px" className="-mb-2 w-[72px] shrink-0 lg:w-[88px]" />
            </div>
            <NewsletterForm />
            {content.social.length > 0 ? (
              <ul className="mt-6 flex gap-2">
                {content.social.map((s) => (
                  <li key={s.label}>
                    <a
                      href={s.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${s.label} (opens in a new tab)`}
                      className="grid size-10 place-items-center border border-white/30 transition-colors hover:border-white"
                    >
                      <Icon icon={SOCIAL_ICONS[s.label as keyof typeof SOCIAL_ICONS] ?? InstagramIcon} size={18} />
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="border-t border-white/15">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 py-5 pb-[calc(20px+78px)] lg:flex-row lg:items-center lg:justify-between lg:px-10 lg:pb-5">
          <p className="text-[12px] text-white/60">
            © {year} {owner}. All rights reserved.
          </p>
          <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-2">
            {LEGAL_LINKS.map((l) => (
              <Link key={l.href} href={l.href} prefetch={false} className="text-[12px] text-white/70 hover:text-white">
                {l.label}
              </Link>
            ))}
            <CookiePreferencesButton className="text-[12px] text-white/70 underline-offset-2 hover:text-white" />
          </nav>
          {content ? (
            <ul aria-label="Payment methods" className="flex flex-wrap gap-1.5">
              {content.paymentMethods.map((m) => (
                <li key={m} className="border border-white/25 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-white/80">
                  {m}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
