"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/components/checkout/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatINR } from "@/lib/format";
import { dateLabel } from "./labels";

interface Invoice {
  number: string;
  issuedAt: string;
  orderNumber: string;
  orderDate: string;
  seller: { name: string; address: string; gstin: string; state: string };
  buyer: { name: string; address: string; city: string; state: string; pincode: string };
  placeOfSupply: string;
  lines: { title: string; size: string; quantity: number; gstRate: number; taxable: number; cgst: number; sgst: number; igst: number; total: number }[];
  charges: { shipping: number; express: number; cod: number };
  totals: { gst: { cgst: number; sgst: number; igst: number; total: number }; total: number };
  /** How the invoice total was paid (wallet tenders don't change the taxable value). */
  paidBy?: { coins: number; giftCard: number; storeCredit: number; balance: number } | null;
  paymentMethod: string;
}

/** ACC-02 / CHK-10 printable GST tax invoice ("Save as PDF" from the print dialog). */
export function InvoiceView({ number }: { number: string }) {
  const [inv, setInv] = useState<Invoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ invoice: Invoice }>(`/api/orders/${encodeURIComponent(number)}/invoice`)
      .then((r) => setInv(r.invoice))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load the invoice."));
  }, [number]);
  if (error) return <p className="text-[14px]">{error}</p>;
  if (!inv) return <Skeleton className="h-96 w-full" />;
  const th = "border-b border-black px-2 py-2 text-left text-[11px] font-bold uppercase";
  const td = "border-b border-line px-2 py-2 text-[12.5px] align-top";
  return (
    <div>
      <div className="mb-4 flex gap-2 print:hidden">
        <Button size="sm" onClick={() => window.print()}>
          Print / save as PDF
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={`/account/orders/${number}`}>Back to order</Link>
        </Button>
      </div>
      <article className="border border-line bg-white p-5 lg:p-8 print:border-0 print:p-0">
        <header className="flex flex-wrap justify-between gap-4 border-b border-black pb-4">
          <div>
            <h2 className="font-display text-[28px] uppercase leading-none">Tax invoice</h2>
            <p className="mt-2 text-[12.5px]">
              Invoice <b>{inv.number}</b> · {dateLabel(inv.issuedAt)}
              <br />
              Order {inv.orderNumber} · {dateLabel(inv.orderDate)}
            </p>
          </div>
          <div className="max-w-[300px] text-[12.5px]">
            <p className="font-bold">{inv.seller.name}</p>
            <p>{inv.seller.address}</p>
            <p>GSTIN {inv.seller.gstin}</p>
          </div>
        </header>
        <section className="grid gap-4 py-4 text-[12.5px] sm:grid-cols-2">
          <div>
            <p className="font-bold uppercase">Bill / ship to</p>
            <p>{inv.buyer.name}</p>
            <p>{inv.buyer.address}</p>
            <p>
              {inv.buyer.city}, {inv.buyer.state} {inv.buyer.pincode}
            </p>
          </div>
          <div>
            <p>Place of supply: {inv.placeOfSupply}</p>
            <p>Payment: {inv.paymentMethod.toUpperCase()}</p>
            <p>Prices are inclusive of GST.</p>
          </div>
        </section>
        <div className="overflow-x-auto">
          <table className="tabular w-full min-w-[620px] border-collapse">
            <thead>
              <tr>
                <th className={th}>Item</th>
                <th className={th}>Qty</th>
                <th className={th}>Taxable</th>
                <th className={th}>GST %</th>
                <th className={th}>CGST</th>
                <th className={th}>SGST</th>
                <th className={th}>IGST</th>
                <th className={th}>Total</th>
              </tr>
            </thead>
            <tbody>
              {inv.lines.map((l, i) => (
                <tr key={i}>
                  <td className={td}>
                    {l.title} · {l.size}
                  </td>
                  <td className={td}>{l.quantity}</td>
                  <td className={td}>{formatINR(l.taxable)}</td>
                  <td className={td}>{l.gstRate}%</td>
                  <td className={td}>{formatINR(l.cgst)}</td>
                  <td className={td}>{formatINR(l.sgst)}</td>
                  <td className={td}>{formatINR(l.igst)}</td>
                  <td className={td}>{formatINR(l.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="tabular ml-auto mt-4 max-w-[320px] space-y-1 text-[12.5px]">
          {inv.charges.shipping ? (
            <div className="flex justify-between">
              <dt>Shipping</dt>
              <dd>{formatINR(inv.charges.shipping)}</dd>
            </div>
          ) : null}
          {inv.charges.express ? (
            <div className="flex justify-between">
              <dt>Express delivery</dt>
              <dd>{formatINR(inv.charges.express)}</dd>
            </div>
          ) : null}
          {inv.charges.cod ? (
            <div className="flex justify-between">
              <dt>COD fee</dt>
              <dd>{formatINR(inv.charges.cod)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between">
            <dt>Total GST</dt>
            <dd>{formatINR(inv.totals.gst.total)}</dd>
          </div>
          <div className="flex justify-between border-t border-black pt-1 text-[14px] font-bold">
            <dt>Invoice total</dt>
            <dd>{formatINR(inv.totals.total)}</dd>
          </div>
        </dl>
        {inv.paidBy ? (
          <p className="mt-3 text-[12px] text-ink-2">
            Paid by: {[inv.paidBy.giftCard ? `gift card ${formatINR(inv.paidBy.giftCard)}` : "", inv.paidBy.storeCredit ? `store credit ${formatINR(inv.paidBy.storeCredit)}` : "", inv.paidBy.coins ? `Hood Coins ${formatINR(inv.paidBy.coins)}` : "", inv.paidBy.balance ? `${formatINR(inv.paidBy.balance)} by ${"card / UPI / cash"}` : ""].filter(Boolean).join(" · ")}
          </p>
        ) : null}
        <p className="mt-6 text-[11px] text-ink-2">This is a computer-generated invoice. DRAFT layout — to be confirmed by the CA before launch.</p>
      </article>
    </div>
  );
}
