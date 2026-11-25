"use client";

import { Logout03Icon, Moon02Icon, Notification03Icon, SidebarLeftIcon, Sun03Icon } from "@hugeicons/core-free-icons";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DropdownMenu, Tooltip as TooltipPrimitive } from "radix-ui";
import { createContext, Suspense, useCallback, useContext, useEffect, useState } from "react";
import { toast } from "sonner";
import { type Permission, type Role, ROLE_META } from "@/lib/admin/permissions";
import { cn } from "@/lib/utils";
import { NAV_CONFIG, type NavItem } from "./nav";
import { AIcon, Tip } from "./ui";

export interface Me {
  staff: { id: string; email: string; name: string; role: Role; mfa: boolean };
  permissions: Permission[];
}

const MeContext = createContext<{ me: Me; can: (p: Permission) => boolean; counts: Record<string, number>; refreshCounts: () => void } | null>(null);

export function useAdmin() {
  const ctx = useContext(MeContext);
  if (!ctx) throw new Error("useAdmin must be used inside <AdminShell>");
  return ctx;
}

/** Calls the admin API; 401 → back to sign-in. */
export async function adminApi<T>(url: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = init.method ?? "GET";
  const res = await fetch(url, {
    method,
    cache: "no-store",
    headers: method === "GET" ? undefined : { "Content-Type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(init.body ?? {}),
  });
  const data = (await res.json().catch(() => null)) as ({ error?: { message?: string } } & T) | null;
  // A full reload on session expiry is deliberate: it drops every in-memory admin state.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  if (res.status === 401 && typeof window !== "undefined") window.location.assign(`/admin/login?next=${encodeURIComponent(location.pathname)}`);
  if (!res.ok) throw new Error(data?.error?.message ?? "Something went wrong.");
  return data as T;
}

export function notify(kind: "success" | "error", message: string) {
  toast[kind](message, { toasterId: "admin" });
}

const SECTION_FOR_MOBILE = 5;

function isActive(pathname: string, route: string) {
  return route === "/admin" ? pathname === "/admin" : pathname === route || pathname.startsWith(`${route}/`);
}

/**
 * The one admin layout (admin-panel-design §3): dark sidebar (w-56 / w-14 collapsed, remembered), sticky
 * topbar (toggle · title + role · date · theme · bell · user menu), main, footer, and a fixed bottom bar on
 * mobile built from the same NAV_CONFIG. Authorization is enforced by every API, not by this menu.
 */
/** Page titles by route (the shell lives in the layout, so it names the page from the URL). */
const PAGE_TITLES: [RegExp, string][] = [
  [/^\/admin\/orders\/[^/]+\/label$/, "Shipping label"],
  [/^\/admin\/orders\/[^/]+$/, "Order"],
  [/^\/admin\/customers\/[^/]+$/, "Customer"],
  [/^\/admin\/catalog\/new$/, "New product"],
  [/^\/admin\/catalog\/[^/]+$/, "Edit product"],
  [/^\/admin\/promotions$/, "Promotions"],
  [/^\/admin\/customers$/, "Customers"],
  [/^\/admin\/giftcards$/, "Gift cards"],
  [/^\/admin\/inventory$/, "Inventory"],
  [/^\/admin\/manifest$/, "Manifest"],
  [/^\/admin\/catalog$/, "Products"],
  [/^\/admin\/categories$/, "Categories"],
  [/^\/admin\/collections$/, "Collections"],
  [/^\/admin\/payouts$/, "Payouts"],
  [/^\/admin\/privacy$/, "Privacy requests"],
  [/^\/admin\/reports$/, "Reports"],
  [/^\/admin\/returns$/, "Returns"],
  [/^\/admin\/orders$/, "Orders"],
  [/^\/admin\/audit$/, "Audit log"],
  [/^\/admin\/staff$/, "Staff"],
  [/^\/admin\/ugc$/, "#WearTheHood"],
  [/^\/admin$/, "Dashboard"],
];

export function adminTitle(pathname: string): string {
  return PAGE_TITLES.find(([re]) => re.test(pathname))?.[1] ?? "Admin";
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const title = adminTitle(pathname);
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [mobileSection, setMobileSection] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminApi<Me>("/api/admin/me")
      .then((m) => !cancelled && setMe(m))
      .catch(() => undefined);
    queueMicrotask(() => {
      if (cancelled) return;
      setMounted(true);
      setCollapsed(localStorage.getItem("sidebar-collapsed") === "1");
      setDark(document.getElementById("admin-root")?.classList.contains("dark") ?? false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshCounts = useCallback(() => {
    adminApi<{ queue?: { toPack: number }; returns?: { awaitingQc: number }; payouts?: number; privacy?: { open: number } }>("/api/admin/dashboard")
      .then((d) => setCounts({ toPack: d.queue?.toPack ?? 0, awaitingQc: d.returns?.awaitingQc ?? 0, payouts: d.payouts ?? 0, privacy: d.privacy?.open ?? 0 }))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!me) return;
    const t = window.setTimeout(refreshCounts, 0);
    return () => window.clearTimeout(t);
  }, [me, refreshCounts, pathname]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      localStorage.setItem("sidebar-collapsed", c ? "0" : "1");
      return !c;
    });
  };
  const toggleTheme = () => {
    const root = document.getElementById("admin-root");
    const next = !dark;
    root?.classList.toggle("dark", next);
    localStorage.setItem("admin-theme", next ? "dark" : "light");
    setDark(next);
  };
  const signOut = async () => {
    await fetch("/api/admin/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => null);
    router.replace("/admin/login");
  };

  if (!me) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background" aria-busy="true">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      </div>
    );
  }

  const nav = NAV_CONFIG[me.staff.role];
  const meta = ROLE_META[me.staff.role];
  const isCollapsed = mounted && collapsed;
  const sections = nav.reduce<{ label: string; items: Exclude<NavItem, { type: "section" }>[] }[]>((acc, item) => {
    if ("type" in item) acc.push({ label: item.label, items: [] });
    else if (acc.length === 0) acc.push({ label: item.label, items: [item] });
    else acc.at(-1)!.items.push(item);
    return acc;
  }, []);
  const today = new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
  const ctx = { me, can: (p: Permission) => me.permissions.includes(p), counts, refreshCounts };

  return (
    <MeContext.Provider value={ctx}>
      <TooltipPrimitive.Provider>
        <div className="flex min-h-screen flex-col bg-background text-foreground md:flex-row">
          {/* Sidebar — always dark */}
          <aside
            aria-label="Admin navigation"
            className={cn(
              "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-in-out md:flex",
              isCollapsed ? "w-14" : "w-56",
            )}
          >
            <Link href="/admin" aria-label="The Alpha Hood admin — dashboard" className="flex h-[57px] items-center justify-center px-3">
              {/* Sidebar is always dark → the on-dark brand files. Fixed sizes, no layout shift. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={isCollapsed ? "/brand/logo/mark_color-on-dark.svg" : "/brand/logo/primary-horizontal_color-on-dark.svg"}
                alt=""
                width={isCollapsed ? 28 : 107}
                height={isCollapsed ? 28 : 36}
                className={isCollapsed ? "size-7" : "h-9 w-auto"}
              />
            </Link>
            <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-2">
              {nav.map((item, idx) =>
                "type" in item ? (
                  isCollapsed ? (
                    <div key={`s${idx}`} className="my-2 border-t border-sidebar-border" />
                  ) : (
                    <p key={`s${idx}`} className="mb-1 mt-3 px-2.5 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40 first:mt-1">
                      {item.label}
                    </p>
                  )
                ) : (
                  <NavLeaf key={item.route} item={item} active={isActive(pathname, item.route)} collapsed={isCollapsed} count={item.badgeKey ? counts[item.badgeKey] : 0} />
                ),
              )}
            </nav>
            <div className="space-y-2.5 px-3 py-3">
              {!isCollapsed ? <ThemeToggle dark={dark} onToggle={toggleTheme} /> : null}
              {!isCollapsed ? <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium", meta.color)}>{meta.label}</span> : null}
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            {/* Desktop topbar */}
            <header className="sticky top-0 z-30 hidden shrink-0 items-center justify-between border-b border-border bg-card px-4 py-3 md:flex">
              <div className="flex items-center gap-3">
                <button type="button" onClick={toggleCollapsed} aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent">
                  <AIcon icon={SidebarLeftIcon} />
                </button>
                <div>
                  <p className="text-base font-semibold leading-tight">{title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{meta.subtitle}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">{today}</span>
                <ThemeToggle dark={dark} onToggle={toggleTheme} />
                <Link href="/admin" aria-label="Work queue" className="relative rounded-md p-1.5 text-muted-foreground hover:bg-accent">
                  <AIcon icon={Notification03Icon} />
                  {(counts.toPack ?? 0) + (counts.awaitingQc ?? 0) > 0 ? <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" /> : null}
                </Link>
                <UserMenu me={me} onSignOut={signOut} />
              </div>
            </header>

            {/* Mobile topbar */}
            <header className="sticky top-0 z-30 flex shrink-0 items-center justify-between border-b border-border bg-card px-4 py-3 md:hidden">
              <Link href="/admin" aria-label="The Alpha Hood admin — dashboard" className="flex items-center">
                {/* Topbar follows the admin theme: colour mark on light, on-dark mark in dark mode. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/logo/primary-horizontal_color.svg" alt="" width={95} height={32} className="h-8 w-auto dark:hidden" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/logo/primary-horizontal_color-on-dark.svg" alt="" width={95} height={32} className="hidden h-8 w-auto dark:block" />
              </Link>
              <div className="flex items-center gap-1">
                <button type="button" onClick={toggleTheme} aria-label="Toggle theme" className="rounded-md p-1.5 text-muted-foreground">
                  <AIcon icon={dark ? Sun03Icon : Moon02Icon} />
                </button>
                <button type="button" onClick={signOut} aria-label="Sign out" className="rounded-md p-1.5 text-muted-foreground">
                  <AIcon icon={Logout03Icon} />
                </button>
              </div>
            </header>

            <main className="w-full max-w-full flex-1 overflow-x-clip bg-background px-3 py-2 pb-6 sm:p-6">
              {/* Only the page area waits while a screen loads; the sidebar and topbar stay put. */}
              <Suspense fallback={<div className="h-64 animate-pulse rounded-xl border border-border bg-card" aria-busy="true" />}>{children}</Suspense>
            </main>

            <footer className="mb-14 flex shrink-0 items-center justify-between border-t border-border bg-card px-4 py-2 text-xs text-muted-foreground md:mb-0 md:px-6">
              <span>© {new Date().getFullYear()} The Alpha Hood — Admin</span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-green-500" aria-hidden="true" />
                v0.7.0
              </span>
            </footer>
          </div>

          {/* Mobile bottom bar from NAV_CONFIG sections */}
          <MobileBar sections={sections.slice(0, SECTION_FOR_MOBILE)} pathname={pathname} open={mobileSection} setOpen={setMobileSection} />
        </div>
      </TooltipPrimitive.Provider>
    </MeContext.Provider>
  );
}

function NavLeaf({ item, active, collapsed, count }: { item: Exclude<NavItem, { type: "section" }>; active: boolean; collapsed: boolean; count?: number }) {
  const link = (
    <Link
      href={item.route}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={cn(
        collapsed ? "mb-0.5 flex w-full items-center justify-center rounded-md p-2 text-sm" : "mb-0.5 flex w-full items-center gap-2.5 rounded-md px-2.5 py-[7px] text-sm transition-colors",
        active ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      <AIcon icon={item.icon} />
      {!collapsed ? <span className="flex-1 truncate">{item.label}</span> : null}
      <PendingDot />
      {!collapsed && count ? (
        <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">{count > 99 ? "99+" : count}</span>
      ) : null}
    </Link>
  );
  return collapsed ? <Tip label={item.label}>{link}</Tip> : link;
}

/** Inline feedback on the clicked sidebar link while its page loads (must sit inside the <Link>). */
function PendingDot() {
  const { pending } = useLinkStatus();
  return pending ? <span aria-hidden="true" className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null;
}

function ThemeToggle({ dark, onToggle }: { dark: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center gap-1.5 text-muted-foreground">
      <AIcon icon={Sun03Icon} className="h-3.5 w-3.5" />
      <button type="button" role="switch" aria-checked={dark} aria-label="Dark mode" onClick={onToggle} className={cn("relative h-5 w-9 rounded-full transition-colors", dark ? "bg-slate-500" : "bg-slate-300")}>
        <span className={cn("absolute left-[3px] top-[3px] h-3.5 w-3.5 rounded-full bg-white transition-transform", dark && "translate-x-[16px]")} />
      </button>
      <AIcon icon={Moon02Icon} className="h-3.5 w-3.5" />
    </div>
  );
}

function UserMenu({ me, onSignOut }: { me: Me; onSignOut: () => void }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex items-center gap-2 rounded-md p-1 hover:bg-accent" aria-label="Account menu">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {me.staff.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="text-sm font-medium">{me.staff.name}</span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className="admin-root z-[200] w-52 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
          <div className="px-2 py-1.5 text-xs text-muted-foreground">{me.staff.email}</div>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item onSelect={onSignOut} className="flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent">
            <AIcon icon={Logout03Icon} />
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function MobileBar({
  sections,
  pathname,
  open,
  setOpen,
}: {
  sections: { label: string; items: Exclude<NavItem, { type: "section" }>[] }[];
  pathname: string;
  open: string | null;
  setOpen: (s: string | null) => void;
}) {
  const router = useRouter();
  const current = sections.find((s) => s.items.find((i) => isActive(pathname, i.route)))?.label;
  const panel = sections.find((s) => s.label === open);
  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] border-t border-border bg-card md:hidden">
      {panel ? (
        <>
          <button type="button" aria-label="Close menu" className="fixed inset-0 -z-10 cursor-default" onClick={() => setOpen(null)} />
          <div className="max-h-[50vh] overflow-y-auto border-b border-border bg-muted/20 px-4 py-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{panel.label}</p>
            {panel.items.map((i) => (
              <Link key={i.route} href={i.route} onClick={() => setOpen(null)} className="flex items-center gap-2.5 rounded-md px-2 py-2 text-sm hover:bg-accent">
                <AIcon icon={i.icon} />
                <span className="flex-1">{i.label}</span>
                <PendingDot />
              </Link>
            ))}
          </div>
        </>
      ) : null}
      <nav aria-label="Admin sections" className="flex">
        {sections.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => (s.items.length === 1 ? (setOpen(null), router.push(s.items[0].route)) : setOpen(open === s.label ? null : s.label))}
            className={cn("flex flex-1 flex-col items-center justify-center gap-1 py-2", current === s.label ? "text-brand" : "text-muted-foreground")}
            aria-expanded={s.items.length > 1 ? open === s.label : undefined}
          >
            <AIcon icon={s.items[0].icon} className="h-5 w-5" />
            <span className="truncate text-[10px] font-medium">{s.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
