"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { NO_OPTIONAL_COOKIES } from "@/lib/consent/cookie";
import { type ConsentPurpose, PURPOSES } from "@/lib/consent/purposes";
import { showMessageToast } from "@/components/store/toast";
import { useConsent } from "./consent-provider";

interface HistoryRow {
  purpose: ConsentPurpose;
  status: "granted" | "denied" | "withdrawn";
  method: string;
  source: string;
  notice_version: string;
  created_at: string;
}

const METHOD_LABEL: Record<string, string> = {
  checkbox: "Checkbox",
  signup_notice: "Sign-up notice",
  cookie_banner: "Cookie banner",
  preferences: "Cookie preferences",
  consent_settings: "Your consents",
};

const STATUS_STYLE = {
  granted: "bg-green-tint text-green",
  denied: "bg-soft text-ink-2",
  withdrawn: "bg-accent-tint text-accent",
} as const;

/**
 * "Your consents" (DPDP rules §3–4): current state + timestamped history for this browser, with switches
 * to withdraw. Accounts (M6) will show the same view for the signed-in user across devices.
 */
export function ConsentsView() {
  const { activePurposes, choice, save, saving, ready } = useConsent();
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [error, setError] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/consent", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { history: HistoryRow[] };
      setHistory(data.history.toReversed());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/consent", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<{ history: HistoryRow[] }>) : Promise.reject(new Error())))
      .then((data) => {
        if (!cancelled) setHistory(data.history.toReversed());
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const marketingGranted = currentMarketing(history ?? []);

  async function withdrawOffers() {
    setWithdrawing(true);
    try {
      const res = await fetch("/api/newsletter/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) throw new Error();
      showMessageToast("Done — you won't get offers from us.");
      await load();
    } catch {
      showMessageToast("Couldn't update that. Please try again.");
    } finally {
      setWithdrawing(false);
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="cookies-h">
        <h2 id="cookies-h" className="text-[15px] font-bold uppercase tracking-[0.06em]">
          Cookies on this browser
        </h2>
        <ul className="mt-4 divide-y divide-line border-y border-line">
          <li className="flex items-center justify-between gap-4 py-4">
            <div>
              <p className="text-[14px] font-semibold">Strictly necessary</p>
              <p className="text-[13px] text-ink-2">Always on — runs the store and remembers these choices.</p>
            </div>
            <Switch checked disabled aria-label="Strictly necessary (always on)" />
          </li>
          {activePurposes.map((p) => (
            <li key={p} className="flex items-center justify-between gap-4 py-4">
              <div>
                <p id={`c-${p}`} className="text-[14px] font-semibold">
                  {PURPOSES[p].label}
                </p>
                <p className="text-[13px] text-ink-2">{PURPOSES[p].description}</p>
              </div>
              <Switch
                aria-labelledby={`c-${p}`}
                disabled={!ready || saving}
                checked={choice?.[p] ?? false}
                onCheckedChange={async (on) => {
                  const ok = await save({ ...(choice ?? NO_OPTIONAL_COOKIES), [p]: on }, "consent_settings");
                  if (ok) await load();
                }}
              />
            </li>
          ))}
        </ul>
        {activePurposes.length === 0 ? (
          <p className="mt-3 text-[13px] text-ink-2">We don&apos;t use analytics or advertising cookies right now.</p>
        ) : null}
      </section>

      <section aria-labelledby="offers-h">
        <h2 id="offers-h" className="text-[15px] font-bold uppercase tracking-[0.06em]">
          Offer messages
        </h2>
        {marketingGranted.length > 0 ? (
          <div className="mt-4 flex flex-col items-start gap-3 border border-line p-4">
            <p className="text-[14px]">
              You signed up for offers by {marketingGranted.map((p) => (p === "marketing_email" ? "email" : "WhatsApp")).join(" and ")} from
              this browser.
            </p>
            <Button size="sm" variant="outline" loading={withdrawing} onClick={withdrawOffers}>
              Stop all offer messages
            </Button>
          </div>
        ) : (
          <p className="mt-3 text-[13.5px] text-ink-2">
            No offer subscriptions from this browser. Signed up elsewhere? Use the unsubscribe link in any message.
          </p>
        )}
      </section>

      <section aria-labelledby="history-h">
        <h2 id="history-h" className="text-[15px] font-bold uppercase tracking-[0.06em]">
          History
        </h2>
        {error ? (
          <p role="alert" className="mt-3 text-[13.5px] text-ink-2">
            We couldn&apos;t load your history right now.{" "}
            <button type="button" className="underline underline-offset-2" onClick={load}>
              Try again
            </button>
          </p>
        ) : history === null ? (
          <p className="mt-3 text-[13.5px] text-ink-2">Loading…</p>
        ) : history.length === 0 ? (
          <p className="mt-3 text-[13.5px] text-ink-2">No consent choices recorded from this browser yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto border border-line">
            <table className="w-full min-w-[620px] border-collapse text-left text-[13px]">
              <thead className="bg-soft">
                <tr>
                  {["When", "Purpose", "Choice", "How", "Notice version"].map((h) => (
                    <th key={h} scope="col" className="border-b border-line px-3 py-2.5 font-bold uppercase tracking-[0.04em]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((r, i) => (
                  <tr key={`${r.created_at}-${r.purpose}-${i}`} className="border-b border-line last:border-0">
                    <td className="whitespace-nowrap px-3 py-2.5 tabular">
                      {new Date(r.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                    </td>
                    <td className="px-3 py-2.5">{PURPOSES[r.purpose]?.label ?? r.purpose}</td>
                    <td className="px-3 py-2.5">
                      <span className={`px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] ${STATUS_STYLE[r.status]}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {METHOD_LABEL[r.method] ?? r.method} · {r.source}
                    </td>
                    <td className="px-3 py-2.5 text-ink-2">{r.notice_version.replaceAll(";", " · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/** Marketing purposes whose latest status (history is newest-first) is granted. */
function currentMarketing(historyNewestFirst: HistoryRow[]): ConsentPurpose[] {
  const seen = new Map<ConsentPurpose, HistoryRow["status"]>();
  for (const r of historyNewestFirst) {
    if ((r.purpose === "marketing_email" || r.purpose === "marketing_whatsapp" || r.purpose === "marketing_sms") && !seen.has(r.purpose)) seen.set(r.purpose, r.status);
  }
  return [...seen].filter(([, s]) => s === "granted").map(([p]) => p);
}
