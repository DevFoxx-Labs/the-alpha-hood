import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * DESIGN.md §3 SectionHeader: optional Inter 300 lead line over an Anton title, optional 3 px red
 * underline (200 px), right-aligned underlined "VIEW ALL".
 */
export function SectionHeader({
  title,
  lead,
  underline = false,
  viewAllHref,
  as: Heading = "h2",
  className,
}: {
  title: string;
  lead?: string;
  underline?: boolean;
  viewAllHref?: string;
  as?: "h1" | "h2" | "h3";
  className?: string;
}) {
  return (
    <div className={cn("flex items-end justify-between gap-4", className)}>
      <div>
        <Heading className="flex flex-col">
          {lead ? <span className="type-section-lead">{lead}</span> : null}
          <span className="type-section">{title}</span>
        </Heading>
        {underline ? <div aria-hidden="true" className="mt-3 h-[3px] w-[120px] bg-accent lg:w-[200px]" /> : null}
      </div>
      {viewAllHref ? (
        <Link
          href={viewAllHref}
          className="shrink-0 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] underline underline-offset-4 lg:text-[12px]"
        >
          View all<span className="sr-only"> {title.toLowerCase()}</span>
        </Link>
      ) : null}
    </div>
  );
}
