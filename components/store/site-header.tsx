"use client";

import {
  FavouriteIcon,
  Menu01Icon,
  Search01Icon,
  ShoppingBag02Icon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { AnnouncementMessage, NavLink } from "@/lib/cms/mock";
import { cn } from "@/lib/utils";
import { SearchOverlay } from "@/components/search/search-overlay";
import { AnnouncementBar } from "./announcement-bar";
import { Logo } from "./logo";
import { useStoreUI } from "./store-ui-provider";

/**
 * GLB-02 / DESIGN.md §3 Header: 64 px white bar, grid `1fr auto 1fr`, sticky. Scrolling down slides the
 * announcement bar away; scrolling up brings it back. Mobile: menu · logo · search + bag.
 */
const iconBtn = "relative grid size-10 place-items-center text-ink transition-colors hover:text-ink-2";

export function SiteHeader({
  announcements,
  links,
  trendingSearches = [],
}: {
  announcements: AnnouncementMessage[];
  links: NavLink[];
  trendingSearches?: string[];
}) {
  const { setMenuOpen, setCartOpen, itemCount, wishlist } = useStoreUI();
  const [searchOpen, setSearchOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const y = window.scrollY;
        if (Math.abs(y - lastY.current) > 6) {
          setHidden(y > lastY.current && y > 80);
          lastY.current = y;
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      className={cn(
        "sticky top-0 z-40 transition-transform duration-300 ease-out",
        hidden && (dismissed ? "lg:-translate-y-[34px]" : "-translate-y-[30px] lg:-translate-y-[34px]"),
      )}
    >
      <AnnouncementBar messages={announcements} dismissed={dismissed} onDismiss={() => setDismissed(true)} />
      <header className="grid h-14 grid-cols-[1fr_auto_1fr] items-center border-b border-line bg-white px-2 lg:h-16 lg:px-10">
        <nav aria-label="Primary" className="flex items-center gap-6">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="flex h-10 items-center gap-3 px-2 lg:px-0"
            aria-haspopup="dialog"
            aria-label="Open menu"
          >
            <Icon icon={Menu01Icon} size={22} />
            <span aria-hidden="true" className="hidden text-[12.5px] font-semibold uppercase tracking-[0.1em] lg:inline">
              Menu
            </span>
          </button>
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "hidden text-[12.5px] font-semibold uppercase tracking-[0.1em] hover:underline hover:underline-offset-4 lg:inline",
                l.tone === "sale" && "text-accent",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <Logo />

        <div className="flex items-center justify-end gap-0.5 lg:gap-2">
          <button type="button" onClick={() => setSearchOpen(true)} aria-haspopup="dialog" aria-label="Search" className={iconBtn}>
            <Icon icon={Search01Icon} />
          </button>
          <Link
            href="/wishlist"
            aria-label={`Wishlist${wishlist.size ? `, ${wishlist.size} items` : ""}`}
            className={cn(iconBtn, "hidden lg:grid")}
          >
            <Icon icon={FavouriteIcon} />
          </Link>
          <Link href="/account" aria-label="Account" className={cn(iconBtn, "hidden lg:grid")}>
            <Icon icon={UserIcon} />
          </Link>
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            aria-haspopup="dialog"
            aria-label={`Bag, ${itemCount} ${itemCount === 1 ? "item" : "items"}`}
            className={iconBtn}
          >
            <Icon icon={ShoppingBag02Icon} />
            {itemCount > 0 ? (
              <span
                aria-hidden="true"
                className="tabular absolute right-0.5 top-0.5 grid size-4 place-items-center rounded-full bg-black text-[9.5px] font-bold text-white"
              >
                {itemCount > 9 ? "9+" : itemCount}
              </span>
            ) : null}
          </button>
        </div>
      </header>
      <SearchOverlay open={searchOpen} onOpenChange={setSearchOpen} trending={trendingSearches} />
    </div>
  );
}
