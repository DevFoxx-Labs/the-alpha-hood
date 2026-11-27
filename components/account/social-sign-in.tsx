"use client";

import { Facebook01Icon, GoogleIcon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";

/**
 * "Continue with Google / Facebook". Shown only for providers whose keys are saved (GET /api/auth/social).
 * The buttons are plain links to /api/auth/social/<provider>/start — the server does the whole flow.
 * First time from a signed-out browser, the person then verifies their mobile number once (the account is
 * phone-based); after that one tap is enough.
 */
export type Provider = "google" | "facebook";
export const LABEL: Record<Provider, string> = { google: "Google", facebook: "Facebook" };
export const ICON = { google: GoogleIcon, facebook: Facebook01Icon } as const;

let providersPromise: Promise<Provider[]> | null = null;
function loadProviders(): Promise<Provider[]> {
  return (providersPromise ??= fetch("/api/auth/social")
    .then((r) => (r.ok ? (r.json() as Promise<{ providers: Provider[] }>) : { providers: [] }))
    .then((d) => d.providers)
    .catch(() => {
      providersPromise = null;
      return [];
    }));
}

export function useSocialProviders() {
  const [providers, setProviders] = useState<Provider[]>([]);
  useEffect(() => {
    let cancelled = false;
    void loadProviders().then((p) => !cancelled && setProviders(p));
    return () => {
      cancelled = true;
    };
  }, []);
  return providers;
}

const NOTICE: Record<string, string> = {
  cancelled: "Sign-in was cancelled.",
  expired: "That sign-in took too long. Please try again.",
  error: "We couldn't sign you in with that account. Please try again or use your mobile number or email.",
  busy: "Too many attempts. Please wait a few minutes.",
  email_in_use: "An account already uses this Google email. Sign in with your email below (password or a code), then link Google in Settings.",
};

/** Messages from the callback (`?social=…`) and the "verify your mobile to finish" step (`?link=…`). */
export function useSocialNotice(): { link: Provider | null; notice: string | null; code: string | null } {
  const [state, setState] = useState<{ link: Provider | null; notice: string | null; code: string | null }>({ link: null, notice: null, code: null });
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const link = q.get("link");
    const social = q.get("social");
    const known = social && NOTICE[social] ? social : null;
    queueMicrotask(() => setState({ link: link === "google" || link === "facebook" ? link : null, notice: known ? NOTICE[known] : null, code: known }));
  }, []);
  return state;
}

export function SocialButtons({ next = "/account" }: { next?: string }) {
  const providers = useSocialProviders();
  if (!providers.length) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-2" aria-hidden="true">
        <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
      </div>
      {providers.map((p) => (
        <a
          key={p}
          href={`/api/auth/social/${p}/start?next=${encodeURIComponent(next)}`}
          className="flex h-11 w-full items-center justify-center gap-2.5 border border-ink bg-white text-[13px] font-semibold text-ink transition-colors hover:bg-[#f4f4f4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2"
        >
          <Icon icon={ICON[p]} size={18} />
          Continue with {LABEL[p]}
        </a>
      ))}
    </div>
  );
}
