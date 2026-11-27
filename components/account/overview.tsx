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

const SHORTCUTS = [
  { href: "/account/orders", label: "Orders & returns", hint: "Track, cancel, return or exchange" },
  { href: "/account/reviews", label: "My reviews", hint: "Review what you received" },
  { href: "/account/addresses", label: "Addresses", hint: "Yours and people you order for" },
  { href: "/wishlist", label: "Wishlist", hint: "Saved for later" },
  { href: "/account/alerts", label: "Alerts", hint: "Back in stock and price drops" },
  { href: "/account/club", label: "Alpha Club", hint: "Hood Coins and rewards" },
  { href: "/account/wear-the-hood", label: "#WearTheHood", hint: "Share your fit" },
  { href: "/account/help", label: "Help & feedback", hint: "Write to us, read our replies" },
  { href: "/account/settings", label: "Settings & privacy", hint: "Profile, sign-in, notifications, your data" },
] as const;

export function AccountOverview() {
  const { me } = useMe();
  const [toReview, setToReview] = useState<number | null>(null);
  useEffect(() => {
    api<{ toReview: unknown[] }>("/api/account/reviews")
      .then((r) => setToReview(r.toReview.length))
      .catch(() => setToReview(null));
  }, []);
  const defaultAddress = me.customer.addresses.find((a) => a.isDefault) ?? me.customer.addresses[0];
  return (
    <div className="space-y-8">
      {me.customer.email && !me.customer.emailVerified ? (
        <p className="border border-black px-3 py-2.5 text-[13px]">
          <b>Confirm your email</b> so we can send your order updates to {me.customer.email}.{" "}
          <Link href="/account/settings" className="font-semibold underline underline-offset-2">
            Verify now
          </Link>
        </p>
      ) : null}
      {toReview ? (
        <p className="border border-line bg-soft px-3 py-2.5 text-[13px]">
          {toReview} {toReview === 1 ? "item is" : "items are"} waiting for your review.{" "}
          <Link href="/account/reviews" className="font-semibold underline underline-offset-2">
            Write a review
          </Link>
        </p>
      ) : null}
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="border border-line p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-2">Signed in as</p>
          <p className="mt-1 break-all text-[14px] font-semibold">{me.customer.name ?? me.customer.phone ?? me.customer.email}</p>
          {me.customer.name && (me.customer.phone ?? me.customer.email) ? <p className="break-all text-[12px] text-ink-2">{me.customer.phone ?? me.customer.email}</p> : null}
        </div>
        <div className="border border-line p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-2">Store credit</p>
          <p className="tabular mt-1 text-[18px] font-bold">{formatINR(me.storeCredit.balance)}</p>
        </div>
        <div className="border border-line p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-2">Default address</p>
          {defaultAddress ? (
            <p className="mt-1 truncate text-[13px]">
              <b>{defaultAddress.name}</b>, {defaultAddress.city} {defaultAddress.pincode}
            </p>
          ) : (
            <Link href="/account/addresses" className="mt-1 inline-block text-[13px] font-semibold underline underline-offset-2">
              Add an address
            </Link>
          )}
        </div>
      </section>
      <nav aria-label="Your account">
        <ul className="grid gap-2 sm:grid-cols-3">
          {SHORTCUTS.map((s) => (
            <li key={s.href}>
              <Link href={s.href} className="block h-full border border-line p-3 hover:border-black">
                <span className="block text-[13px] font-bold uppercase tracking-[0.08em]">{s.label}</span>
                <span className="mt-0.5 block text-[12px] text-ink-2">{s.hint}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
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
