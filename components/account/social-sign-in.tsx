"use client";

import { Facebook01Icon, GoogleIcon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/components/checkout/api";
import { showMessageToast } from "@/components/store/toast";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

/**
 * "Continue with Google / Facebook". Shown only for providers whose keys are saved (GET /api/auth/social).
 * The buttons are plain links to /api/auth/social/<provider>/start — the server does the whole flow.
 * First time from a signed-out browser, the person then verifies their mobile number once (the account is
 * phone-based); after that one tap is enough.
 */
type Provider = "google" | "facebook";
const LABEL: Record<Provider, string> = { google: "Google", facebook: "Facebook" };
const ICON = { google: GoogleIcon, facebook: Facebook01Icon } as const;

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
  error: "We couldn't sign you in with that account. Please try again or use your mobile number.",
  busy: "Too many attempts. Please wait a few minutes.",
};

/** Messages from the callback (`?social=…`) and the "verify your mobile to finish" step (`?link=…`). */
export function useSocialNotice(): { link: Provider | null; notice: string | null } {
  const [state, setState] = useState<{ link: Provider | null; notice: string | null }>({ link: null, notice: null });
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const link = q.get("link");
    const social = q.get("social");
    queueMicrotask(() => setState({ link: link === "google" || link === "facebook" ? link : null, notice: social && NOTICE[social] ? NOTICE[social] : null }));
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

/** Account → Settings: linked social accounts, link more, unlink. */
export function SignInMethods({ box, h2 }: { box: string; h2: string }) {
  const [data, setData] = useState<{ linked: { provider: Provider; linkedAt: string }[]; available: Provider[] } | null>(null);
  const [busy, setBusy] = useState<Provider | null>(null);
  const load = () =>
    api<{ linked: { provider: Provider; linkedAt: string }[]; available: Provider[] }>("/api/account/social")
      .then(setData)
      .catch(() => setData({ linked: [], available: [] }));
  useEffect(() => {
    void load();
    const social = new URLSearchParams(window.location.search).get("social");
    if (social === "linked") showMessageToast("Linked. You can now sign in with one tap.");
    if (social === "other_account") showMessageToast("That account is already linked to a different customer account.");
  }, []);
  if (!data || (!data.linked.length && !data.available.length)) return null;
  const linked = new Set(data.linked.map((l) => l.provider));
  const providers = [...new Set<Provider>([...data.available, ...data.linked.map((l) => l.provider)])];

  const unlink = async (p: Provider) => {
    setBusy(p);
    try {
      await api("/api/account/social", { method: "DELETE", body: { provider: p } });
      showMessageToast(`${LABEL[p]} unlinked. Sign in with your mobile number from now on, or link it again.`);
      await load();
    } catch (e) {
      showMessageToast(e instanceof ApiError ? e.message : "Couldn't unlink. Try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className={box}>
      <h2 className={h2}>Sign-in methods</h2>
      <p className="mb-4 text-[13px] text-ink-2">Your mobile number always works. Linked accounts let you sign in with one tap.</p>
      <ul className="divide-y divide-line">
        {providers.map((p) => (
          <li key={p} className="flex items-center justify-between gap-3 py-3">
            <span className="flex items-center gap-2.5 text-[14px] font-semibold">
              <Icon icon={ICON[p]} size={18} />
              {LABEL[p]}
              {linked.has(p) ? <span className="text-[12px] font-normal text-ink-2">Linked</span> : null}
            </span>
            {linked.has(p) ? (
              <Button variant="outline" size="sm" loading={busy === p} onClick={() => void unlink(p)}>
                Unlink
              </Button>
            ) : data.available.includes(p) ? (
              <Button variant="outline" size="sm" asChild>
                <a href={`/api/auth/social/${p}/start?next=${encodeURIComponent("/account/settings")}`}>Link</a>
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
