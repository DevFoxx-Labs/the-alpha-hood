"use client";

import {
  Alert02Icon,
  CheckListIcon,
  DeliveryTruck01Icon,
  Money03Icon,
  PackageIcon,
  PrinterIcon,
  ReturnRequestIcon,
  Shield01Icon,
  ShoppingBag02Icon,
} from "@hugeicons/core-free-icons";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { GarmentArt } from "@/components/store/garment-art";
import { ROLE_META, type Role, ROLES } from "@/lib/admin/permissions";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { adminApi, notify, useAdmin } from "./admin-shell";
import {
  AButton,
  AIcon,
  AInput,
  ALabel,
  ASelect,
  ATextarea,
  Card,
  Confirm,
  DataTable,
  EmptyState,
  ErrorState,
  KpiCard,
  PageHeader,
  Pagination,
  SearchBox,
  StatusBadge,
  useUrlFilters,
} from "./ui";

/** Loads JSON from an admin API with loading / error state; `reload` after mutations. */
function useAdminData<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const load = useCallback(async () => {
    if (!url) return;
    setBusy(true);
    try {
      setData(await adminApi<T>(url));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load.");
    } finally {
      setBusy(false);
    }
  }, [url]);
  useEffect(() => {
    let cancelled = false;
    if (!url) return;
    adminApi<T>(url)
      .then((d) => !cancelled && (setData(d), setError(null)))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Couldn't load."))
      .finally(() => !cancelled && setBusy(false));
    return () => {
      cancelled = true;
    };
  }, [url]);
  return { data, error, busy, reload: load };
}

async function act<T = unknown>(url: string, body: unknown, success: string, after?: () => unknown): Promise<T | null> {
  try {
    const r = await adminApi<T>(url, { method: url.includes("/staff/stf_") ? "PATCH" : "POST", body });
    notify("success", success);
    await after?.();
    return r;
  } catch (e) {
    notify("error", e instanceof Error ? e.message : "Failed.");
    return null;
  }
}

const date = (iso: string, time = false) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", ...(time ? { hour: "numeric", minute: "2-digit" } : { year: "numeric" }), timeZone: "Asia/Kolkata" });

// ── Dashboard ───────────────────────────────────────────────────────────────────────────────────

interface Dash {
  queue?: { toPack: number; toConfirm: number; onHold: number; toShip: number };
  returns?: { awaitingPickup: number; awaitingQc: number };
  payouts?: number;
  privacy?: { open: number; overdue: number };
  today?: { orders: number; revenue: number; aov: number; codShare: number };
}

/** "What do I do next" in three seconds: one work queue, ≤ 5 KPIs, one primary button. */
export function DashboardScreen() {
  const { me } = useAdmin();
  const { data, error, reload } = useAdminData<Dash>("/api/admin/dashboard");
  const tasks = data
    ? [
        data.queue && data.queue.toConfirm > 0 && { label: `${data.queue.toConfirm} high-risk COD orders to confirm`, href: "/admin/orders?fulfilment=confirmed", tone: "warning" as const },
        data.privacy && data.privacy.overdue > 0 && { label: `${data.privacy.overdue} privacy requests past the 48 h acknowledgement`, href: "/admin/privacy", tone: "danger" as const },
        data.queue && data.queue.toPack > 0 && { label: `${data.queue.toPack} orders to pack`, href: "/admin/orders?fulfilment=confirmed", tone: "active" as const },
        data.queue && data.queue.toShip > 0 && { label: `${data.queue.toShip} packed orders to ship`, href: "/admin/orders?fulfilment=packed", tone: "active" as const },
        data.returns && data.returns.awaitingQc > 0 && { label: `${data.returns.awaitingQc} returns waiting for quality check`, href: "/admin/returns?status=picked_up", tone: "pending" as const },
        data.payouts ? { label: `${data.payouts} COD refunds to pay out`, href: "/admin/payouts", tone: "warning" as const } : null,
        data.privacy && data.privacy.open > 0 && { label: `${data.privacy.open} open privacy requests`, href: "/admin/privacy", tone: "pending" as const },
      ].filter(Boolean)
    : [];
  const primary = tasks[0] as { label: string; href: string } | undefined;
  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`Hello, ${me.staff.name.split(" ")[0]}`}
        description={ROLE_META[me.staff.role].subtitle}
        action={primary ? (
          <AButton asChild>
            <Link href={primary.href}>Start: {primary.label.replace(/^\d+ /, "")}</Link>
          </AButton>
        ) : undefined}
      />
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data?.today ? (
          <>
            <KpiCard icon={ShoppingBag02Icon} tint="purple" value={data.today.orders} label="Orders today" />
            <KpiCard icon={Money03Icon} tint="emerald" value={formatINR(data.today.revenue)} label="Revenue today" hint={`AOV ${formatINR(data.today.aov)}`} />
          </>
        ) : null}
        {data?.queue ? <KpiCard icon={PackageIcon} tint="blue" value={data.queue.toPack} label="To pack" hint={data.queue.onHold ? `${data.queue.onHold} on hold` : undefined} /> : null}
        {data?.returns ? <KpiCard icon={ReturnRequestIcon} tint="amber" value={data.returns.awaitingQc} label="Returns to QC" hint={`${data.returns.awaitingPickup} awaiting pickup`} /> : null}
        {!data?.today && data?.privacy ? <KpiCard icon={Shield01Icon} tint="amber" value={data.privacy.open} label="Open privacy requests" /> : null}
      </div>
      <Card title="Work queue">
        {!data ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">All caught up. Nothing needs you right now.</p>
        ) : (
          <ul className="divide-y divide-border">
            {(tasks as { label: string; href: string; tone: "warning" | "danger" | "active" | "pending" }[]).map((t) => (
              <li key={t.label}>
                <Link href={t.href} className="flex items-center justify-between gap-3 py-3 text-sm hover:text-foreground">
                  <span className="flex items-center gap-2.5">
                    <AIcon icon={t.tone === "danger" ? Alert02Icon : CheckListIcon} className="text-muted-foreground" />
                    {t.label}
                  </span>
                  <StatusBadge status={t.tone} tone={t.tone} label="Open" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ── Orders ───────────────────────────────────────────────────────────────────────────────────────

interface OrderRow {
  number: string;
  createdAt: string;
  status: string;
  fulfilment: string;
  paymentMethod: string;
  total: number;
  items: number;
  city: string;
  pincode: string;
  hold: boolean;
  codRisk: number | null;
  needsConfirmation: boolean;
}

const FULFILMENT_OPTIONS = [
  { value: "all", label: "All stages" },
  ...["placed", "confirmed", "packed", "shipped", "out_for_delivery", "delivered", "cancelled", "rto", "returned"].map((v) => ({ value: v, label: v.replace(/_/g, " ") })),
];

export function OrdersScreen() {
  const { params, set } = useUrlFilters("/admin/orders");
  const qs = params.toString();
  const { data, error, busy, reload } = useAdminData<{ rows: OrderRow[]; total: number; page: number; pageSize: number }>(`/api/admin/orders${qs ? `?${qs}` : ""}`);
  return (
    <div className="space-y-5">
      <PageHeader title="Orders" description="Search, confirm, pack and ship. Every action is recorded in the audit log." />
      <div className="flex flex-wrap gap-3">
        <SearchBox value={params.get("q") ?? ""} onChange={(v) => set({ q: v || null })} placeholder="Order number, name or pincode" />
        <ASelect label="Stage" value={params.get("fulfilment") ?? "all"} onValueChange={(v) => set({ fulfilment: v === "all" ? null : v })} options={FULFILMENT_OPTIONS} />
        <ASelect label="Payment" className="w-36" value={params.get("payment") ?? "all"} onValueChange={(v) => set({ payment: v === "all" ? null : v })} options={[{ value: "all", label: "All payments" }, { value: "cod", label: "COD" }, { value: "prepaid", label: "Prepaid" }]} />
      </div>
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <DataTable
          rows={data?.rows ?? null}
          busy={busy}
          rowKey={(r) => r.number}
          empty={{ title: "No orders found", description: "Try adjusting your search or filters." }}
          columns={[
            { key: "n", header: "Order", cell: (r) => <Link href={`/admin/orders/${r.number}`} className="hover:underline">{r.number}</Link> },
            { key: "d", header: "Placed", cell: (r) => date(r.createdAt, true) },
            { key: "f", header: "Stage", cell: (r) => (
              <span className="flex flex-wrap gap-1">
                <StatusBadge status={r.status === "confirmed" ? r.fulfilment : r.status} />
                {r.hold ? <StatusBadge status="hold" tone="warning" label="on hold" /> : null}
                {r.needsConfirmation ? <StatusBadge status="risk" tone="danger" label="confirm COD" /> : null}
              </span>
            ) },
            { key: "p", header: "Payment", cell: (r) => (r.paymentMethod === "cod" ? `COD${r.codRisk !== null ? ` · risk ${r.codRisk}` : ""}` : r.paymentMethod.toUpperCase()) },
            { key: "c", header: "Ship to", cell: (r) => `${r.city} ${r.pincode}` },
            { key: "t", header: "Total", cell: (r) => <span className="tabular-nums">{formatINR(r.total)}</span>, className: "text-right" },
          ]}
          footer={data ? <Pagination total={data.total} page={data.page} pageSize={data.pageSize} onPage={(p) => set({ page: String(p) })} /> : null}
        />
      )}
    </div>
  );
}

interface OrderDetail extends OrderRow {
  lines: { lineId: string; title: string; size: string; quantity: number; net: number; image: { art: string; colour: string } }[];
  address: { name: string; phone: string; line1: string; line2: string; landmark: string; city: string; state: string; pincode: string };
  tracking: { courier: string; awb: string } | null;
  invoice: { number: string } | null;
  timeline: { status: string; at: string; note?: string }[];
  refunds: { id: string; amount: number; to: string; status: string }[];
  holdInfo: { reason: string; by: string } | null;
  paid: number;
  refunded: number;
  pricing: { total: number; codFee: number; shipping: number; gst: { total: number } };
  payable: number;
  tenders: { coins: number; giftCardLast4: string | null; giftCard: number; storeCredit: number; total: number } | null;
  customer: { id: string; phone: string; name: string | null; orderCount: number; rtoCount: number; codBlocked: boolean } | null;
  returns: { number: string; status: string; resolution: string }[];
}

const NEXT_STEP: Record<string, { action: string; label: string }[]> = {
  confirmed: [{ action: "packed", label: "Mark packed" }],
  packed: [{ action: "shipped", label: "Ship (create AWB + invoice)" }],
  shipped: [{ action: "out_for_delivery", label: "Out for delivery" }, { action: "delivered", label: "Delivered" }],
  out_for_delivery: [{ action: "delivered", label: "Delivered" }],
};

export function OrderScreen() {
  const { number } = useParams<{ number: string }>();
  const { can } = useAdmin();
  const { data, error, reload } = useAdminData<{ order: OrderDetail }>(`/api/admin/orders/${number}`);
  const [reason, setReason] = useState("");
  const o = data?.order;
  const run = (action: string, label: string, extra: Record<string, unknown> = {}) => act(`/api/admin/orders/${number}/action`, { action, ...extra }, label, reload);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!o) return <div className="h-64 animate-pulse rounded-xl bg-muted" />;
  const live = o.status === "confirmed";
  return (
    <div className="space-y-5">
      <PageHeader back title={`Order ${o.number}`} description={`Placed ${date(o.createdAt, true)} · ${o.paymentMethod === "cod" ? "Cash on delivery" : `Paid ${formatINR(o.paid)} by ${o.paymentMethod.toUpperCase()}`}`} action={<StatusBadge status={live ? o.fulfilment : o.status} />} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Items">
            <ul className="divide-y divide-border">
              {o.lines.map((l) => (
                <li key={l.lineId} className="flex items-center gap-3 py-2.5 text-sm">
                  <GarmentArt image={{ art: l.image.art as never, colour: l.image.colour, alt: "" }} className="h-14 w-11 rounded-md" />
                  <span className="flex-1">
                    {l.title}
                    <span className="block text-xs text-muted-foreground">Size {l.size} · Qty {l.quantity}</span>
                  </span>
                  <span className="tabular-nums">{formatINR(l.net)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
              {o.pricing.shipping ? <Row k="Shipping" v={formatINR(o.pricing.shipping)} /> : null}
              {o.pricing.codFee ? <Row k="COD fee" v={formatINR(o.pricing.codFee)} /> : null}
              <Row k="Total (incl. GST)" v={formatINR(o.pricing.total)} strong />
              <Row k="GST" v={formatINR(o.pricing.gst.total)} />
              {o.tenders?.giftCard ? <Row k={`Gift card ••••${o.tenders.giftCardLast4}`} v={`−${formatINR(o.tenders.giftCard)}`} /> : null}
              {o.tenders?.storeCredit ? <Row k="Store credit" v={`−${formatINR(o.tenders.storeCredit)}`} /> : null}
              {o.tenders?.coins ? <Row k={`Hood Coins (${o.tenders.coins})`} v={`−${formatINR(o.tenders.coins * 100)}`} /> : null}
              {o.tenders ? <Row k={o.paymentMethod === "cod" ? "To collect on delivery" : "Charged by card / UPI"} v={formatINR(o.payable)} strong /> : null}
              {o.refunded ? <Row k="Refunded" v={formatINR(o.refunded)} /> : null}
            </dl>
          </Card>
          <Card title="Timeline">
            <ol className="space-y-2 text-sm">
              {[...o.timeline].reverse().map((t, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-36 shrink-0 text-xs text-muted-foreground">{date(t.at, true)}</span>
                  <span>
                    {t.status.replace(/_/g, " ")}
                    {t.note ? <span className="text-muted-foreground"> · {t.note}</span> : null}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Actions">
            {o.holdInfo ? (
              <p className="mb-3 rounded-md bg-orange-100 px-3 py-2 text-xs text-orange-700 dark:bg-orange-950/40 dark:text-orange-400">
                On hold: {o.holdInfo.reason} ({o.holdInfo.by})
              </p>
            ) : null}
            {o.needsConfirmation ? (
              <p className="mb-3 rounded-md bg-red-100 px-3 py-2 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400">
                High-risk COD (score {o.codRisk}). Confirm with the customer before packing.
              </p>
            ) : null}
            <div className="flex flex-col gap-2">
              {live && can("orders.ship") && !o.holdInfo
                ? (NEXT_STEP[o.fulfilment] ?? []).map((s) => (
                    <AButton key={s.action} onClick={() => run(s.action, `Order ${s.label.toLowerCase()}`)}>
                      {s.label}
                    </AButton>
                  ))
                : null}
              {live && can("orders.ship") && (o.fulfilment === "shipped" || o.fulfilment === "out_for_delivery") ? (
                <Confirm trigger={<AButton variant="outline">Returned to origin (RTO)</AButton>} title="Mark as RTO?" description="Stock goes back and the customer's RTO count increases (used by COD rules)." confirmLabel="Mark RTO" destructive onConfirm={() => run("rto", "Marked RTO")} />
              ) : null}
              {o.tracking && can("orders.ship") ? (
                <AButton asChild variant="outline">
                  <Link href={`/admin/orders/${o.number}/label`}>
                    <AIcon icon={PrinterIcon} /> Print label
                  </Link>
                </AButton>
              ) : null}
              {live && can("orders.write") && (o.fulfilment === "confirmed" || o.fulfilment === "placed") ? (
                o.holdInfo || o.needsConfirmation ? (
                  <AButton variant="secondary" onClick={() => run("release", o.needsConfirmation ? "COD confirmed" : "Hold released")}>
                    {o.needsConfirmation ? "Customer confirmed — release" : "Release hold"}
                  </AButton>
                ) : (
                  <Confirm trigger={<AButton variant="outline">Put on hold</AButton>} title="Put this order on hold?" description="It can't be packed until released." confirmLabel="Hold" onConfirm={() => run("hold", "Order on hold", { reason: reason || "Held by staff" })}>
                    <AInput aria-label="Reason" placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
                  </Confirm>
                )
              ) : null}
              {live && can("orders.write") && (o.fulfilment === "confirmed" || o.fulfilment === "packed") ? (
                <Confirm
                  trigger={<AButton variant="destructive">Cancel order</AButton>}
                  title="Cancel this order?"
                  description={o.paymentMethod === "cod" ? "Stock goes back. Nothing was charged." : `Stock goes back and ${formatINR(o.paid - o.refunded)} is refunded to the original payment method.`}
                  confirmLabel="Cancel order"
                  destructive
                  onConfirm={() => run("cancel", "Order cancelled", { reason: reason || "Cancelled by staff" })}
                >
                  <AInput aria-label="Reason" placeholder="Reason (shown to the customer)" value={reason} onChange={(e) => setReason(e.target.value)} />
                </Confirm>
              ) : null}
              {!live ? <p className="text-xs text-muted-foreground">No fulfilment actions until the payment is confirmed.</p> : null}
            </div>
          </Card>
          <Card title="Ship to">
            <p className="text-sm">
              {o.address.name}
              <br />
              <span className="text-muted-foreground">
                {o.address.line1}
                {o.address.line2 ? `, ${o.address.line2}` : ""}
                {o.address.landmark ? ` (${o.address.landmark})` : ""}
                <br />
                {o.address.city}, {o.address.state} {o.address.pincode}
              </span>
            </p>
            {o.tracking ? <p className="mt-2 text-xs text-muted-foreground">{o.tracking.courier} · AWB {o.tracking.awb}</p> : null}
            {o.invoice ? <p className="mt-1 text-xs text-muted-foreground">Invoice {o.invoice.number}</p> : null}
          </Card>
          {o.customer ? (
            <Card title="Customer">
              <p className="text-sm">{o.customer.name ?? "—"}</p>
              <p className="text-xs text-muted-foreground">
                {o.customer.phone} · {o.customer.orderCount} orders · {o.customer.rtoCount} RTO{o.customer.codBlocked ? " · COD blocked" : ""}
              </p>
              {can("customers.read") ? (
                <Link href={`/admin/customers/${o.customer.id}`} className="mt-2 inline-block text-xs underline underline-offset-2">
                  Open profile
                </Link>
              ) : null}
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between", strong && "font-semibold")}>
      <dt className={strong ? "" : "text-muted-foreground"}>{k}</dt>
      <dd className="tabular-nums">{v}</dd>
    </div>
  );
}

export function LabelScreen() {
  const { number } = useParams<{ number: string }>();
  const { data, error } = useAdminData<{ label: { orderNumber: string; courier: string; awb: string; cod: number; items: number; invoice: string | null; to: Record<string, string>; from: { name: string; address: string; phone: string } } }>(`/api/admin/orders/${number}/label`);
  if (error) return <ErrorState message={error} />;
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-muted" />;
  const l = data.label;
  return (
    <div className="space-y-5">
      <PageHeader back title="Shipping label" action={<AButton onClick={() => window.print()}><AIcon icon={PrinterIcon} /> Print</AButton>} />
      <div className="mx-auto w-full max-w-[420px] border-2 border-black bg-white p-4 font-mono text-[13px] text-black">
        <p className="text-lg font-bold">{l.courier}</p>
        <p className="text-2xl font-bold tracking-widest">AWB {l.awb}</p>
        <p className="mt-1">{l.cod ? `COD — COLLECT ${formatINR(l.cod)}` : "PREPAID — DO NOT COLLECT"}</p>
        <hr className="my-3 border-black" />
        <p className="font-bold">TO</p>
        <p>
          {l.to.name} · {l.to.phone}
          <br />
          {l.to.line1}
          {l.to.line2 ? `, ${l.to.line2}` : ""}
          {l.to.landmark ? ` (${l.to.landmark})` : ""}
          <br />
          {l.to.city}, {l.to.state} — <b>{l.to.pincode}</b>
        </p>
        <hr className="my-3 border-black" />
        <p className="font-bold">FROM</p>
        <p>
          {l.from.name}
          <br />
          {l.from.address} · {l.from.phone}
        </p>
        <hr className="my-3 border-black" />
        <p>
          Order {l.orderNumber} · {l.items} item(s){l.invoice ? ` · Invoice ${l.invoice}` : ""}
        </p>
      </div>
    </div>
  );
}

export function ManifestScreen() {
  const { params, set } = useUrlFilters("/admin/manifest");
  const [today] = useState(() => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10));
  const day = params.get("date") ?? today;
  const { data, error, busy } = useAdminData<{ date: string; rows: { orderNumber: string; awb: string; courier: string; city: string; pincode: string; cod: number; items: number }[] }>(`/api/admin/manifest?date=${day}`);
  return (
    <div className="space-y-5">
      <PageHeader title="Courier manifest" description="Everything handed to the courier on a day. Print and get it signed at pickup." action={<AButton variant="outline" onClick={() => window.print()}><AIcon icon={PrinterIcon} /> Print</AButton>} />
      <div className="flex flex-wrap gap-3">
        <AInput type="date" aria-label="Date" value={day} max={today} onChange={(e) => set({ date: e.target.value || null })} className="w-44" />
      </div>
      {error ? (
        <ErrorState message={error} />
      ) : (
        <DataTable
          rows={data?.rows ?? null}
          busy={busy}
          rowKey={(r) => r.orderNumber}
          empty={{ title: "Nothing shipped on this day", description: "Pick another date or ship orders from the Orders screen." }}
          columns={[
            { key: "a", header: "AWB", cell: (r) => r.awb },
            { key: "o", header: "Order", cell: (r) => r.orderNumber },
            { key: "c", header: "Courier", cell: (r) => r.courier },
            { key: "d", header: "Destination", cell: (r) => `${r.city} ${r.pincode}` },
            { key: "i", header: "Items", cell: (r) => r.items },
            { key: "cod", header: "COD", cell: (r) => (r.cod ? formatINR(r.cod) : "Prepaid"), className: "text-right" },
          ]}
        />
      )}
    </div>
  );
}

// ── Returns & payouts ────────────────────────────────────────────────────────────────────────────

interface ReturnRow {
  number: string;
  orderNumber: string;
  status: string;
  resolution: string;
  refundTo: string | null;
  reason: string;
  items: number;
  payable: number;
  pickupDate: string;
  photos: number;
  createdAt: string;
}

export function ReturnsScreen() {
  const { can } = useAdmin();
  const { params, set } = useUrlFilters("/admin/returns");
  const status = params.get("status") ?? "";
  const { data, error, busy, reload } = useAdminData<{ rows: ReturnRow[] }>(`/api/admin/returns${status ? `?status=${status}` : ""}`);
  const step = (n: string, to: string, label: string) => act(`/api/admin/returns/${n}/action`, { to }, label, reload);
  return (
    <div className="space-y-5">
      <PageHeader title="Returns & exchanges" description="Confirm pickup, then quality-check. Passing QC settles the refund, credit or exchange automatically." />
      <div className="flex flex-wrap gap-3">
        <ASelect
          label="Status"
          className="w-48"
          value={status || "all"}
          onValueChange={(v) => set({ status: v === "all" ? null : v })}
          options={[{ value: "all", label: "All" }, { value: "pickup_scheduled", label: "Awaiting pickup" }, { value: "picked_up", label: "Awaiting QC" }, { value: "completed", label: "Completed" }, { value: "qc_failed", label: "QC failed" }, { value: "cancelled", label: "Cancelled" }]}
        />
      </div>
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <DataTable
          rows={data?.rows ?? null}
          busy={busy}
          rowKey={(r) => r.number}
          empty={{ title: "No returns here", description: "Try another status filter." }}
          columns={[
            { key: "n", header: "Return", cell: (r) => r.number },
            { key: "o", header: "Order", cell: (r) => <Link href={`/admin/orders/${r.orderNumber}`} className="underline-offset-2 hover:underline">{r.orderNumber}</Link> },
            { key: "s", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
            { key: "r", header: "Reason", cell: (r) => `${r.reason}${r.photos ? ` · ${r.photos} photo(s)` : ""}` },
            { key: "w", header: "Wants", cell: (r) => (r.resolution === "exchange" ? "Size exchange" : r.refundTo === "store_credit" ? `Credit ${formatINR(r.payable)}` : `Refund ${formatINR(r.payable)}`) },
            { key: "p", header: "Pickup", cell: (r) => r.pickupDate },
            {
              key: "a",
              header: "",
              className: "text-right",
              cell: (r) =>
                can("returns.qc") ? (
                  r.status === "pickup_scheduled" ? (
                    <AButton size="sm" variant="ghost" onClick={() => step(r.number, "picked_up", "Marked picked up")}>Picked up</AButton>
                  ) : r.status === "picked_up" ? (
                    <span className="flex justify-end gap-1">
                      <Confirm trigger={<AButton size="sm">QC pass</AButton>} title="Pass quality check?" description={r.resolution === "exchange" ? "The new size ships to the customer." : `This settles ${formatINR(r.payable)} to the customer.`} confirmLabel="Pass" onConfirm={() => step(r.number, "qc_passed", "QC passed — settled")} />
                      <Confirm trigger={<AButton size="sm" variant="ghost">Fail</AButton>} title="Fail quality check?" description="Nothing is refunded; the item goes back to the customer." confirmLabel="Fail QC" destructive onConfirm={() => step(r.number, "qc_failed", "QC failed")} />
                    </span>
                  ) : null
                ) : null,
            },
          ]}
        />
      )}
    </div>
  );
}

export function PayoutsScreen() {
  const { data, error, busy, reload } = useAdminData<{ rows: { orderNumber: string; refundId: string; amount: number; createdAt: string; upi: string | null }[] }>("/api/admin/payouts");
  const [utr, setUtr] = useState("");
  return (
    <div className="space-y-5">
      <PageHeader title="COD refund payouts" description="Refunds to customers' UPI IDs. Pay from the bank or payout API, then record the UTR here." />
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <DataTable
          rows={data?.rows ?? null}
          busy={busy}
          rowKey={(r) => r.refundId}
          empty={{ title: "No payouts waiting", description: "UPI refunds appear here after a COD return passes QC." }}
          columns={[
            { key: "o", header: "Order", cell: (r) => r.orderNumber },
            { key: "u", header: "UPI", cell: (r) => r.upi ?? "—" },
            { key: "d", header: "Queued", cell: (r) => date(r.createdAt, true) },
            { key: "a", header: "Amount", cell: (r) => formatINR(r.amount) },
            {
              key: "x",
              header: "",
              className: "text-right",
              cell: (r) => (
                <Confirm trigger={<AButton size="sm">Mark paid</AButton>} title="Record this payout" description={`Confirm you've paid ${formatINR(r.amount)} to ${r.upi ?? "the customer"}.`} confirmLabel="Mark paid" onConfirm={() => act("/api/admin/payouts", { orderNumber: r.orderNumber, refundId: r.refundId, utr }, "Payout recorded", reload)}>
                  <AInput aria-label="Bank UTR / reference" placeholder="Bank UTR / reference" value={utr} onChange={(e) => setUtr(e.target.value.trim())} />
                </Confirm>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}

// ── Inventory, catalogue, promotions ─────────────────────────────────────────────────────────────

interface Sku {
  productId: string;
  size: string;
  title: string;
  sku: string;
  onHand: number;
  held: number;
  available: number;
}

export function InventoryScreen() {
  const { can } = useAdmin();
  const { params, set } = useUrlFilters("/admin/inventory");
  const qs = params.toString();
  const { data, error, busy, reload } = useAdminData<{ rows: Sku[]; total: number }>(`/api/admin/inventory${qs ? `?${qs}` : ""}`);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  return (
    <div className="space-y-5">
      <PageHeader title="Inventory" description="On hand, held by checkouts / exchanges (15 min), and available to sell." />
      <div className="flex flex-wrap gap-3">
        <SearchBox value={params.get("q") ?? ""} onChange={(v) => set({ q: v || null })} placeholder="Product or SKU" />
        <ASelect label="Stock" className="w-36" value={params.get("low") === "1" ? "low" : "all"} onValueChange={(v) => set({ low: v === "low" ? "1" : null })} options={[{ value: "all", label: "All SKUs" }, { value: "low", label: "Low (≤ 3)" }]} />
      </div>
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <DataTable
          rows={data?.rows ?? null}
          busy={busy}
          rowKey={(r) => `${r.productId}:${r.size}`}
          empty={{ title: "No SKUs match", description: "Try adjusting your search or filters." }}
          columns={[
            { key: "t", header: "Product", cell: (r) => r.title },
            { key: "s", header: "Size", cell: (r) => r.size },
            { key: "k", header: "SKU", cell: (r) => r.sku },
            { key: "h", header: "On hand", cell: (r) => r.onHand },
            { key: "r", header: "Held", cell: (r) => r.held },
            { key: "a", header: "Available", cell: (r) => <span className={r.available <= 3 ? "font-semibold text-red-600 dark:text-red-400" : ""}>{r.available}</span> },
            {
              key: "x",
              header: "",
              className: "text-right",
              cell: (r) =>
                can("inventory.write") ? (
                  <Confirm
                    trigger={<AButton size="sm" variant="ghost">Adjust</AButton>}
                    title={`Adjust ${r.title} · ${r.size}`}
                    description="Use a positive number to add stock and a negative one to remove it. Recorded in the audit log."
                    confirmLabel="Save"
                    onConfirm={() => act("/api/admin/inventory", { productId: r.productId, size: r.size, delta: Number(delta), reason }, "Stock adjusted", () => (setDelta(""), setReason(""), reload()))}
                  >
                    <div className="space-y-2">
                      <AInput aria-label="Change" inputMode="numeric" placeholder="e.g. 5 or -2" value={delta} onChange={(e) => setDelta(e.target.value.replace(/[^-\d]/g, ""))} />
                      <AInput aria-label="Reason" placeholder="Reason (e.g. cycle count)" value={reason} onChange={(e) => setReason(e.target.value)} />
                    </div>
                  </Confirm>
                ) : null,
            },
          ]}
        />
      )}
    </div>
  );
}

type CatalogRow = { id: string; handle: string; title: string; sku: string; category: string; price: number; mrp: number; status: "draft" | "active" | "archived"; stock: number; image: { art: string; colour: string } };
const PRODUCT_TONE = { draft: "warning", active: "success", archived: "neutral" } as const;

export function CatalogScreen() {
  const { params, set } = useUrlFilters("/admin/catalog");
  const q = params.get("q") ?? "";
  const status = params.get("status") ?? "all";
  const qs = new URLSearchParams({ ...(q ? { q } : {}), ...(status !== "all" ? { status } : {}) }).toString();
  const { data, error, busy, reload } = useAdminData<{ editable: boolean; rows: CatalogRow[] }>(`/api/admin/catalog${qs ? `?${qs}` : ""}`);
  const { me } = useAdmin();
  const canEdit = !!data?.editable && me.permissions.includes("catalog.write");
  return (
    <div className="space-y-5">
      <PageHeader
        title="Products"
        description={
          data && !data.editable
            ? "Read-only: this store's catalogue is managed in its commerce platform."
            : "Create, edit, publish and archive products. Stock changes go through Inventory."
        }
        action={
          canEdit ? (
            <AButton asChild>
              <Link href="/admin/catalog/new">New product</Link>
            </AButton>
          ) : undefined
        }
      />
      <div className="flex flex-wrap gap-3">
        <SearchBox value={q} onChange={(v) => set({ q: v || null })} placeholder="Product or SKU" />
        {data?.editable ? (
          <ASelect
            label="Status"
            value={status}
            onValueChange={(v) => set({ status: v === "all" ? null : v })}
            options={[{ value: "all", label: "All statuses" }, { value: "active", label: "Active" }, { value: "draft", label: "Drafts" }, { value: "archived", label: "Archived" }]}
          />
        ) : null}
      </div>
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <DataTable
          rows={data?.rows ?? null}
          busy={busy}
          rowKey={(r) => r.id}
          empty={{ title: "No products found", description: canEdit ? "Try adjusting your search, or create a product." : "Try adjusting your search." }}
          columns={[
            { key: "t", header: "Product", cell: (r) => (
              <span className="flex items-center gap-3">
                <GarmentArt image={{ art: r.image.art as never, colour: r.image.colour, alt: "" }} className="h-12 w-9 rounded" />
                {data?.editable ? (
                  <Link href={`/admin/catalog/${r.id}`} className="font-medium text-foreground hover:underline">{r.title}</Link>
                ) : (
                  <Link href={`/products/${r.handle}`} target="_blank" className="font-medium text-foreground hover:underline">{r.title}</Link>
                )}
              </span>
            ) },
            { key: "s", header: "SKU", cell: (r) => r.sku },
            { key: "c", header: "Category", cell: (r) => r.category },
            { key: "p", header: "Price / MRP", cell: (r) => `${formatINR(r.price)} / ${formatINR(r.mrp)}` },
            { key: "k", header: "Stock", cell: (r) => r.stock },
            { key: "st", header: "Status", cell: (r) => <StatusBadge status={r.status} tone={PRODUCT_TONE[r.status]} label={r.status} /> },
          ]}
        />
      )}
    </div>
  );
}

export function PromotionsScreen() {
  const { data, error } = useAdminData<{ coupons: { code: string; description: string; live: boolean; minCart: number; perCustomerLimit: number | null }[]; combos: { id: string; title: string; collection: string }[] }>("/api/admin/promotions");
  if (error) return <ErrorState message={error} />;
  return (
    <div className="space-y-5">
      <PageHeader title="Promotions" description="Coupons and combos the store applies on the server. Read-only until they move into the platform / CMS." />
      <DataTable
        rows={data?.coupons ?? null}
        rowKey={(r) => r.code}
        empty={{ title: "No coupons", description: "Coupons appear here once configured." }}
        columns={[
          { key: "c", header: "Code", cell: (r) => r.code },
          { key: "d", header: "Offer", cell: (r) => r.description },
          { key: "m", header: "Min. bag", cell: (r) => (r.minCart ? formatINR(r.minCart) : "—") },
          { key: "l", header: "Per customer", cell: (r) => r.perCustomerLimit ?? "∞" },
          { key: "s", header: "Status", cell: (r) => <StatusBadge status={r.live ? "active" : "expired"} tone={r.live ? "success" : "neutral"} label={r.live ? "live" : "ended"} /> },
        ]}
      />
      <DataTable
        rows={data?.combos ?? null}
        rowKey={(r) => r.id}
        empty={{ title: "No combos", description: "Combos appear here once configured." }}
        columns={[
          { key: "t", header: "Combo", cell: (r) => r.title },
          { key: "c", header: "Eligible collection", cell: (r) => <Link href={`/collections/${r.collection}`} target="_blank" className="hover:underline">{r.collection}</Link> },
        ]}
      />
    </div>
  );
}

// ── Customers ────────────────────────────────────────────────────────────────────────────────────

export function CustomersScreen() {
  const { params, set } = useUrlFilters("/admin/customers");
  const q = params.get("q") ?? "";
  const { data, error, busy } = useAdminData<{ rows: { id: string; name: string | null; phone: string; email: string | null; orderCount: number; rtoCount: number; codBlocked: boolean; createdAt: string }[] }>(`/api/admin/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  return (
    <div className="space-y-5">
      <PageHeader title="Customers" description="Contact details are masked. Search by the last 4+ phone digits, name or email." />
      <div className="flex flex-wrap gap-3">
        <SearchBox value={q} onChange={(v) => set({ q: v || null })} placeholder="Phone digits, name or email" />
      </div>
      {error ? (
        <ErrorState message={error} />
      ) : (
        <DataTable
          rows={data?.rows ?? null}
          busy={busy}
          rowKey={(r) => r.id}
          empty={{ title: "No customers found", description: "Try adjusting your search." }}
          columns={[
            { key: "n", header: "Customer", cell: (r) => <Link href={`/admin/customers/${r.id}`} className="hover:underline">{r.name ?? r.phone}</Link> },
            { key: "p", header: "Phone", cell: (r) => r.phone },
            { key: "o", header: "Orders", cell: (r) => r.orderCount },
            { key: "r", header: "RTO", cell: (r) => r.rtoCount },
            { key: "c", header: "COD", cell: (r) => (r.codBlocked ? <StatusBadge status="blocked" tone="danger" label="blocked" /> : <StatusBadge status="ok" tone="success" label="allowed" />) },
            { key: "d", header: "Since", cell: (r) => date(r.createdAt) },
          ]}
        />
      )}
    </div>
  );
}

export function CustomerScreen() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAdmin();
  const { data, error, reload } = useAdminData<{
    customer: { id: string; name: string | null; phone: string; email: string | null; orderCount: number; rtoCount: number; codBlocked: boolean; orders: OrderRow[]; returns: { number: string; status: string; reason: string }[]; storeCredit: { balance: number; history: { amount: number; reason: string; createdAt: string }[] } };
  }>(`/api/admin/customers/${id}`);
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const c = data?.customer;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!c) return <div className="h-64 animate-pulse rounded-xl bg-muted" />;
  return (
    <div className="space-y-5">
      <PageHeader back title={c.name ?? c.phone} description={`${c.phone}${c.email ? ` · ${c.email}` : ""}`} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <DataTable
            rows={c.orders}
            rowKey={(r) => r.number}
            empty={{ title: "No orders yet", description: "Orders appear here after checkout." }}
            columns={[
              { key: "n", header: "Order", cell: (r) => <Link href={`/admin/orders/${r.number}`} className="hover:underline">{r.number}</Link> },
              { key: "d", header: "Placed", cell: (r) => date(r.createdAt) },
              { key: "s", header: "Stage", cell: (r) => <StatusBadge status={r.status === "confirmed" ? r.fulfilment : r.status} /> },
              { key: "t", header: "Total", cell: (r) => formatINR(r.total) },
            ]}
          />
          <Card title="Returns">
            {c.returns.length === 0 ? <p className="text-sm text-muted-foreground">No returns.</p> : (
              <ul className="space-y-1 text-sm">
                {c.returns.map((r) => (
                  <li key={r.number} className="flex justify-between">
                    <span>{r.number} · {r.reason}</span>
                    <StatusBadge status={r.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="COD">
            <p className="text-sm text-muted-foreground">{c.rtoCount} RTO · {c.codBlocked ? "COD blocked" : "COD allowed"}</p>
            {can("customers.write") ? (
              <Confirm
                trigger={<AButton variant="outline" className="mt-3 w-full">{c.codBlocked ? "Allow COD" : "Block COD"}</AButton>}
                title={c.codBlocked ? "Allow cash on delivery?" : "Block cash on delivery?"}
                description="The customer will only be able to pay online while COD is blocked."
                confirmLabel={c.codBlocked ? "Allow" : "Block"}
                destructive={!c.codBlocked}
                onConfirm={() => act(`/api/admin/customers/${c.id}`, { action: c.codBlocked ? "unblock_cod" : "block_cod", reason: reason || "Staff decision" }, "Saved", reload)}
              >
                <AInput aria-label="Reason" placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
              </Confirm>
            ) : null}
          </Card>
          <Card title="Store credit">
            <p className="text-2xl font-semibold">{formatINR(c.storeCredit.balance)}</p>
            {can("customers.write") ? (
              <Confirm
                trigger={<AButton variant="outline" className="mt-3 w-full">Adjust credit</AButton>}
                title="Adjust store credit"
                description="Amount in rupees (negative to remove). Limits depend on your role. Recorded in the audit log."
                confirmLabel="Save"
                onConfirm={() => act(`/api/admin/customers/${c.id}`, { action: "credit", amount: Math.round(Number(amount) * 100), reason }, "Credit adjusted", () => (setAmount(""), reload()))}
              >
                <div className="space-y-2">
                  <AInput aria-label="Amount in rupees" inputMode="decimal" placeholder="e.g. 200" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^-\d.]/g, ""))} />
                  <AInput aria-label="Reason" placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
                </div>
              </Confirm>
            ) : null}
            <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
              {c.storeCredit.history.slice(0, 8).map((h, i) => (
                <li key={i} className="flex justify-between">
                  <span>{h.reason.replace(/_/g, " ")} · {date(h.createdAt)}</span>
                  <span className="tabular-nums">{formatINR(h.amount)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ── Privacy requests (DPDP inbox) ────────────────────────────────────────────────────────────────

interface PrivacyRow {
  reference: string;
  type: string;
  name: string;
  contact: string;
  orderNumber: string | null;
  details: string;
  status: string;
  createdAt: string;
  acknowledgeBy: string;
  resolveBy: string;
  log: { at: string; by: string; status: string; note: string }[];
}

export function PrivacyScreen() {
  const { can } = useAdmin();
  const { data, error, busy, reload } = useAdminData<{ rows: PrivacyRow[] }>("/api/admin/privacy");
  const [note, setNote] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  return (
    <div className="space-y-5">
      <PageHeader title="Privacy requests & grievances" description="Acknowledge within 48 hours, resolve within 30 days. Verify identity (OTP to the contact on file) before sharing or deleting data." />
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      ) : data.rows.length === 0 ? (
        <EmptyState title="No requests" description="Requests from /privacy/request appear here." />
      ) : (
        <div className="space-y-3" aria-busy={busy}>
          {data.rows.map((r) => {
            const late = r.status === "received" && Date.parse(r.acknowledgeBy) < now;
            return (
              <div key={r.reference} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">
                    {r.reference} · {r.type.replace(/_/g, " ")} · {r.name}
                  </p>
                  <span className="flex gap-1">
                    {late ? <StatusBadge status="late" tone="danger" label="ack overdue" /> : null}
                    <StatusBadge status={r.status} />
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.contact}
                  {r.orderNumber ? ` · order ${r.orderNumber}` : ""} · received {date(r.createdAt, true)} · resolve by {date(r.resolveBy)}
                </p>
                <p className="mt-2 whitespace-pre-line text-sm">{r.details}</p>
                {r.log.length ? (
                  <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                    {r.log.map((l, i) => (
                      <li key={i}>
                        {date(l.at, true)} · {l.by} · {l.status}: {l.note}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {can("privacy.write") && r.status !== "resolved" && r.status !== "rejected" ? (
                  open === r.reference ? (
                    <div className="mt-3 space-y-2">
                      <ATextarea aria-label="Note" placeholder="What you did / told the person" value={note} onChange={(e) => setNote(e.target.value)} />
                      <div className="flex flex-wrap gap-2">
                        {(["acknowledged", "in_progress", "resolved", "rejected"] as const).map((s) => (
                          <AButton key={s} size="sm" variant={s === "resolved" ? "default" : "outline"} onClick={() => act(`/api/admin/privacy/${r.reference}`, { status: s, note }, "Updated", () => (setNote(""), setOpen(null), reload()))}>
                            {s.replace("_", " ")}
                          </AButton>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <AButton size="sm" variant="outline" className="mt-3" onClick={() => setOpen(r.reference)}>
                      Update
                    </AButton>
                  )
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Reports ──────────────────────────────────────────────────────────────────────────────────────

interface Report {
  days: number;
  orders: number;
  revenue: number;
  aov: number;
  codShare: number;
  rto: number;
  gst: number;
  byDay: { day: string; orders: number; revenue: number }[];
  returnReasons: { reason: string; count: number }[];
  categories: { category: string; units: number; revenue: number }[];
}

export function ReportsScreen() {
  const { params, set } = useUrlFilters("/admin/reports");
  const days = params.get("days") ?? "14";
  const { data, error, reload } = useAdminData<Report>(`/api/admin/reports?days=${days}`);
  const max = Math.max(1, ...(data?.byDay.map((d) => d.revenue) ?? [1]));
  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Reports"
        description="Confirmed orders only. Amounts include GST."
        action={
          <AButton asChild variant="outline">
            <a href={`/api/admin/reports/orders?days=${days === "7" ? 7 : days === "30" ? 30 : 14}`} download>
              Export orders CSV
            </a>
          </AButton>
        }
      />
      <div className="flex flex-wrap gap-3">
        <ASelect label="Period" className="w-36" value={days} onValueChange={(v) => set({ days: v })} options={[{ value: "7", label: "Last 7 days" }, { value: "14", label: "Last 14 days" }, { value: "30", label: "Last 30 days" }]} />
      </div>
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard icon={ShoppingBag02Icon} tint="purple" value={data.orders} label="Orders" />
            <KpiCard icon={Money03Icon} tint="emerald" value={formatINR(data.revenue)} label="Revenue" hint={`GST ${formatINR(data.gst)}`} />
            <KpiCard icon={PackageIcon} tint="blue" value={formatINR(data.aov)} label="Average order value" />
            <KpiCard icon={DeliveryTruck01Icon} tint="amber" value={`${data.codShare}%`} label="COD share" hint={`${data.rto} RTO`} />
          </div>
          <Card title="Revenue by day">
            {data.orders === 0 ? (
              <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">No confirmed orders in this period.</div>
            ) : (
              <div className="flex h-56 items-end gap-1" role="img" aria-label="Revenue by day">
                {data.byDay.map((d) => (
                  <div key={d.day} className="flex flex-1 flex-col items-center gap-1" title={`${d.day}: ${formatINR(d.revenue)} · ${d.orders} orders`}>
                    <div className="w-full rounded-t bg-brand/80" style={{ height: `${Math.max(2, (d.revenue / max) * 200)}px` }} />
                    <span className="text-[10px] text-muted-foreground">{d.day.slice(8)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Sales by category">
              {data.categories.length === 0 ? <p className="text-sm text-muted-foreground">No sales yet.</p> : (
                <ul className="space-y-1.5 text-sm">
                  {data.categories.map((c) => (
                    <li key={c.category} className="flex justify-between">
                      <span>{c.category}</span>
                      <span className="tabular-nums text-muted-foreground">{c.units} units · {formatINR(c.revenue)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Return reasons">
              {data.returnReasons.length === 0 ? <p className="text-sm text-muted-foreground">No returns yet.</p> : (
                <ul className="space-y-1.5 text-sm">
                  {data.returnReasons.map((r) => (
                    <li key={r.reason} className="flex justify-between">
                      <span>{r.reason}</span>
                      <span className="tabular-nums text-muted-foreground">{r.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
          <RumCard />
        </>
      ) : !error ? (
        <div className="h-56 animate-pulse rounded-xl bg-muted" />
      ) : null}
    </div>
  );
}

/** §7 real-user Core Web Vitals (p75, last 7 days) — green when within target. */
function RumCard() {
  const { data, error, reload } = useAdminData<{ rows: { route: string; device: string; metric: string; p75: number; samples: number; good: boolean }[] }>("/api/admin/rum");
  const fmt = (metric: string, v: number) => (metric === "CLS" ? v.toFixed(2) : v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v)} ms`);
  if (error) return <ErrorState message={error} onRetry={reload} />;
  return (
    <DataTable
      rows={data?.rows ?? null}
      rowKey={(r) => `${r.route}|${r.device}|${r.metric}`}
      empty={{ title: "No speed data yet", description: "Real-visit measurements (LCP, INP, CLS) appear here as shoppers browse." }}
      columns={[
        { key: "r", header: "Real-user speed · route", cell: (r) => r.route },
        { key: "d", header: "Device", cell: (r) => r.device },
        { key: "m", header: "Metric", cell: (r) => r.metric },
        { key: "v", header: "p75", cell: (r) => <StatusBadge status={r.good ? "ok" : "slow"} tone={r.good ? "success" : "danger"} label={fmt(r.metric, r.p75)} /> },
        { key: "n", header: "Visits", cell: (r) => r.samples, className: "text-right" },
      ]}
    />
  );
}

// ── Staff & audit ────────────────────────────────────────────────────────────────────────────────

interface StaffRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  mfa: boolean;
  disabled: boolean;
  lastLoginAt: string | null;
}

export function StaffScreen() {
  const { me } = useAdmin();
  const { data, error, busy, reload } = useAdminData<{ staff: StaffRow[]; invites: { email: string; role: Role; expiresAt: string }[] }>("/api/admin/staff");
  const [form, setForm] = useState({ email: "", name: "", role: "support" as Role });
  const [link, setLink] = useState<string | null>(null);
  const roleOptions = ROLES.map((r) => ({ value: r, label: ROLE_META[r].label }));
  return (
    <div className="space-y-5">
      <PageHeader title="Staff" description="Everyone signs in with a password and an authenticator code. Invite links work once and expire in 24 hours." />
      <Card title="Invite someone">
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await act<{ invitePath: string }>("/api/admin/staff", form, "Invite created", reload);
            if (r) {
              setLink(`${window.location.origin}${r.invitePath}`);
              setForm({ email: "", name: "", role: "support" });
            }
          }}
        >
          <div className="space-y-1.5">
            <ALabel htmlFor="inv-name">Name</ALabel>
            <AInput id="inv-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <ALabel htmlFor="inv-email">Work email</ALabel>
            <AInput id="inv-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <ASelect label="Role" value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v as Role }))} options={roleOptions} />
          <AButton type="submit">Create invite</AButton>
        </form>
        {link ? (
          <div className="mt-3 rounded-md border border-border bg-muted/40 p-3 text-xs">
            <p className="font-medium">Send this link privately — it&apos;s shown only once:</p>
            <p className="mt-1 select-all break-all font-mono">{link}</p>
          </div>
        ) : null}
      </Card>
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <DataTable
          rows={data?.staff ?? null}
          busy={busy}
          rowKey={(r) => r.id}
          empty={{ title: "No staff", description: "Invite your team above." }}
          columns={[
            { key: "n", header: "Name", cell: (r) => r.name },
            { key: "e", header: "Email", cell: (r) => r.email },
            { key: "r", header: "Role", cell: (r) => <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", ROLE_META[r.role].color)}>{ROLE_META[r.role].label}</span> },
            { key: "m", header: "2-step", cell: (r) => (r.mfa ? <StatusBadge status="on" tone="success" label="on" /> : <StatusBadge status="pending" tone="pending" label="not set up" />) },
            { key: "l", header: "Last sign-in", cell: (r) => (r.lastLoginAt ? date(r.lastLoginAt, true) : "—") },
            {
              key: "x",
              header: "",
              className: "text-right",
              cell: (r) =>
                r.id === me.staff.id ? (
                  <span className="text-xs text-muted-foreground">You</span>
                ) : (
                  <span className="flex justify-end gap-1">
                    <ASelect label={`Role for ${r.name}`} className="h-8 w-36" value={r.role} onValueChange={(v) => act(`/api/admin/staff/${r.id}`, { role: v }, "Role changed — they've been signed out", reload)} options={roleOptions} />
                    <Confirm trigger={<AButton size="sm" variant="ghost">Reset 2-step</AButton>} title="Reset two-step verification?" description="They'll set it up again at their next sign-in, and are signed out now." confirmLabel="Reset" onConfirm={() => act(`/api/admin/staff/${r.id}`, { resetMfa: true }, "2-step reset", reload)} />
                    <Confirm trigger={<AButton size="sm" variant={r.disabled ? "secondary" : "ghost"}>{r.disabled ? "Enable" : "Disable"}</AButton>} title={r.disabled ? "Enable this account?" : "Disable this account?"} description={r.disabled ? "They can sign in again." : "They're signed out everywhere and can't sign in."} confirmLabel={r.disabled ? "Enable" : "Disable"} destructive={!r.disabled} onConfirm={() => act(`/api/admin/staff/${r.id}`, { disabled: !r.disabled }, "Saved", reload)} />
                  </span>
                ),
            },
          ]}
        />
      )}
      {data?.invites.length ? (
        <Card title="Open invites">
          <ul className="space-y-1 text-sm">
            {data.invites.map((i) => (
              <li key={i.email} className="flex justify-between">
                <span>{i.email} · {ROLE_META[i.role].label}</span>
                <span className="text-xs text-muted-foreground">expires {date(i.expiresAt, true)}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

export function AuditScreen() {
  const { params, set } = useUrlFilters("/admin/audit");
  const target = params.get("target") ?? "";
  const { data, error, busy, reload } = useAdminData<{ rows: { id: string; at: string; actorEmail: string; action: string; target: string; details: Record<string, unknown>; ip: string }[] }>(`/api/admin/audit${target ? `?target=${encodeURIComponent(target)}` : ""}`);
  return (
    <div className="space-y-5">
      <PageHeader title="Audit log" description="Every staff action, append-only. Filter by the record it touched." />
      <div className="flex flex-wrap gap-3">
        <SearchBox value={target} onChange={(v) => set({ target: v || null })} placeholder="Order number, customer id, SKU…" />
      </div>
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <DataTable
          rows={data?.rows ?? null}
          busy={busy}
          rowKey={(r) => r.id}
          empty={{ title: "No entries", description: "Try another record id." }}
          columns={[
            { key: "a", header: "When", cell: (r) => date(r.at, true) },
            { key: "w", header: "Who", cell: (r) => r.actorEmail },
            { key: "x", header: "Action", cell: (r) => r.action },
            { key: "t", header: "Record", cell: (r) => r.target },
            { key: "d", header: "Details", cell: (r) => <span className="text-xs">{Object.entries(r.details).map(([k, v]) => `${k}: ${String(v)}`).join(" · ")}</span> },
            { key: "i", header: "IP", cell: (r) => r.ip },
          ]}
        />
      )}
    </div>
  );
}

// ── #WearTheHood moderation (LOY-03 / HOME-10) ───────────────────────────────────────────────────

interface UgcRow {
  id: string;
  displayName: string;
  caption: string;
  productIds: string[];
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  photo: string;
}

export function UgcScreen() {
  const { params, set } = useUrlFilters("/admin/ugc");
  const status = params.get("status") ?? "pending";
  const { data, error, busy, reload } = useAdminData<{ posts: UgcRow[] }>(`/api/admin/ugc?status=${status}`);
  return (
    <div className="space-y-5">
      <PageHeader title="#WearTheHood" description="Customer photos wait here until approved. Approve only real customer fits: no other people's faces, no children, nothing offensive. Approving gives Alpha Club members 50 Hood Coins." />
      <div className="flex flex-wrap gap-3">
        <ASelect label="Status" className="w-40" value={status} onValueChange={(v) => set({ status: v })} options={[{ value: "pending", label: "To review" }, { value: "approved", label: "Live" }, { value: "rejected", label: "Rejected" }]} />
      </div>
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      ) : data.posts.length === 0 ? (
        <EmptyState title="Nothing here" description={status === "pending" ? "No photos waiting for review." : "Try another status."} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy={busy}>
          {data.posts.map((p) => (
            <li key={p.id} className="overflow-hidden rounded-xl border border-border bg-card">
              {/* eslint-disable-next-line @next/next/no-img-element -- private moderation preview from our API */}
              <img src={p.photo} alt={`Photo by ${p.displayName}`} className="aspect-[4/5] w-full bg-muted object-cover" />
              <div className="space-y-2 p-3 text-sm">
                <p>
                  <b>{p.displayName}</b> · {date(p.createdAt, true)}
                </p>
                {p.caption ? <p className="text-muted-foreground">{p.caption}</p> : null}
                <p className="text-xs text-muted-foreground">{p.productIds.length} product(s) tagged</p>
                <div className="flex gap-2">
                  {p.status !== "approved" ? (
                    <AButton size="sm" onClick={() => act(`/api/admin/ugc/${p.id}`, { decision: "approve" }, "Approved — now live", reload)}>
                      Approve
                    </AButton>
                  ) : null}
                  {p.status !== "rejected" ? (
                    <Confirm trigger={<AButton size="sm" variant="ghost">{p.status === "approved" ? "Take down" : "Reject"}</AButton>} title={p.status === "approved" ? "Take this photo down?" : "Reject this photo?"} description="It won't show on the site. The customer still sees it in their account." confirmLabel={p.status === "approved" ? "Take down" : "Reject"} destructive onConfirm={() => act(`/api/admin/ugc/${p.id}`, { decision: "reject" }, "Rejected", reload)} />
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Gift cards (PROMO-06) ──────────────────────────────────────────────────────────────────────────

interface GiftRow {
  id: string;
  last4: string;
  initial: number;
  balance: number;
  issuedAt: string;
  expiresAt: string;
  issuedBy: string;
  note: string;
  disabled: boolean;
}

export function GiftCardsScreen() {
  const { data, error, busy, reload } = useAdminData<{ cards: GiftRow[]; rules: { min: number; max: number; validityDays: number } }>("/api/admin/giftcards");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [issued, setIssued] = useState<string | null>(null);
  return (
    <div className="space-y-5">
      <PageHeader title="Gift cards" description="Issue digital gift cards (e.g. goodwill or prizes). The code is shown once — send it to the customer privately. Customers redeem it at checkout, partly or fully." />
      <Card title="Issue a gift card">
        <form
          className="grid gap-3 sm:grid-cols-[160px_1fr_auto] sm:items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await act<{ code: string }>("/api/admin/giftcards", { amount: Number(amount), note }, "Gift card issued", reload);
            if (r) {
              setIssued(r.code);
              setAmount("");
              setNote("");
            }
          }}
        >
          <div className="space-y-1.5">
            <ALabel htmlFor="gc-amt">Amount (₹)</ALabel>
            <AInput id="gc-amt" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} placeholder={data ? `${data.rules.min / 100}–${data.rules.max / 100}` : ""} />
          </div>
          <div className="space-y-1.5">
            <ALabel htmlFor="gc-note">Reason</ALabel>
            <AInput id="gc-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Late delivery goodwill, order AH…" />
          </div>
          <AButton type="submit" disabled={!amount || note.trim().length < 3}>
            Issue
          </AButton>
        </form>
        {issued ? (
          <div className="mt-3 rounded-md border border-border bg-muted/40 p-3 text-sm">
            <p className="font-medium">Gift card code — shown only once:</p>
            <p className="mt-1 select-all font-mono text-base tracking-wider">{issued}</p>
            <p className="mt-1 text-xs text-muted-foreground">Valid {data?.rules.validityDays ?? 365} days. Anyone with this code can spend it.</p>
          </div>
        ) : null}
      </Card>
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <DataTable
          rows={data?.cards ?? null}
          busy={busy}
          rowKey={(r) => r.id}
          empty={{ title: "No gift cards yet", description: "Issued cards appear here (last 4 characters only)." }}
          columns={[
            { key: "c", header: "Card", cell: (r) => `••••${r.last4}` },
            { key: "b", header: "Balance / value", cell: (r) => `${formatINR(r.balance)} / ${formatINR(r.initial)}` },
            { key: "e", header: "Expires", cell: (r) => date(r.expiresAt) },
            { key: "n", header: "Reason", cell: (r) => <span className="text-xs">{r.note} · {r.issuedBy}</span> },
            { key: "s", header: "Status", cell: (r) => <StatusBadge status={r.disabled ? "blocked" : "active"} tone={r.disabled ? "danger" : "success"} label={r.disabled ? "blocked" : "active"} /> },
            {
              key: "x",
              header: "",
              className: "text-right",
              cell: (r) => (
                <Confirm
                  trigger={<AButton size="sm" variant="ghost">{r.disabled ? "Unblock" : "Block"}</AButton>}
                  title={r.disabled ? "Unblock this card?" : "Block this card?"}
                  description={r.disabled ? "It can be used again." : "It can't be used at checkout until unblocked (e.g. reported lost)."}
                  confirmLabel={r.disabled ? "Unblock" : "Block"}
                  destructive={!r.disabled}
                  onConfirm={() => act(`/api/admin/giftcards/${r.id}`, { disabled: !r.disabled }, "Saved", reload)}
                />
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
