"use client";

import { Cancel01Icon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { NO_OPTIONAL_COOKIES } from "@/lib/consent/cookie";
import { type CookiePurpose, PURPOSES } from "@/lib/consent/purposes";
import { useConsent } from "./consent-provider";

const allOn = (purposes: CookiePurpose[]) =>
  Object.fromEntries(Object.keys(NO_OPTIONAL_COOKIES).map((p) => [p, purposes.includes(p as CookiePurpose)])) as Record<
    CookiePurpose,
    boolean
  >;

/**
 * DPDP rule §5 banner: fixed overlay (no layout shift), "Reject all" and "Accept all" identical in
 * prominence, "Customise" per category; the ✕ records a rejection.
 */
export function CookieBanner() {
  const { bannerOpen, activePurposes, save, saving, setPreferencesOpen } = useConsent();
  if (!bannerOpen) return null;

  return (
    <section
      role="region"
      aria-label="Cookie choices"
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-line bg-white shadow-[0_-8px_30px_rgba(0,0,0,0.08)]"
    >
      <div className="mx-auto flex max-w-[1360px] flex-col gap-4 px-4 py-4 pb-[max(16px,env(safe-area-inset-bottom))] lg:flex-row lg:items-center lg:gap-8 lg:px-10">
        <div className="flex-1 text-[13px] leading-[1.6] text-ink-2">
          <p className="type-label mb-1 text-ink">Your privacy, your call</p>
          <p>
            We use strictly necessary cookies to run the store. With your OK we&apos;d also use{" "}
            {activePurposes.map((p) => PURPOSES[p].label.toLowerCase()).join(" and ")} cookies. Nothing optional loads
            until you choose.{" "}
            <Link href="/legal/cookies" className="underline underline-offset-2">
              Cookie Policy
            </Link>
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <Button size="sm" variant="primary" disabled={saving} onClick={() => save(NO_OPTIONAL_COOKIES, "cookie_banner")}>
            Reject all
          </Button>
          <Button size="sm" variant="primary" disabled={saving} onClick={() => save(allOn(activePurposes), "cookie_banner")}>
            Accept all
          </Button>
          <Button size="sm" variant="outline" className="col-span-2" disabled={saving} onClick={() => setPreferencesOpen(true)}>
            Customise
          </Button>
        </div>
        <button
          type="button"
          aria-label="Close and reject optional cookies"
          disabled={saving}
          onClick={() => save(NO_OPTIONAL_COOKIES, "cookie_banner")}
          className="absolute right-2 top-2 grid size-9 place-items-center text-ink-2 hover:text-ink lg:static"
        >
          <Icon icon={Cancel01Icon} size={18} />
        </button>
      </div>
    </section>
  );
}

/** Per-category switches. Opened from the banner, the footer "Cookie preferences" link and "Your consents". */
export function CookiePreferences() {
  const { preferencesOpen, setPreferencesOpen, activePurposes, choice, save, saving } = useConsent();
  return (
    <Sheet open={preferencesOpen} onOpenChange={setPreferencesOpen}>
      <SheetContent side="right" aria-describedby="cookie-prefs-desc">
        {preferencesOpen ? (
          <PreferencesBody
            key={choice ? `${choice.analytics}${choice.advertising}` : "none"}
            activePurposes={activePurposes}
            initial={choice ?? NO_OPTIONAL_COOKIES}
            saving={saving}
            onSave={(c) => save(c, "preferences")}
            onClose={() => setPreferencesOpen(false)}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function PreferencesBody({
  activePurposes,
  initial,
  saving,
  onSave,
  onClose,
}: {
  activePurposes: CookiePurpose[];
  initial: Record<CookiePurpose, boolean>;
  saving: boolean;
  onSave: (c: Record<CookiePurpose, boolean>) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => ({ ...NO_OPTIONAL_COOKIES, ...pick(initial) }));

  return (
    <>
      <div className="flex h-14 items-center justify-between border-b border-line px-5">
        <SheetTitle>Cookie preferences</SheetTitle>
        <button type="button" aria-label="Close" onClick={onClose} className="grid size-10 place-items-center">
          <Icon icon={Cancel01Icon} size={20} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-5">
        <SheetDescription id="cookie-prefs-desc" className="text-[13px] leading-[1.6]">
          Choose which optional cookies we may use. You can change this any time from the footer.{" "}
          <Link href="/legal/cookies" className="underline underline-offset-2" onClick={onClose}>
            Cookie Policy
          </Link>
        </SheetDescription>

        <ul className="mt-5 divide-y divide-line border-y border-line">
          <li className="flex items-start justify-between gap-4 py-4">
            <div>
              <p className="text-[13px] font-bold uppercase tracking-[0.06em]">Strictly necessary</p>
              <p className="mt-1 text-[13px] text-ink-2">Runs the store and remembers your privacy choices. Always on.</p>
            </div>
            <Switch checked disabled aria-label="Strictly necessary cookies (always on)" />
          </li>
          {activePurposes.map((p) => (
            <li key={p} className="flex items-start justify-between gap-4 py-4">
              <div>
                <p id={`cp-${p}`} className="text-[13px] font-bold uppercase tracking-[0.06em]">
                  {PURPOSES[p].label}
                </p>
                <p className="mt-1 text-[13px] text-ink-2">{PURPOSES[p].description}</p>
              </div>
              <Switch
                aria-labelledby={`cp-${p}`}
                checked={draft[p]}
                onCheckedChange={(on) => setDraft((d) => ({ ...d, [p]: on }))}
              />
            </li>
          ))}
        </ul>
        {activePurposes.length === 0 ? (
          <p className="mt-4 text-[13px] text-ink-2">
            We don&apos;t use any analytics or advertising cookies right now. If we add them, we&apos;ll ask you first.
          </p>
        ) : null}
      </div>
      {activePurposes.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 border-t border-line p-4">
          <Button size="sm" disabled={saving} onClick={() => onSave(NO_OPTIONAL_COOKIES)}>
            Reject all
          </Button>
          <Button size="sm" disabled={saving} onClick={() => onSave(Object.fromEntries(activePurposes.map((p) => [p, true])) as Record<CookiePurpose, boolean>)}>
            Accept all
          </Button>
          <Button size="sm" variant="outline" className="col-span-2" disabled={saving} onClick={() => onSave(draft)}>
            Save my choices
          </Button>
        </div>
      ) : null}
    </>
  );
}

function pick(c: Record<CookiePurpose, boolean>): Record<CookiePurpose, boolean> {
  return { analytics: c.analytics, advertising: c.advertising };
}

/** Footer / anywhere: reopens the preferences (DPDP rule §4 — withdrawal as easy as giving). */
export function CookiePreferencesButton({ className }: { className?: string }) {
  const { setPreferencesOpen } = useConsent();
  return (
    <button type="button" className={className} onClick={() => setPreferencesOpen(true)}>
      Cookie preferences
    </button>
  );
}
