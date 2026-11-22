import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import type { Metadata } from "next";
import Link from "next/link";
import { CookiePreferencesButton } from "@/components/consent/cookie-banner";
import { Icon } from "@/components/ui/icon";
import { NOTICES } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy & your data", alternates: { canonical: "/privacy" } };

const card =
  "flex items-center justify-between gap-4 border border-line px-5 py-4 text-left transition-colors hover:border-black";

/** "Privacy & Legal" hub (DPDP rule §6/§7): readable without signing in, one place for every right. */
export default function PrivacyHubPage() {
  const items = [
    { href: "/legal/privacy", title: "Privacy Notice", text: `What we collect and why · v${NOTICES.privacy.version}` },
    { href: "/legal/privacy/hi", title: "गोपनीयता सूचना (हिन्दी)", text: "Privacy Notice in Hindi", lang: "hi" },
    { href: "/privacy/consents", title: "Your consents", text: "See and change what you agreed to, with history" },
    { href: "/privacy/request?type=access", title: "Get a copy of my data", text: "A summary of your data and who it was shared with" },
    { href: "/privacy/request?type=correction", title: "Correct my data", text: "Fix or complete your details" },
    { href: "/privacy/request?type=erasure", title: "Delete my data", text: "Erase your data or account (some records the law requires are kept)" },
    { href: "/privacy/request?type=nomination", title: "Nominate someone", text: "Who can act for you if you can't" },
    { href: "/grievance", title: "Grievance Officer", text: "Complaints, timelines and escalation" },
    { href: "/legal/cookies", title: "Cookie Policy", text: "Every cookie we use and why" },
  ];
  return (
    <div className="mx-auto max-w-[860px] px-4 py-10 lg:px-0 lg:py-16">
      <h1 className="type-section">Privacy &amp; your data</h1>
      <p className="mt-4 text-[15px] leading-[1.6] text-ink-2">
        Your rights under the Digital Personal Data Protection Act, 2023 — free of charge.
      </p>
      <ul className="mt-8 grid gap-2 sm:grid-cols-2">
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href} className={card}>
              <span>
                <span lang={i.lang} className="block text-[14px] font-bold">
                  {i.title}
                </span>
                <span className="mt-0.5 block text-[12.5px] text-ink-2">{i.text}</span>
              </span>
              <Icon icon={ArrowRight01Icon} size={18} className="shrink-0" />
            </Link>
          </li>
        ))}
        <li>
          <CookiePreferencesButton className={`${card} h-full w-full text-[14px] font-bold`} />
        </li>
      </ul>
    </div>
  );
}
