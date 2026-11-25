"use client";

import { Download04Icon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import { adminApi } from "./admin-shell";
import { AButton, AIcon, ASelect, DataTable, ErrorState, PageHeader, Pagination, SearchBox, StatusBadge, useUrlFilters } from "./ui";

interface Row {
  id: string;
  channel: "email" | "whatsapp" | "sms";
  contact: string;
  status: "pending_confirmation" | "confirmed" | "unsubscribed";
  createdAt: string;
}

const CHANNELS = [
  { value: "all", label: "All channels" },
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "sms", label: "SMS" },
];
const STATUSES = [
  { value: "all", label: "All statuses" },
  { value: "pending_confirmation", label: "Subscribed" },
  { value: "confirmed", label: "Confirmed" },
  { value: "unsubscribed", label: "Unsubscribed" },
];
const STATUS_VIEW: Record<Row["status"], { label: string; tone: "success" | "active" | "neutral" }> = {
  pending_confirmation: { label: "subscribed", tone: "success" },
  confirmed: { label: "confirmed", tone: "active" },
  unsubscribed: { label: "unsubscribed", tone: "neutral" },
};

const date = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

/**
 * Newsletter subscribers from the footer form. Contacts are masked on screen; "Export CSV" downloads full contacts
 * for the current filter (audited, rate-limited, unsubscribed people left out unless filtered for).
 */
export function SubscribersScreen() {
  const { params, set } = useUrlFilters("/admin/subscribers");
  const q = params.get("q") ?? "";
  const channel = params.get("channel") ?? "all";
  const status = params.get("status") ?? "all";
  const page = Math.max(1, Number(params.get("page")) || 1);

  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  if (channel !== "all") qs.set("channel", channel);
  if (status !== "all") qs.set("status", status);
  const exportUrl = `/api/admin/subscribers/export${qs.toString() ? `?${qs}` : ""}`;
  if (page > 1) qs.set("page", String(page));
  const url = `/api/admin/subscribers${qs.toString() ? `?${qs}` : ""}`;

  const [data, setData] = useState<{ rows: Row[]; total: number; pageSize: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Loading = the current request hasn't finished yet (derived, so no setState at the start of the effect).
  const key = `${url}#${attempt}`;
  const [settled, setSettled] = useState<string | null>(null);
  const busy = settled !== key;
  useEffect(() => {
    let cancelled = false;
    adminApi<{ rows: Row[]; total: number; pageSize: number }>(url)
      .then((d) => !cancelled && (setData(d), setError(null)))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Couldn't load."))
      .finally(() => !cancelled && setSettled(key));
    return () => {
      cancelled = true;
    };
  }, [url, key]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Subscribers"
        description="People who joined from the footer form, with their consent. Contacts are masked here; the export has them in full and is logged."
        action={
          <AButton asChild variant="outline">
            <a href={exportUrl} download>
              <AIcon icon={Download04Icon} /> Export CSV
            </a>
          </AButton>
        }
      />
      <div className="flex flex-wrap gap-3">
        <SearchBox value={q} onChange={(v) => set({ q: v || null })} placeholder="Search email or number" />
        <ASelect label="Channel" value={channel} onValueChange={(v) => set({ channel: v === "all" ? null : v })} options={CHANNELS} />
        <ASelect label="Status" value={status} onValueChange={(v) => set({ status: v === "all" ? null : v })} options={STATUSES} />
      </div>
      {error ? (
        <ErrorState message={error} onRetry={() => setAttempt((a) => a + 1)} />
      ) : (
        <DataTable
          rows={data?.rows ?? null}
          busy={busy}
          rowKey={(r) => r.id}
          empty={{ title: "No subscribers yet", description: q || channel !== "all" || status !== "all" ? "Try clearing the filters." : "Sign-ups from the store footer appear here." }}
          columns={[
            { key: "c", header: "Contact", cell: (r) => <span className="font-mono text-xs">{r.contact}</span> },
            { key: "ch", header: "Channel", cell: (r) => (r.channel === "email" ? "Email" : r.channel === "sms" ? "SMS" : "WhatsApp") },
            { key: "s", header: "Status", cell: (r) => <StatusBadge status={r.status} label={STATUS_VIEW[r.status].label} tone={STATUS_VIEW[r.status].tone} /> },
            { key: "d", header: "Joined", cell: (r) => date(r.createdAt) },
          ]}
          footer={data && data.total > data.pageSize ? <Pagination total={data.total} page={page} pageSize={data.pageSize} onPage={(p) => set({ page: p > 1 ? String(p) : null })} /> : null}
        />
      )}
    </div>
  );
}
