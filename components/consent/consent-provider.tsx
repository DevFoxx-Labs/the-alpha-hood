"use client";

import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore } from "react";
import { showMessageToast } from "@/components/store/toast";
import { CONSENT_COOKIE, type CookieChoice, parseChoice, readCookie } from "@/lib/consent/cookie";
import { COOKIE_PURPOSES, type CookiePurpose, PURPOSE_COOKIE_PREFIXES } from "@/lib/consent/purposes";

/**
 * Client side of cookie consent (DPDP rules §4–5):
 * - reads the server-set `ah_consent` cookie; a missing/old-version cookie means "no choice" → everything off;
 * - the banner appears only when an optional tracker is actually configured (`activePurposes`);
 * - saving goes through POST /api/consent (ledger first, cookie second). If that fails, nothing optional loads;
 * - withdrawing a purpose deletes its cookies and reloads the page so already-loaded scripts are gone.
 */
interface ConsentState {
  ready: boolean;
  activePurposes: CookiePurpose[];
  choice: CookieChoice | null;
  allowed: (purpose: CookiePurpose) => boolean;
  bannerOpen: boolean;
  preferencesOpen: boolean;
  setPreferencesOpen: (open: boolean) => void;
  save: (choice: Record<CookiePurpose, boolean>, method: "cookie_banner" | "preferences" | "consent_settings") => Promise<boolean>;
  saving: boolean;
}

const ConsentContext = createContext<ConsentState | null>(null);
const CHANGE_EVENT = "ah:consent-change";

function subscribe(callback: () => void) {
  window.addEventListener(CHANGE_EVENT, callback);
  return () => window.removeEventListener(CHANGE_EVENT, callback);
}
const readRaw = () => readCookie(document.cookie, CONSENT_COOKIE) ?? "";
const readRawServer = () => null;

function deleteCookiesWithPrefixes(prefixes: string[]) {
  const host = window.location.hostname;
  const domains = ["", host, `.${host}`, `.${host.split(".").slice(-2).join(".")}`];
  for (const part of document.cookie.split(";")) {
    const name = part.split("=")[0]?.trim();
    if (!name || !prefixes.some((p) => name.startsWith(p))) continue;
    for (const d of domains) {
      document.cookie = `${name}=; Max-Age=0; path=/${d ? `; domain=${d}` : ""}`;
    }
  }
}

export function ConsentProvider({
  activePurposes,
  cookiesVersion,
  children,
}: {
  activePurposes: CookiePurpose[];
  cookiesVersion: string;
  children: React.ReactNode;
}) {
  const raw = useSyncExternalStore(subscribe, readRaw, readRawServer);
  const ready = raw !== null;
  const choice = useMemo(() => (raw ? parseChoice(raw, cookiesVersion) : null), [raw, cookiesVersion]);
  const [dismissedThisView, setDismissedThisView] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const allowed = useCallback(
    (purpose: CookiePurpose) => activePurposes.includes(purpose) && choice?.[purpose] === true,
    [activePurposes, choice],
  );

  const save = useCallback<ConsentState["save"]>(
    async (next, method) => {
      setSaving(true);
      try {
        const res = await fetch("/api/consent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...next, method }),
        });
        if (!res.ok) throw new Error(String(res.status));
        const withdrawn = COOKIE_PURPOSES.filter((p) => choice?.[p] && !next[p]);
        setDismissedThisView(true);
        setPreferencesOpen(false);
        window.dispatchEvent(new Event(CHANGE_EVENT));
        if (withdrawn.length > 0) {
          deleteCookiesWithPrefixes(withdrawn.flatMap((p) => PURPOSE_COOKIE_PREFIXES[p]));
          window.location.reload();
        }
        return true;
      } catch {
        // Fail closed: nothing optional loads. Hide the banner for this page view only.
        setDismissedThisView(true);
        showMessageToast("Couldn't save your choice. Optional cookies stay off.");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [choice],
  );

  const bannerOpen = ready && activePurposes.length > 0 && !choice && !dismissedThisView && !preferencesOpen;

  const value = useMemo<ConsentState>(
    () => ({ ready, activePurposes, choice, allowed, bannerOpen, preferencesOpen, setPreferencesOpen, save, saving }),
    [ready, activePurposes, choice, allowed, bannerOpen, preferencesOpen, save, saving],
  );

  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>;
}

export function useConsent() {
  const ctx = useContext(ConsentContext);
  if (!ctx) throw new Error("useConsent must be used inside <ConsentProvider>");
  return ctx;
}
