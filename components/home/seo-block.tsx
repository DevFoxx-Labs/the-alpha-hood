"use client";

import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { Collapsible } from "radix-ui";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { NavLink } from "@/lib/cms/mock";

/**
 * HOME-12 SEO block: pipe-separated link groups + brand text. Always in the HTML (crawlable);
 * collapsed behind a toggle on mobile only.
 */
export function SeoBlock({
  heading,
  groups,
  text,
}: {
  heading: string;
  groups: { title: string; links: NavLink[] }[];
  text: string[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-[11.5px] font-bold uppercase tracking-[0.1em] lg:text-[12px]">{heading}</h2>
        <Collapsible.Trigger
          className="grid size-9 place-items-center lg:hidden"
          aria-label={open ? "Show less" : "Show more"}
        >
          <Icon icon={ArrowDown01Icon} size={18} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
        </Collapsible.Trigger>
      </div>
      <Collapsible.Content forceMount className="data-[state=closed]:hidden lg:data-[state=closed]:block">
        <div className="mt-4 flex flex-col gap-4">
          {groups.map((g) => (
            <div key={g.title}>
              <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink">{g.title}</h3>
              <p className="mt-1.5 text-[12px] leading-[1.9] text-ink-2">
                {g.links.map((l, i) => (
                  <span key={l.href}>
                    {i > 0 ? <span aria-hidden="true" className="px-1.5 text-line-2">|</span> : null}
                    <Link href={l.href} className="hover:text-ink hover:underline">
                      {l.label}
                    </Link>
                  </span>
                ))}
              </p>
            </div>
          ))}
          {text.map((p) => (
            <p key={p.slice(0, 32)} className="max-w-[980px] text-[12.5px] leading-[1.7] text-ink-2">
              {p}
            </p>
          ))}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
