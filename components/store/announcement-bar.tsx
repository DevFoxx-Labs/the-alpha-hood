"use client";

import { Cancel01Icon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { AnnouncementMessage } from "@/lib/cms/mock";
import { cn } from "@/lib/utils";

/**
 * GLB-01 / DESIGN.md §3 AnnouncementBar: 34 px black bar. Desktop shows all messages separated by
 * grey dots; mobile rotates one at a time every 4 s with a fade and can be dismissed.
 */
function Message({ m, mobile = false }: { m: AnnouncementMessage; mobile?: boolean }) {
  const body = (
    <>
      {m.strong ? <b className="font-bold text-white">{m.strong} </b> : null}
      {mobile ? (m.mobileText ?? m.text) : m.text}
    </>
  );
  return m.href ? (
    <Link href={m.href} className="hover:underline">
      {body}
    </Link>
  ) : (
    <span>{body}</span>
  );
}

export function AnnouncementBar({
  messages,
  className,
  dismissed = false,
  onDismiss,
}: {
  messages: AnnouncementMessage[];
  className?: string;
  /** Mobile only (GLB-01). Kept in memory for the visit — nothing is written to storage. */
  dismissed?: boolean;
  onDismiss?: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (messages.length < 2 || paused) return;
    const t = window.setInterval(() => setIndex((i) => (i + 1) % messages.length), 4000);
    return () => window.clearInterval(t);
  }, [messages.length, paused]);

  if (messages.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Store announcements"
      className={cn(
        "on-dark relative flex h-[30px] items-center justify-center bg-black px-10 text-[10px] font-medium uppercase tracking-[0.12em] text-white/85 lg:h-[34px] lg:text-[11.5px]",
        dismissed && "max-lg:hidden",
        className,
      )}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {/* Desktop: all messages */}
      <p className="hidden items-center gap-7 lg:flex">
        {messages.map((m, i) => (
          <Fragment key={i}>
            {i > 0 ? <i aria-hidden="true" className="block size-1 rounded-full bg-[#666]" /> : null}
            <Message m={m} />
          </Fragment>
        ))}
      </p>

      {/* Mobile: one at a time */}
      <div className="relative h-full w-full lg:hidden">
        {messages.map((m, i) => (
          <p
            key={i}
            aria-hidden={i !== index}
            className={cn(
              "absolute inset-0 truncate text-center leading-[30px] transition-opacity duration-300 ease-out",
              i === index ? "opacity-100" : "pointer-events-none opacity-0",
            )}
          >
            <Message m={m} mobile />
          </p>
        ))}
      </div>

      {onDismiss ? (
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss announcements"
        className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center text-white/80 lg:hidden"
      >
        <Icon icon={Cancel01Icon} size={14} />
      </button>
      ) : null}
    </div>
  );
}
