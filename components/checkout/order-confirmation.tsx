"use client";

import { CheckmarkCircle02Icon, Clock01Icon, Alert02Icon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatDeliveryDate } from "@/components/pdp/use-delivery";
import { GarmentArt } from "@/components/store/garment-art";
import { useStoreUI } from "@/components/store/store-ui-provider";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { track } from "@/lib/analytics/client";
import { formatINR } from "@/lib/format";
import type { publicOrder } from "@/lib/orders/store";
import { api, ApiError, safeRedirect } from "./api";

type Order = ReturnType<typeof publicOrder>;
const POLL_MS = 3_000;
const MAX_POLLS = 20;

/**
 * CHK-09 confirmation: order number, items, delivery date, payment status. Waits for the payment webhook
 * (polls briefly), offers a retry after a failed payment (CHK-06), and never shows another customer's order.
 */
export function OrderConfirmation() {
  const { number } = useParams<{ number: string }>();
  const router = useRouter();
  const { refreshCart } = useStoreUI();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [polls, setPolls] = useState(0);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<{ order: Order }>(`/api/orders/${encodeURIComponent(number)}`)
      .then((r) => {
        if (cancelled) return;
        setOrder(r.order);
        if (r.order.status === "confirmed") void refreshCart();
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError && e.status === 401 ? "Please verify your phone to see this order." : "We couldn't find this order.");
      });
    return () => {
      cancelled = true;
    };
  }, [number, polls, refreshCart]);

  // ANL-01 purchase: only once the order is confirmed (paid, or COD placed); once per device per order.
  // Meta dedupes against the server Conversions API event by the same event id (lib/analytics/server.ts).
  useEffect(() => {
    if (order?.status !== "confirmed") return;
    track("purchase", {
      orderNumber: order.number,
      value: order.totals.total,
      tax: order.totals.gst,
      shipping: order.totals.shipping + order.totals.expressFee,
      paymentType: order.paymentMethod,
      items: order.lines.map((l) => ({ id: l.productId, name: l.title, variant: l.size, quantity: l.quantity, price: Math.round(l.net / Math.max(1, l.quantity)) })),
    });
  }, [order]);

  useEffect(() => {
    if (order?.status !== "pending_payment" || polls >= MAX_POLLS) return;
    const t = window.setTimeout(() => setPolls((p) => p + 1), POLL_MS);
    return () => window.clearTimeout(t);
  }, [order, polls]);

  const retry = async () => {
    setRetrying(true);
    try {
      const r = await api<{ redirectUrl: string }>("/api/checkout/retry", { method: "POST", body: { orderNumber: number } });
      router.push(safeRedirect(r.redirectUrl));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't start the payment.");
      setRetrying(false);
    }
  };

  if (error) {
    return (
      <div className="mx-auto flex max-w-[520px] flex-col items-center gap-4 px-4 py-20 text-center">
        <p className="text-[14px]">{error}</p>
        <Button asChild variant="outline">
          <Link href="/">Continue shopping</Link>
        </Button>
      </div>
    );
  }
  if (!order) {
    return (
      <div className="mx-auto max-w-[720px] space-y-4 px-4 py-12" aria-busy="true">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const status = {
    confirmed: { icon: CheckmarkCircle02Icon, tone: "text-green", title: "Order confirmed", text: "Thank you! We'll SMS you when it ships, with a tracking link." },
    pending_payment: { icon: Clock01Icon, tone: "text-ink", title: "Confirming your payment", text: polls >= MAX_POLLS ? "This is taking longer than usual. If money left your account, your order will confirm automatically — or be refunded." : "This usually takes a few seconds." },
    payment_failed: { icon: Alert02Icon, tone: "text-accent", title: "Payment didn't go through", text: "No money was taken. Your items are saved — try again or pick another method." },
    expired: { icon: Alert02Icon, tone: "text-accent", title: "Payment window closed", text: "We held your items for 15 minutes. Try paying again — if they're still in stock you're all set." },
    needs_review: { icon: Clock01Icon, tone: "text-ink", title: "We're checking your payment", text: "Our team is reviewing this order. If it can't be fulfilled, you'll get a full refund to the original method." },
  }[order.status];

  return (
    <div className="mx-auto max-w-[720px] px-4 py-8 lg:py-12">
      <section className="border border-line bg-white p-6 text-center lg:p-8" aria-live="polite">
        <Icon icon={status.icon} size={40} className={`mx-auto ${status.tone}`} />
        <h1 className="mt-3 font-display text-[32px] uppercase leading-none lg:text-[40px]">{status.title}</h1>
        <p className="mt-3 text-[14px] text-ink-2">{status.text}</p>
        <p className="tabular mt-4 text-[13px]">
          Order <b>{order.number}</b>
          {order.delivery.by && order.status === "confirmed" ? (
            <>
              {" "}
              · Arriving by <b className="text-green">{formatDeliveryDate(order.delivery.by)}</b>
            </>
          ) : null}
        </p>
        <p className="mt-1 text-[12.5px] text-ink-2">
          {order.paymentMethod === "cod" ? "Pay on delivery" : `Paid by ${order.paymentMethod.toUpperCase()}`} · Delivering to {order.address.name}, {order.address.city} {order.address.pincode}
        </p>
        {order.canRetryPayment ? (
          <Button className="mt-5" onClick={retry} loading={retrying}>
            Try payment again · {formatINR(order.totals.total)}
          </Button>
        ) : null}
      </section>

      <section aria-label="Items" className="mt-5 border border-line bg-white">
        <ul>
          {order.lines.map((l) => (
            <li key={`${l.title}-${l.size}`} className="grid grid-cols-[64px_1fr_auto] items-center gap-3 border-b border-line px-5 py-3 last:border-0">
              <GarmentArt image={{ art: l.image.art as never, colour: l.image.colour, alt: "" }} className="h-20" />
              <p className="text-[13.5px]">
                {l.title}
                <span className="block text-[12px] text-muted">
                  Size {l.size} · Qty {l.quantity}
                </span>
              </p>
              <p className="tabular text-[13.5px] font-semibold">{formatINR(l.net)}</p>
            </li>
          ))}
        </ul>
        <dl className="tabular space-y-1.5 border-t border-line px-5 py-4 text-[13.5px]">
          {order.totals.shipping ? (
            <div className="flex justify-between">
              <dt className="text-ink-2">Shipping</dt>
              <dd>{formatINR(order.totals.shipping)}</dd>
            </div>
          ) : null}
          {order.totals.expressFee ? (
            <div className="flex justify-between">
              <dt className="text-ink-2">Express delivery</dt>
              <dd>{formatINR(order.totals.expressFee)}</dd>
            </div>
          ) : null}
          {order.totals.codFee ? (
            <div className="flex justify-between">
              <dt className="text-ink-2">Cash on delivery fee</dt>
              <dd>{formatINR(order.totals.codFee)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between text-[15px] font-bold">
            <dt>{order.paymentMethod === "cod" ? "To pay on delivery" : "Total"}</dt>
            <dd>{formatINR(order.totals.total)}</dd>
          </div>
          <p className="text-[11.5px] text-ink-2">Includes GST of {formatINR(order.totals.gst)}. GST invoice is sent when your order ships.</p>
          {order.totals.savings > 0 ? <p className="text-[12.5px] font-semibold text-green">You saved {formatINR(order.totals.savings)}</p> : null}
        </dl>
      </section>

      <div className="mt-6 flex justify-center">
        <Button asChild variant="outline">
          <Link href="/">Continue shopping</Link>
        </Button>
      </div>
    </div>
  );
}
