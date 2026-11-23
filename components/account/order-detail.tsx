"use client";

import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/components/checkout/api";
import { formatDeliveryDate } from "@/components/pdp/use-delivery";
import { GarmentArt } from "@/components/store/garment-art";
import { showMessageToast } from "@/components/store/toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import type { orderDetail } from "@/lib/account/service";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { dateLabel, FULFILMENT_LABEL, orderBadge, RETURN_STATUS_LABEL } from "./labels";

export type OrderDetail = ReturnType<typeof orderDetail>;

const STEPS = ["placed", "confirmed", "packed", "shipped", "out_for_delivery", "delivered"] as const;

export function useOrder(number: string) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setOrder((await api<{ order: OrderDetail }>(`/api/orders/${encodeURIComponent(number)}`)).order);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 404 ? "Order not found." : "Couldn't load this order.");
    }
  }, [number]);
  useEffect(() => {
    let cancelled = false;
    api<{ order: OrderDetail }>(`/api/orders/${encodeURIComponent(number)}`)
      .then((r) => !cancelled && setOrder(r.order))
      .catch((e) => !cancelled && setError(e instanceof ApiError && e.status === 404 ? "Order not found." : "Couldn't load this order."));
    return () => {
      cancelled = true;
    };
  }, [number]);
  return { order, error, reload: load };
}

/** ORD-01 timeline + tracking, ORD-04 cancel, ACC-02 invoice, RET-01 returns on one page. */
export function OrderDetailView({ number }: { number: string }) {
  const { order, error, reload } = useOrder(number);
  const [busy, setBusy] = useState(false);

  if (error) return <p className="text-[14px]">{error}</p>;
  if (!order) return <Skeleton className="h-96 w-full" />;

  const cancel = async () => {
    setBusy(true);
    try {
      await api(`/api/orders/${order.number}/cancel`, { method: "POST", body: {} });
      showMessageToast(order.paymentMethod === "cod" ? "Order cancelled" : "Order cancelled — refund started to your original payment method");
      await reload();
    } catch (e) {
      showMessageToast(e instanceof ApiError ? e.message : "Couldn't cancel the order.");
    } finally {
      setBusy(false);
    }
  };

  const cancelReturn = async (rn: string) => {
    try {
      await api(`/api/returns/${rn}/cancel`, { method: "POST", body: {} });
      showMessageToast("Return cancelled");
      await reload();
    } catch (e) {
      showMessageToast(e instanceof ApiError ? e.message : "Couldn't cancel the return.");
    }
  };

  const reached = new Map(order.timeline.map((t) => [t.status, t.at]));
  const terminal = ["cancelled", "rto", "returned"].includes(order.fulfilment);

  return (
    <div className="space-y-6">
      <section className="border border-line p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[18px] font-bold">{orderBadge(order)}</p>
            <p className="text-[12.5px] text-ink-2">
              Order {order.number} · placed {dateLabel(order.createdAt)}
            </p>
            {order.delivery.by && !terminal && order.fulfilment !== "delivered" ? (
              <p className="mt-1 text-[13px]">
                Arriving by <b className="text-green">{formatDeliveryDate(order.delivery.by)}</b>
              </p>
            ) : null}
            {order.tracking ? (
              <p className="mt-1 text-[12.5px] text-ink-2">
                {order.tracking.courier} · AWB <span className="tabular">{order.tracking.awb}</span>
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {order.invoice ? (
              <Button asChild size="sm" variant="outline">
                <Link href={`/account/orders/${order.number}/invoice`}>Invoice</Link>
              </Button>
            ) : null}
            {order.canCancel ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" loading={busy}>
                    Cancel order
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogTitle>Cancel this order?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {order.paymentMethod === "cod"
                      ? "Nothing has been charged, so there's nothing to refund."
                      : `We'll refund ${formatINR(order.totals.paid - order.totals.refunded)} to your original payment method. Banks usually take 5–7 working days.`}
                  </AlertDialogDescription>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep order</AlertDialogCancel>
                    <AlertDialogAction onClick={cancel}>Cancel order</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
            {order.returnWindow.open ? (
              <Button asChild size="sm">
                <Link href={`/account/orders/${order.number}/return`}>Return / exchange</Link>
              </Button>
            ) : null}
          </div>
        </div>

        {order.status === "confirmed" && !terminal ? (
          <ol aria-label="Order progress" className="mt-6 grid grid-cols-6 gap-1">
            {STEPS.map((s) => {
              const at = reached.get(s);
              return (
                <li key={s} className="flex flex-col gap-1.5">
                  <span aria-hidden="true" className={cn("h-1", at ? "bg-black" : "bg-line")} />
                  <span className={cn("text-[10.5px] font-semibold uppercase tracking-[0.06em] lg:text-[11px]", at ? "text-ink" : "text-muted")}>
                    {FULFILMENT_LABEL[s]}
                  </span>
                  {at ? <span className="hidden text-[11px] text-ink-2 sm:block">{dateLabel(at)}</span> : null}
                </li>
              );
            })}
          </ol>
        ) : null}

        {order.returnWindow.open && order.returnWindow.closesAt ? (
          <p className="mt-4 text-[12.5px] text-ink-2">Returns and size exchanges are open until {dateLabel(order.returnWindow.closesAt)}.</p>
        ) : order.returnWindow.reason && order.fulfilment === "delivered" ? (
          <p className="mt-4 text-[12.5px] text-ink-2">{order.returnWindow.reason}</p>
        ) : null}
      </section>

      {order.returns.length ? (
        <section className="border border-line p-5">
          <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[0.12em]">Returns &amp; exchanges</h2>
          <ul className="space-y-3">
            {order.returns.map((r) => (
              <li key={r.number} className="border border-line p-3.5 text-[13px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p>
                    <b>{RETURN_STATUS_LABEL[r.status]}</b> · {r.number} · {r.resolution === "exchange" ? "Size exchange" : r.refundTo === "store_credit" ? "Store credit" : r.refundTo === "upi" ? `Refund to ${r.upiId}` : "Refund to original payment"}
                  </p>
                  {r.status === "pickup_scheduled" ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost">
                          Cancel return
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogTitle>Cancel this return?</AlertDialogTitle>
                        <AlertDialogDescription>The pickup will be cancelled. You can request again while the return window is open.</AlertDialogDescription>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep return</AlertDialogCancel>
                          <AlertDialogAction onClick={() => cancelReturn(r.number)}>Cancel return</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : null}
                </div>
                <p className="mt-1 text-ink-2">
                  Pickup {formatDeliveryDate(r.pickup.date)} ({r.pickup.slot}) · {r.pickup.courier} AWB <span className="tabular">{r.pickup.awb}</span>
                </p>
                {r.resolution !== "exchange" ? (
                  <p className="tabular mt-1">
                    {r.refundTo === "store_credit" ? "Credit" : "Refund"}: <b>{formatINR(r.amounts.payable + r.amounts.bonus)}</b>
                    {r.amounts.bonus ? <span className="text-green"> (incl. {formatINR(r.amounts.bonus)} bonus)</span> : null}
                    {r.amounts.fee ? <span className="text-ink-2"> · return fee {formatINR(r.amounts.fee)}</span> : null}
                  </p>
                ) : null}
                <p className="mt-1 text-[12px] text-ink-2">{r.timeline.at(-1)?.note ?? ""}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="border border-line">
        <ul>
          {order.lines.map((l) => (
            <li key={l.lineId} className="grid grid-cols-[64px_1fr_auto] items-center gap-3 border-b border-line px-5 py-3 last:border-0">
              <GarmentArt image={{ art: l.image.art as never, colour: l.image.colour, alt: "" }} className="h-20" />
              <div className="min-w-0 text-[13.5px]">
                {l.handle ? (
                  <Link href={`/products/${l.handle}`} className="hover:underline">
                    {l.title}
                  </Link>
                ) : (
                  l.title
                )}
                <span className="block text-[12px] text-muted">
                  Size {l.size} · Qty {l.quantity}
                </span>
              </div>
              <p className="tabular text-[13.5px] font-semibold">{formatINR(l.net)}</p>
            </li>
          ))}
        </ul>
        <dl className="tabular space-y-1.5 border-t border-line px-5 py-4 text-[13.5px]">
          {order.tenders ? (
            <div className="flex justify-between">
              <dt>Order total</dt>
              <dd>{formatINR(order.totals.total)}</dd>
            </div>
          ) : null}
          {order.tenders ? (
            <>
              {order.tenders.giftCard ? (
                <div className="flex justify-between text-green">
                  <dt>Gift card ••••{order.tenders.giftCardLast4}</dt>
                  <dd>−{formatINR(order.tenders.giftCard)}</dd>
                </div>
              ) : null}
              {order.tenders.storeCredit ? (
                <div className="flex justify-between text-green">
                  <dt>Store credit</dt>
                  <dd>−{formatINR(order.tenders.storeCredit)}</dd>
                </div>
              ) : null}
              {order.tenders.coins ? (
                <div className="flex justify-between text-green">
                  <dt>Hood Coins ({order.tenders.coins})</dt>
                  <dd>−{formatINR(order.tenders.coins * 100)}</dd>
                </div>
              ) : null}
            </>
          ) : null}
          <div className="flex justify-between font-bold">
            <dt>{order.paymentMethod === "cod" && order.totals.payable > 0 ? "To pay on delivery" : order.tenders ? "Paid by card / UPI" : "Paid"}</dt>
            <dd>{formatINR(order.totals.payable)}</dd>
          </div>
          {order.refunds.map((r, i) => (
            <div key={i} className="flex justify-between text-green">
              <dt className="flex items-center gap-1.5">
                <Icon icon={CheckmarkCircle02Icon} size={14} />
                {r.to === "store_credit" ? "Store credit" : r.to === "upi" ? "Refund to UPI" : r.to === "coins" ? "Hood Coins returned" : r.to === "gift_card" ? "Back to gift card" : "Refund to original payment"} · {r.status === "payout_pending" ? "queued" : r.status}
              </dt>
              <dd>{formatINR(r.amount)}</dd>
            </div>
          ))}
          <p className="text-[11.5px] text-ink-2">Includes GST of {formatINR(order.totals.gst)}.</p>
        </dl>
        <p className="border-t border-line px-5 py-3 text-[12.5px] text-ink-2">
          Delivering to {order.address.name}, {order.address.line1}, {order.address.city} {order.address.pincode}
        </p>
      </section>

      <section className="border border-line p-5">
        <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[0.12em]">History</h2>
        <ol className="space-y-1.5 text-[12.5px]">
          {[...order.timeline].reverse().map((t, i) => (
            <li key={i} className="flex gap-3">
              <span className="tabular w-[150px] shrink-0 text-ink-2">{dateLabel(t.at, true)}</span>
              <span>
                {FULFILMENT_LABEL[t.status] ?? t.status}
                {t.note ? <span className="text-ink-2"> · {t.note}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
