"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/components/checkout/api";
import { GarmentArt } from "@/components/store/garment-art";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/format";
import { useMe } from "./account-frame";
import { dateLabel, orderBadge } from "./labels";

export interface OrderSummaryRow {
  number: string;
  createdAt: string;
  status: string;
  fulfilment: string;
  total: number;
  itemCount: number;
  images: { art: string; colour: string; alt: string }[];
  deliveryBy: string | null;
}

export function OrdersList({ limit }: { limit?: number }) {
  const [orders, setOrders] = useState<OrderSummaryRow[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    api<{ orders: OrderSummaryRow[] }>("/api/account/orders")
      .then((r) => setOrders(r.orders))
      .catch(() => setError(true));
  }, []);
  if (error) return <p className="text-[13px] text-ink-2">Couldn&apos;t load your orders.</p>;
  if (!orders) return <p className="text-[13px] text-ink-2">Loading orders…</p>;
  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 border border-line p-5">
        <p className="text-[14px]">No orders yet.</p>
        <Button asChild size="sm">
          <Link href="/collections/new-in">Start shopping</Link>
        </Button>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-line border-y border-line">
      {orders.slice(0, limit).map((o) => (
        <li key={o.number}>
          <Link href={`/account/orders/${o.number}`} className="flex items-center gap-4 py-4 hover:bg-soft">
            <div className="flex -space-x-4">
              {o.images.map((img, i) => (
                <GarmentArt key={i} image={{ art: img.art as never, colour: img.colour, alt: "" }} className="h-16 w-12 border-2 border-white" />
              ))}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold">{orderBadge(o)}</p>
              <p className="text-[12px] text-ink-2">
                {o.number} · {dateLabel(o.createdAt)} · {o.itemCount} {o.itemCount === 1 ? "item" : "items"}
              </p>
            </div>
            <span className="tabular text-[13.5px] font-semibold">{formatINR(o.total)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function AccountOverview() {
  const { me } = useMe();
  return (
    <div className="space-y-8">
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="border border-line p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-2">Signed in as</p>
          <p className="mt-1 text-[14px] font-semibold">{me.customer.name ?? me.customer.phone}</p>
          {me.customer.name ? <p className="text-[12px] text-ink-2">{me.customer.phone}</p> : null}
        </div>
        <div className="border border-line p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-2">Store credit</p>
          <p className="tabular mt-1 text-[18px] font-bold">{formatINR(me.storeCredit.balance)}</p>
        </div>
        <div className="border border-line p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-2">Saved addresses</p>
          <p className="mt-1 text-[18px] font-bold">{me.customer.addresses.length}</p>
        </div>
      </section>
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.12em]">Recent orders</h2>
          <Link href="/account/orders" className="text-[11.5px] font-bold uppercase tracking-[0.1em] underline underline-offset-4">
            View all
          </Link>
        </div>
        <OrdersList limit={3} />
      </section>
    </div>
  );
}
