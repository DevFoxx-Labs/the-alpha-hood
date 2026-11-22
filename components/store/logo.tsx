import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Proposed logo (DESIGN.md §1): hood-pentagon mark with an "A" + Anton wordmark (+0.2em tracking).
 * Placeholder until the final logo — keep the slot sizes (header 64 px, mark 28 px).
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-7 shrink-0 place-items-center bg-black pt-[3px] font-display text-[18px] leading-none text-white [clip-path:polygon(50%_0,100%_28%,100%_100%,0_100%,0_28%)]",
        className,
      )}
    >
      A
    </span>
  );
}

export function Logo({
  href = "/",
  tone = "dark",
  compact = false,
  className,
  onClick,
}: {
  href?: string;
  tone?: "dark" | "light";
  /** Always use the small mobile size (e.g. inside drawers). */
  compact?: boolean;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-label="The Alpha Hood — home"
      className={cn(
        "inline-flex items-center gap-2 font-display uppercase leading-none",
        !compact && "lg:gap-2.5",
        tone === "light" ? "text-white" : "text-black",
        className,
      )}
    >
      <LogoMark
        className={cn(
          "size-5 text-[13px]",
          !compact && "lg:size-7 lg:text-[18px]",
          tone === "light" && "bg-white text-black",
        )}
      />
      <span
        aria-hidden="true"
        className={cn("whitespace-nowrap text-[16px] tracking-[0.19em]", !compact && "lg:text-[24px] lg:tracking-[0.2em]")}
      >
        {compact ? null : <span className="hidden lg:inline">The </span>}Alpha Hood
      </span>
    </Link>
  );
}
