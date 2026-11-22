"use client";

import { Cancel01Icon, Search01Icon, ShoppingBag02Icon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { Tabs as TabsPrimitive } from "radix-ui";
import { Icon } from "@/components/ui/icon";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { MENU } from "@/lib/cms/mock";
import { cn } from "@/lib/utils";
import { MenuBadge } from "./badges";
import { Logo } from "./logo";
import { useStoreUI } from "./store-ui-provider";

/**
 * GLB-03 / DESIGN.md §3 MenuDrawer: mobile full screen, desktop 420 px left drawer. Tabs SHOP /
 * COLLECTIONS (2 px active underline), two promo tiles, a 2-column category list with badges,
 * SALE in red, and bottom tiles (Gift cards on yellow, Alpha Club on black). Content comes from the CMS.
 */
export function MenuDrawer({ menu }: { menu: typeof MENU }) {
  const { menuOpen, setMenuOpen, setCartOpen } = useStoreUI();
  const close = () => setMenuOpen(false);

  return (
    <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
      <SheetContent side="left" className="overflow-hidden">
        <SheetTitle className="sr-only">Menu</SheetTitle>
        <SheetDescription className="sr-only">Shop categories and collections</SheetDescription>

        <div className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-line px-2">
          <SheetClose className="grid size-10 place-items-center" aria-label="Close menu">
            <Icon icon={Cancel01Icon} size={22} />
          </SheetClose>
          <Logo compact onClick={close} />
          <div className="flex justify-end">
            <Link href="/search" onClick={close} aria-label="Search" className="grid size-10 place-items-center">
              <Icon icon={Search01Icon} />
            </Link>
            <button
              type="button"
              aria-label="Open bag"
              className="grid size-10 place-items-center"
              onClick={() => {
                close();
                setCartOpen(true);
              }}
            >
              <Icon icon={ShoppingBag02Icon} />
            </button>
          </div>
        </div>

        <TabsPrimitive.Root defaultValue={menu.tabs[0]?.id} className="flex min-h-0 flex-1 flex-col">
          <TabsPrimitive.List aria-label="Menu sections" className="grid shrink-0 grid-cols-2 border-b border-line">
            {menu.tabs.map((tab) => (
              <TabsPrimitive.Trigger
                key={tab.id}
                value={tab.id}
                className="-mb-px border-b-2 border-transparent py-3 text-[12px] font-bold uppercase tracking-[0.12em] text-ink-2 data-[state=active]:border-black data-[state=active]:text-black"
              >
                {tab.label}
              </TabsPrimitive.Trigger>
            ))}
          </TabsPrimitive.List>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-3">
            {menu.tabs.map((tab) => (
              <TabsPrimitive.Content key={tab.id} value={tab.id} className="outline-none">
                <div className="mb-3.5 grid grid-cols-2 gap-2">
                  {tab.promos.map((p) => (
                    <Link
                      key={p.href}
                      href={p.href}
                      onClick={close}
                      className="on-dark flex h-[110px] items-end whitespace-pre-line p-2.5 font-display text-[22px] uppercase leading-[0.9] text-white transition-opacity hover:opacity-90"
                      style={{ backgroundColor: p.fill }}
                    >
                      {p.title}
                    </Link>
                  ))}
                </div>

                <ul className="grid grid-cols-2 gap-x-3.5">
                  {tab.items.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={close}
                        className={cn(
                          "flex items-center gap-1.5 border-b border-line-2 py-[11px] text-[13px] font-medium uppercase tracking-[0.05em] hover:text-ink-2",
                          item.tone === "sale" && "font-semibold text-accent hover:text-accent",
                        )}
                      >
                        {item.label}
                        {item.badge ? <MenuBadge tone={item.badge.tone}>{item.badge.text}</MenuBadge> : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </TabsPrimitive.Content>
            ))}

            <div className="mt-3.5 grid grid-cols-2 gap-2">
              {menu.footerTiles.map((t) => (
                <Link
                  key={t.href}
                  href={t.href}
                  onClick={close}
                  className={cn(
                    "grid h-[74px] place-items-center whitespace-pre-line p-1.5 text-center font-display text-[16px] uppercase leading-none",
                    t.tone === "volt" ? "bg-volt text-black" : "on-dark bg-black text-white",
                  )}
                >
                  {t.title}
                </Link>
              ))}
            </div>
          </div>
        </TabsPrimitive.Root>
      </SheetContent>
    </Sheet>
  );
}
