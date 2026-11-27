"use client";

import { Mascot } from "@/components/brand/mascot";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, ApiError } from "@/components/checkout/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Address } from "@/lib/checkout/address-types";
import { cn } from "@/lib/utils";
import { SignInPanel } from "./sign-in-panel";
import { useAccountSession } from "./account-session";

export interface Me {
  /** `phone` is masked; null = no mobile number yet (account started by email or Google). */
  customer: { phone: string | null; name: string | null; email: string | null; emailVerified?: boolean; loginEmail?: string | null; addresses: Address[] };
  storeCredit: { balance: number; history: { amount: number; reason: string; createdAt: string }[] };
}

const MeContext = createContext<{ me: Me; reload: () => Promise<void> } | null>(null);

export function useMe() {
  const ctx = useContext(MeContext);
  if (!ctx) throw new Error("useMe must be used inside <AccountFrame>");
  return ctx;
}

const NAV = [
  { href: "/account", label: "Overview" },
  { href: "/account/orders", label: "Orders & returns" },
  { href: "/account/reviews", label: "My reviews" },
  { href: "/account/club", label: "Alpha Club" },
  { href: "/account/alerts", label: "Alerts" },
  { href: "/account/wear-the-hood", label: "#WearTheHood" },
  { href: "/account/addresses", label: "Addresses" },
  { href: "/wishlist", label: "Wishlist" },
  { href: "/account/help", label: "Help & feedback" },
  { href: "/account/settings", label: "Settings & privacy" },
];

/**
 * ACC-02 account shell: the signed-in customer's navigation and screens, or sign-in (mobile, email or Google — ACC-01)
 * when signed out. The first state comes from the server's session check (app/(store)/account/layout.tsx), so a guest
 * sees the sign-in form straight away; the browser only asks GET /api/account/me when the server couldn't decide.
 */
export function AccountFrame({
  title,
  children,
  signIn,
}: {
  title: string;
  children: React.ReactNode;
  /** What the signed-out screen says on this page (e.g. Alpha Club: why to sign in). Default: plain sign-in. */
  signIn?: { heading: string; text: string; points?: string[] };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useAccountSession();
  const known = session?.state.known ? session.state : null;
  const [state, setState] = useState<{ kind: "loading" } | { kind: "signed_out" } | { kind: "error"; message: string } | { kind: "ok"; me: Me }>(() =>
    known ? (known.me ? { kind: "ok", me: known.me } : { kind: "signed_out" }) : { kind: "loading" },
  );
  const setSession = session?.set;

  const reload = useCallback(async () => {
    try {
      const me = await api<Me>("/api/account/me");
      setState({ kind: "ok", me });
      setSession?.(me);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setState({ kind: "signed_out" });
        setSession?.(null);
      } else setState({ kind: "error", message: e instanceof ApiError ? e.message : "Couldn't load your account." });
    }
  }, [setSession]);

  // Only when the server couldn't decide (accounts off / backend unavailable / outside the account layout).
  const askApi = !known;
  useEffect(() => {
    if (!askApi) return;
    let cancelled = false;
    api<Me>("/api/account/me")
      .then((me) => !cancelled && setState({ kind: "ok", me }))
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) setState({ kind: "signed_out" });
        else setState({ kind: "error", message: e instanceof ApiError ? e.message : "Couldn't load your account." });
      });
    return () => {
      cancelled = true;
    };
  }, [askApi]);

  const signOut = async () => {
    try {
      await api("/api/session/logout", { method: "POST", body: {} });
    } finally {
      setSession?.(null);
      router.push("/");
      router.refresh();
    }
  };

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6 lg:px-10 lg:py-10">
      {state.kind === "signed_out" ? (
        <div className="mx-auto grid max-w-[880px] items-center gap-8 py-6 lg:grid-cols-[1fr_360px] lg:gap-14">
          <div className="max-w-[420px]">
            <h1 className="type-section">{signIn?.heading ?? "Sign in"}</h1>
            <p className="mt-2 text-[14px] text-ink-2">{signIn?.text ?? "Use your mobile number, email or Google — new here? We'll create your account."}</p>
            {signIn?.points?.length ? (
              <ul className="mt-3 space-y-1 text-[13px]">
                {signIn.points.map((p) => (
                  <li key={p} className="flex gap-2">
                    <span aria-hidden="true">✓</span>
                    {p}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mb-6" />
            <SignInPanel onSignedIn={reload} />
          </div>
          {/* MASCOT_PROMPTS #5 "Welcome salute" — desktop only, so the form stays first on phones. */}
          <Mascot name="alpha-05-welcome" sizes="360px" blend className="hidden lg:block" />
        </div>
      ) : state.kind === "error" ? (
        <div className="flex flex-col items-start gap-3 py-10">
          <p className="text-[14px]">{state.message}</p>
          <Button variant="outline" onClick={reload}>
            Try again
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[220px_1fr] lg:gap-10">
          <nav aria-label="Account" className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 lg:mx-0 lg:flex-col lg:gap-0 lg:border-b-0 lg:px-0">
            {NAV.map((n) => {
              const active = n.href === "/account" ? pathname === "/account" : pathname.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "shrink-0 border-b-2 px-2 py-2.5 text-[12px] font-semibold uppercase tracking-[0.08em] lg:border-b-0 lg:border-l-2 lg:px-3",
                    active ? "border-black text-black" : "border-transparent text-ink-2 hover:text-ink",
                  )}
                >
                  {n.label}
                </Link>
              );
            })}
            <button type="button" onClick={signOut} className="shrink-0 px-2 py-2.5 text-left text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-2 hover:text-ink lg:px-3">
              Sign out
            </button>
          </nav>
          <div className="min-w-0">
            <h1 className="type-section mb-5">{title}</h1>
            {state.kind === "loading" ? (
              <div className="space-y-3" aria-busy="true">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : (
              <MeContext.Provider value={{ me: state.me, reload }}>{children}</MeContext.Provider>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
