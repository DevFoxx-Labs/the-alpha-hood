"use client";

import { DashboardSquare01Icon, FavouriteIcon, Home01Icon, SparklesIcon, UserIcon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Home", href: "/", icon: Home01Icon },
  { label: "Shop", href: "/men", icon: DashboardSquare01Icon },
  { label: "New", href: "/collections/new-in", icon: SparklesIcon },
  { label: "Wishlist", href: "/wishlist", icon: FavouriteIcon },
  { label: "Account", href: "/account", icon: UserIcon },
] as const;

/**
 * GLB-04 / DESIGN.md §3 MobileTabBar: 78 px incl. safe area; uppercase 9.5 px labels; active black,
 * inactive muted. Hidden from lg up.
 */
export function MobileTabBar({ active, className }: { active?: string; className?: string }) {
  const pathname = usePathname();
  const current = active ?? pathname;
  // Product pages show their own fixed "Add to bag" bar instead (PDP-06).
  if (!active && current.startsWith("/products/")) return null;
  return (
    <nav
      aria-label="Shortcuts"
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-white px-1 pb-[max(12px,env(safe-area-inset-bottom))] pt-2 lg:hidden",
        className,
      )}
    >
      {TABS.map((t) => {
        const on = t.href === "/" ? current === "/" : current.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "flex flex-col items-center gap-[3px] py-1 text-[9.5px] font-semibold uppercase tracking-[0.06em]",
              on ? "text-black" : "text-muted",
            )}
          >
            <Icon icon={t.icon} size={22} />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
