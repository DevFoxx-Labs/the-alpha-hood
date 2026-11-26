"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { adminApi, notify } from "./admin-shell";
import { AButton, ALabel, ATextarea, Confirm, EmptyState, ErrorState, PageHeader } from "./ui";

/**
 * Admin → Reviews: customers' reviews wait here until someone with `ugc.moderate` approves (published on the product
 * page with a "Verified buyer" badge) or rejects them (the customer sees the reason and can edit). Consumer-law rule:
 * reject for abuse, personal data or off-topic content only — never because a review is negative.
 */
interface Row {
  id: string;
  status: string;
  createdAt: string;
  author: string;
  productTitle: string;
  productHandle: string;
  size: string;
  rating: number;
  title: string;
  body: string;
  fit: string;
  orderNumber: string;
  rejectReason: string | null;
}
const TABS = [
  { id: "pending", label: "Waiting" },
  { id: "published", label: "Published" },
  { id: "rejected", label: "Rejected" },
] as const;
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

export function ReviewsModeration() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("pending");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    setRows(null);
    setError(null);
    adminApi<{ reviews: Row[] }>(`/api/admin/reviews?status=${tab}`)
      .then((r) => setRows(r.reviews))
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load."));
  }, [tab]);
  useEffect(() => {
    queueMicrotask(load); // load() resets the list first; not synchronously inside the effect
  }, [load]);

  const decide = async (id: string, decision: "approve" | "reject") => {
    try {
      await adminApi(`/api/admin/reviews/${id}`, { method: "POST", body: { decision, ...(decision === "reject" ? { reason: reasons[id] ?? "" } : {}) } });
      notify("success", decision === "approve" ? "Published on the product page." : "Rejected — the customer sees the reason.");
      setRows((all) => all?.filter((r) => r.id !== id) ?? null);
    } catch (e) {
      notify("error", e instanceof Error ? e.message : "Failed.");
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Reviews" description="Customers' reviews of products they received. Approve to publish; reject only for abuse, personal details or off-topic text — never because it is negative." />
      <div className="flex gap-1" role="tablist" aria-label="Review status">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={cn("h-9 rounded-md px-3 text-sm", tab === t.id ? "bg-brand/10 font-medium text-brand" : "text-muted-foreground hover:bg-accent")}>
            {t.label}
          </button>
        ))}
      </div>
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!rows && !error ? <div className="h-40 animate-pulse rounded-xl border border-border bg-card" aria-busy="true" /> : null}
      {rows && rows.length === 0 ? <EmptyState title={tab === "pending" ? "Nothing waiting" : "Nothing here yet"} description={tab === "pending" ? "New reviews appear here as customers write them." : "Reviews you decide on show up here."} /> : null}
      {rows && rows.length ? (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{r.productTitle}</span>· size {r.size} · {r.orderNumber} · {when(r.createdAt)} · by {r.author}
              </div>
              <p className="mt-2 text-sm font-semibold text-foreground">
                {"★".repeat(r.rating)}
                <span className="text-muted-foreground/40">{"★".repeat(5 - r.rating)}</span> <span className="ml-1">{r.title}</span>
              </p>
              <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{r.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">Fit: {r.fit === "true" ? "true to size" : r.fit === "small" ? "runs small" : "runs large"}</p>
              {r.rejectReason ? <p className="mt-2 text-xs text-destructive">Rejected: {r.rejectReason}</p> : null}
              {tab === "pending" ? (
                <div className="mt-4 flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-end">
                  <div className="flex-1 space-y-1.5">
                    <ALabel htmlFor={`why-${r.id}`} className="text-xs">
                      Reason if rejecting (shown to the customer)
                    </ALabel>
                    <ATextarea id={`why-${r.id}`} rows={2} maxLength={200} value={reasons[r.id] ?? ""} onChange={(e) => setReasons((x) => ({ ...x, [r.id]: e.target.value }))} className="min-h-0" />
                  </div>
                  <div className="flex gap-2">
                    <Confirm
                      trigger={
                        <AButton variant="outline" disabled={(reasons[r.id] ?? "").trim().length < 3}>
                          Reject
                        </AButton>
                      }
                      title="Reject this review?"
                      description="It won't be published. The customer sees your reason and can edit it."
                      confirmLabel="Reject"
                      destructive
                      onConfirm={() => decide(r.id, "reject")}
                    />
                    <AButton onClick={() => void decide(r.id, "approve")}>Approve & publish</AButton>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
