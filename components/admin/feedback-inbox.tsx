"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { adminApi, notify } from "./admin-shell";
import { AButton, ALabel, ATextarea, EmptyState, ErrorState, PageHeader } from "./ui";

/** Admin → Feedback: customers' help & feedback messages. Reply (shown in their account) and mark answered. */
interface Message {
  id: string;
  status: "open" | "resolved";
  createdAt: string;
  topicLabel: string;
  orderNumber: string | null;
  rating: number | null;
  message: string;
  reply: string | null;
  customerId: string;
  customer?: { name: string | null; phone: string };
}
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

export function FeedbackInbox() {
  const [tab, setTab] = useState<"open" | "resolved">("open");
  const [rows, setRows] = useState<Message[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setRows(null);
    setError(null);
    adminApi<{ messages: Message[] }>(`/api/admin/feedback?status=${tab}`)
      .then((r) => setRows(r.messages))
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load."));
  }, [tab]);
  useEffect(() => {
    queueMicrotask(load); // load() resets the list first; not synchronously inside the effect
  }, [load]);

  const answer = async (m: Message, status: "resolved" | "open") => {
    setBusy(m.id);
    try {
      await adminApi(`/api/admin/feedback/${m.id}`, { method: "POST", body: { reply: drafts[m.id] ?? "", status } });
      notify("success", status === "resolved" ? "Answered — the customer sees your reply in their account." : "Reopened.");
      setRows((all) => all?.filter((x) => x.id !== m.id) ?? null);
    } catch (e) {
      notify("error", e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Feedback" description="Messages customers send from Account → Help & feedback. Your reply shows in their account." />
      <div className="flex gap-1" role="tablist" aria-label="Message status">
        {(["open", "resolved"] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("h-9 rounded-md px-3 text-sm", tab === t ? "bg-brand/10 font-medium text-brand" : "text-muted-foreground hover:bg-accent")}>
            {t === "open" ? "Open" : "Answered"}
          </button>
        ))}
      </div>
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!rows && !error ? <div className="h-40 animate-pulse rounded-xl border border-border bg-card" aria-busy="true" /> : null}
      {rows && rows.length === 0 ? <EmptyState title={tab === "open" ? "No open messages" : "Nothing answered yet"} description="Customers' messages appear here as they arrive." /> : null}
      {rows?.length ? (
        <ul className="space-y-3">
          {rows.map((m) => (
            <li key={m.id} className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{m.topicLabel}</span>· {when(m.createdAt)} ·{" "}
                <Link href={`/admin/customers/${m.customerId}`} className="underline underline-offset-2">
                  {m.customer?.name ?? "Customer"} ({m.customer?.phone})
                </Link>
                {m.orderNumber ? (
                  <>
                    ·{" "}
                    <Link href={`/admin/orders/${m.orderNumber}`} className="underline underline-offset-2">
                      {m.orderNumber}
                    </Link>
                  </>
                ) : null}
                {m.rating ? ` · rated ${m.rating}/5` : ""}
              </p>
              <p className="mt-2 whitespace-pre-line text-sm text-foreground">{m.message}</p>
              {m.reply ? <p className="mt-2 border-l-2 border-border pl-3 text-sm text-muted-foreground">Reply: {m.reply}</p> : null}
              <div className="mt-4 space-y-2 border-t border-border pt-3">
                <ALabel htmlFor={`reply-${m.id}`} className="text-xs">
                  {m.reply ? "Add to the reply" : "Reply"}
                </ALabel>
                <ATextarea id={`reply-${m.id}`} rows={3} maxLength={2000} value={drafts[m.id] ?? ""} onChange={(e) => setDrafts((d) => ({ ...d, [m.id]: e.target.value }))} />
                <div className="flex justify-end gap-2">
                  {tab === "resolved" ? (
                    <AButton variant="outline" loading={busy === m.id} onClick={() => void answer(m, "open")}>
                      Reopen
                    </AButton>
                  ) : null}
                  <AButton loading={busy === m.id} disabled={tab === "open" && !(drafts[m.id] ?? "").trim() && !m.reply} onClick={() => void answer(m, "resolved")}>
                    {tab === "open" ? "Send reply & mark answered" : "Save reply"}
                  </AButton>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
