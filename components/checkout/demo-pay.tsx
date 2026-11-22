"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/format";
import { api, ApiError } from "./api";

/**
 * DEMO payment page — stands in for the payment partner's hosted page in development / protected previews.
 * The API returns 404 on the live store. Outcomes go through the same signed-webhook handler as a real gateway.
 */
export function DemoPay() {
  const { paymentId } = useParams<{ paymentId: string }>();
  const router = useRouter();
  const [payment, setPayment] = useState<{ orderNumber: string; amount: number; method: string; status: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ payment: { orderNumber: string; amount: number; method: string; status: string } }>(`/api/payments/demo?paymentId=${encodeURIComponent(paymentId)}`)
      .then((r) => setPayment(r.payment))
      .catch(() => setError("This payment link isn't valid."));
  }, [paymentId]);

  const finish = async (outcome: "succeeded" | "failed") => {
    setBusy(true);
    try {
      const r = await api<{ orderNumber: string }>("/api/payments/demo", { method: "POST", body: { paymentId, outcome } });
      router.replace(`/checkout/order/${r.orderNumber}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong.");
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-[460px] px-4 py-12">
      <div className="border-2 border-dashed border-ink-2 bg-white p-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">Demo payment gateway · no real money</p>
        <h1 className="mt-2 font-display text-[30px] uppercase leading-none">Complete payment</h1>
        {error ? (
          <p role="alert" className="mt-4 text-[14px]">
            {error}
          </p>
        ) : !payment ? (
          <p className="mt-4 text-[14px] text-ink-2">Loading…</p>
        ) : (
          <>
            <dl className="tabular mt-5 space-y-2 text-[14px]">
              <div className="flex justify-between">
                <dt className="text-ink-2">Order</dt>
                <dd className="font-semibold">{payment.orderNumber}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-2">Method</dt>
                <dd className="uppercase">{payment.method}</dd>
              </div>
              <div className="flex justify-between border-t border-line pt-2 text-[16px] font-bold">
                <dt>Amount</dt>
                <dd>{formatINR(payment.amount)}</dd>
              </div>
            </dl>
            {payment.status === "pending" ? (
              <div className="mt-6 grid gap-2">
                <Button onClick={() => finish("succeeded")} loading={busy}>
                  Simulate successful payment
                </Button>
                <Button variant="outline" onClick={() => finish("failed")} disabled={busy}>
                  Simulate failed payment
                </Button>
              </div>
            ) : (
              <Button className="mt-6 w-full" onClick={() => router.replace(`/checkout/order/${payment.orderNumber}`)}>
                View order
              </Button>
            )}
            <p className="mt-4 text-[12px] text-ink-2">
              On the live store this page is hosted by the payment partner (UPI intent / QR / card / netbanking).
            </p>
          </>
        )}
      </div>
    </div>
  );
}
