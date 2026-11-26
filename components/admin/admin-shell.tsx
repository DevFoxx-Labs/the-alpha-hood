"use client";

import { ArrowDown01Icon, Calendar03Icon, Logout03Icon, Menu01Icon, Moon02Icon, Notification03Icon, Settings01Icon, SidebarLeftIcon, Sun03Icon } from "@hugeicons/core-free-icons";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DropdownMenu, Tooltip as TooltipPrimitive } from "radix-ui";
import { createContext, Suspense, useCallback, useContext, useEffect, useRef, useState } from "react";
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

type NavSection = { label: string; items: Exclude<NavItem, { type: "section" }>[] };

/** At most five tabs: when a role has more sections, the last tab is "More" and holds the rest — nothing is unreachable on a phone. */
export function mobileSections(sections: NavSection[]): NavSection[] {
  if (sections.length <= SECTION_FOR_MOBILE) return sections;
  const rest = sections.slice(SECTION_FOR_MOBILE - 1);
  return [...sections.slice(0, SECTION_FOR_MOBILE - 1), { label: "More", items: rest.flatMap((x) => x.items) }];
}

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
  [/^\/admin\/catalog\/import$/, "Import products"],
  [/^\/admin\/catalog\/style\/[^/]+$/, "Edit product"],
  [/^\/admin\/catalog\/[^/]+$/, "Edit product"],
  [/^\/admin\/promotions$/, "Promotions"],
  [/^\/admin\/customers$/, "Customers"],
  [/^\/admin\/subscribers$/, "Subscribers"],
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
  [/^\/admin\/settings$/, "Settings"],
  [/^\/admin\/sms-providers$/, "SMS providers"],
  [/^\/admin\/email-providers$/, "Email providers"],
  [/^\/admin\/storage$/, "Storage"],
  [/^\/admin\/reviews$/, "Reviews"],
  [/^\/admin\/feedback$/, "Feedback"],
  [/^\/admin\/ugc$/, "#WearTheHood"],
  [/^\/admin$/, "Dashboard"],
];

export function adminTitle(pathname: string): string {
  return PAGE_TITLES.find(([re]) => re.test(pathname))?.[1] ?? "Admin";
}

/** Sidebar counts are refreshed after a mutation, and on navigation at most this often. */
const COUNTS_MAX_AGE_MS = 60_000;
const SIDEBAR_COOKIE = "ah_admin_sidebar";

/**
 * `initialMe` / `initialCollapsed` come from the server (app/admin/(panel)/layout.tsx), so the first HTML already
 * holds the real sidebar at its real width: no full-screen spinner, no /api/admin/me round trip, no width jump.
 */
export function AdminShell({ children, initialMe = null, initialCollapsed = false }: { children: React.ReactNode; initialMe?: Me | null; initialCollapsed?: boolean }) {
  const pathname = usePathname();
  const title = adminTitle(pathname);
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(initialMe);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [dark, setDark] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [mobileSection, setMobileSection] = useState<string | null>(null);
  const countsAt = useRef(0);

  useEffect(() => {
    let cancelled = false;
    // Signed out (or the server couldn't read the session): ask the API, which redirects to sign-in on 401.
    if (!initialMe) {
      adminApi<Me>("/api/admin/me")
        .then((m) => !cancelled && setMe(m))
        .catch(() => undefined);
    }
    queueMicrotask(() => {
      if (cancelled) return;
      setDark(document.getElementById("admin-root")?.classList.contains("dark") ?? false);
      // One-time move from the old localStorage flag to the cookie the server can read.
      if (!document.cookie.includes(`${SIDEBAR_COOKIE}=`) && localStorage.getItem("sidebar-collapsed") === "1") {
        document.cookie = `${SIDEBAR_COOKIE}=1; path=/admin; max-age=31536000; samesite=lax`;
        setCollapsed(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [initialMe]);

  const refreshCounts = useCallback(() => {
    countsAt.current = Date.now();
    adminApi<{ queue?: { toPack: number }; returns?: { awaitingQc: number }; payouts?: number; privacy?: { open: number } }>("/api/admin/dashboard")
      .then((d) => setCounts({ toPack: d.queue?.toPack ?? 0, awaitingQc: d.returns?.awaitingQc ?? 0, payouts: d.payouts ?? 0, privacy: d.privacy?.open ?? 0 }))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!me || Date.now() - countsAt.current < COUNTS_MAX_AGE_MS) return;
    const t = window.setTimeout(refreshCounts, 0);
    return () => window.clearTimeout(t);
  }, [me, refreshCounts, pathname]);

  const toggleCollapsed = () => {
    const next = !collapsed;
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "1" : "0"}; path=/admin; max-age=31536000; samesite=lax`;
    localStorage.setItem("sidebar-collapsed", next ? "1" : "0");
    setCollapsed(next);
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

  if (!me) return <ShellSkeleton collapsed={collapsed} />;

  const nav = NAV_CONFIG[me.staff.role];
  const meta = ROLE_META[me.staff.role];
  const isCollapsed = collapsed;
  const sections = nav.reduce<{ label: string; items: Exclude<NavItem, { type: "section" }>[] }[]>((acc, item) => {
    if ("type" in item) acc.push({ label: item.label, items: [] });
    else if (acc.length === 0) acc.push({ label: item.label, items: [item] });
    else acc.at(-1)!.items.push(item);
    return acc;
  }, []);
  const today = new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
  const ctx = { me, can: (p: Permission) => me.permissions.includes(p), counts, refreshCounts };
  const queueCount = (counts.toPack ?? 0) + (counts.awaitingQc ?? 0) + (counts.payouts ?? 0) + (counts.privacy ?? 0);

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
            <Link href="/admin" aria-label="The Alpha Hood admin — dashboard" className={cn("flex h-[62px] shrink-0 items-center justify-center py-[13px]", isCollapsed ? "px-3" : "px-4")}>
              {/* Sidebar is always dark → the on-dark brand files. Fixed sizes, no layout shift. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={isCollapsed ? "/brand/logo/mark_color-on-dark.svg" : "/brand/logo/primary-horizontal_color-on-dark_tm.svg"}
                alt=""
                width={isCollapsed ? 28 : 113}
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
            <div className="flex min-h-[44px] items-center justify-center px-3 py-3">
              {!isCollapsed ? <ThemeToggle dark={dark} onToggle={toggleTheme} /> : null}
            </div>
          </aside>

          <div className="flex w-full min-w-0 max-w-full flex-1 flex-col">
            {/* Desktop topbar */}
            <header className="sticky top-0 z-30 hidden shrink-0 items-center justify-between border-b border-border bg-card px-4 py-3 md:flex">
              <div className="flex items-center gap-3">
                <button type="button" onClick={toggleCollapsed} aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!isCollapsed} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <AIcon icon={SidebarLeftIcon} />
                </button>
                <div>
                  <p className="text-base font-semibold leading-tight text-foreground">{title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{meta.subtitle}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                  <AIcon icon={Calendar03Icon} className="h-3.5 w-3.5" />
                  <span suppressHydrationWarning>{today}</span>
                </div>
                <ThemeToggle dark={dark} onToggle={toggleTheme} />
                <WorkBell count={queueCount} />
                <UserMenu me={me} onSignOut={signOut} />
              </div>
            </header>

            {/* Mobile topbar */}
            <header className="sticky top-0 z-30 flex shrink-0 items-center justify-between border-b border-border bg-card px-4 py-3 md:hidden">
              <Link href="/admin" aria-label="The Alpha Hood admin — dashboard" className="flex items-center">
                {/* Topbar follows the admin theme: colour mark on light, on-dark mark in dark mode. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/logo/primary-horizontal_color_tm.svg" alt="" width={101} height={32} className="h-8 w-auto dark:hidden" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/logo/primary-horizontal_color-on-dark_tm.svg" alt="" width={101} height={32} className="hidden h-8 w-auto dark:block" />
              </Link>
              <div className="flex items-center gap-2">
                <button type="button" onClick={toggleTheme} aria-label="Toggle theme" className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent">
                  <AIcon icon={dark ? Sun03Icon : Moon02Icon} />
                </button>
                <WorkBell count={queueCount} />
                <Avatar name={me.staff.name} className="h-7 w-7 text-[10px]" />
                <button type="button" onClick={signOut} aria-label="Log out" className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <AIcon icon={Logout03Icon} />
                </button>
              </div>
            </header>

            <main className="w-full max-w-full flex-1 overflow-x-clip bg-background px-3 py-2 pb-6 sm:p-6">
              {/* Only the page area waits while a screen loads; the sidebar and topbar stay put. */}
              <Suspense fallback={<div className="h-64 animate-pulse rounded-xl border border-border bg-card" aria-busy="true" />}>{children}</Suspense>
            </main>

            <footer className="mb-14 flex shrink-0 items-center justify-between border-t border-border bg-card px-4 py-2 text-[10px] text-muted-foreground md:mb-0 md:px-6 md:text-xs">
              <span suppressHydrationWarning>© {new Date().getFullYear()} The Alpha Hood — Admin</span>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                v0.7.0
              </span>
            </footer>
          </div>

          {/* Mobile bottom bar from NAV_CONFIG sections */}
          <MobileBar sections={mobileSections(sections)} pathname={pathname} open={mobileSection} setOpen={setMobileSection} />
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

function Avatar({ name, className }: { name: string; className?: string }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "A";
  return (
    <span aria-hidden="true" className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-red-700 text-xs font-semibold text-white", className)}>
      {initials}
    </span>
  );
}

/** Bell: goes to the dashboard work queue, with the number of things waiting. */
function WorkBell({ count }: { count: number }) {
  return (
    <Link
      href="/admin"
      aria-label={count ? `Work queue: ${count} waiting` : "Work queue"}
      className="relative rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <AIcon icon={Notification03Icon} />
      {count > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">{count > 99 ? "99+" : count}</span>
      ) : null}
    </Link>
  );
}

function UserMenu({ me, onSignOut }: { me: Me; onSignOut: () => void }) {
  const meta = ROLE_META[me.staff.role];
  const itemCls = "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent";
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex items-center gap-2 border-l border-border pl-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Open user menu">
        <Avatar name={me.staff.name} />
        <span className="hidden text-left sm:block">
          <span className="block text-sm font-medium leading-tight text-foreground">{me.staff.name}</span>
          <span className="block max-w-[120px] truncate text-[11px] leading-tight text-muted-foreground">{me.staff.email}</span>
        </span>
        <AIcon icon={ArrowDown01Icon} className="hidden h-3.5 w-3.5 text-muted-foreground sm:block" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className="admin-root z-[200] w-52 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
          <div className="px-2 py-1.5">
            <p className="text-sm font-medium leading-none">{me.staff.name}</p>
            <p className="mt-1 max-w-full truncate text-xs leading-none text-muted-foreground">{me.staff.email}</p>
            <span className={cn("mt-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium", meta.color)}>{meta.label}</span>
          </div>
          {me.permissions.includes("settings.manage") ? (
            <>
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              <DropdownMenu.Item asChild>
                <Link href="/admin/settings" className={itemCls}>
                  <AIcon icon={Settings01Icon} />
                  Settings
                </Link>
              </DropdownMenu.Item>
            </>
          ) : null}
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item onSelect={onSignOut} className={cn(itemCls, "text-red-600 dark:text-red-400")}>
            <AIcon icon={Logout03Icon} />
            Log out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/**
 * The shell's own outline while the session is being read: same sidebar width, topbar height and page band as the
 * real thing, so nothing moves when it arrives. Also the Suspense fallback of the (panel) layout.
 */
export function ShellSkeleton({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex min-h-screen flex-col bg-background md:flex-row" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <div className={cn("sticky top-0 hidden h-screen shrink-0 border-r border-sidebar-border bg-sidebar md:block", collapsed ? "w-14" : "w-56")} />
      <div className="flex w-full min-w-0 flex-1 flex-col">
        <div className="h-[61px] shrink-0 border-b border-border bg-card" />
        <div className="flex-1 space-y-5 px-3 py-2 sm:p-6">
          <div className="space-y-2">
            <div className="h-6 w-48 animate-pulse rounded bg-muted" />
            <div className="h-4 w-80 max-w-full animate-pulse rounded bg-muted" />
          </div>
          <div className="h-64 animate-pulse rounded-xl border border-border bg-card" />
        </div>
      </div>
    </div>
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
            <AIcon icon={s.label === "More" ? Menu01Icon : s.items[0].icon} className="h-5 w-5" />
            <span className="truncate text-[10px] font-medium">{s.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
