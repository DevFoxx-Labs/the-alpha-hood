"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/components/checkout/api";
import { showMessageToast } from "@/components/store/toast";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/format";
import { FULFILMENT_LABEL, RETURN_STATUS_LABEL } from "./labels";

interface Data {
  orders: { number: string; status: string; fulfilment: string; total: number; createdAt: string }[];
  returns: { number: string; orderNumber: string; status: string; resolution: string; createdAt: string }[];
}

const NEXT: Record<string, string[]> = {
  confirmed: ["packed"],
  packed: ["shipped"],
  shipped: ["out_for_delivery", "delivered", "rto"],
  out_for_delivery: ["delivered", "rto"],
};
const RETURN_NEXT: Record<string, string[]> = { pickup_scheduled: ["picked_up"], picked_up: ["qc_passed", "qc_failed"] };

export function DevOrders() {
  const [data, setData] = useState<Data | null>(null);
  const load = useCallback(async () => {
    try {
      setData(await api<Data>("/api/dev/fulfilment"));
    } catch {
      setData({ orders: [], returns: [] });
    }
  }, []);
  useEffect(() => {
    let cancelled = false;
    api<Data>("/api/dev/fulfilment")
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setData({ orders: [], returns: [] }));
    return () => {
      cancelled = true;
    };
  }, []);

  const advance = async (kind: "order" | "return", number: string, to: string) => {
    try {
      await api("/api/dev/fulfilment", { method: "POST", body: { kind, number, to } });
      await load();
    } catch (e) {
      showMessageToast(e instanceof ApiError ? e.message : "Failed");
    }
  };

  if (!data) return <p className="text-[13px]">Loading…</p>;
  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-2 text-[13px] font-bold uppercase tracking-[0.12em]">Orders</h2>
        {data.orders.length === 0 ? <p className="text-[13px] text-ink-2">No orders yet — place one at /checkout.</p> : null}
        <ul className="divide-y divide-line border-y border-line">
          {data.orders.map((o) => (
            <li key={o.number} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[13px]">
              <span className="tabular">
                {o.number} · {o.status} · <b>{FULFILMENT_LABEL[o.fulfilment]}</b> · {formatINR(o.total)}
              </span>
              <span className="flex gap-1.5">
                {o.status === "confirmed"
                  ? (NEXT[o.fulfilment] ?? []).map((to) => (
                      <Button key={to} size="sm" variant="outline" onClick={() => advance("order", o.number, to)}>
                        {FULFILMENT_LABEL[to]}
                      </Button>
                    ))
                  : null}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="mb-2 text-[13px] font-bold uppercase tracking-[0.12em]">Returns</h2>
        {data.returns.length === 0 ? <p className="text-[13px] text-ink-2">No returns yet.</p> : null}
        <ul className="divide-y divide-line border-y border-line">
          {data.returns.map((r) => (
            <li key={r.number} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[13px]">
              <span className="tabular">
                {r.number} · {r.orderNumber} · {r.resolution} · <b>{RETURN_STATUS_LABEL[r.status]}</b>
              </span>
              <span className="flex gap-1.5">
                {(RETURN_NEXT[r.status] ?? []).map((to) => (
                  <Button key={to} size="sm" variant="outline" onClick={() => advance("return", r.number, to)}>
                    {to.replace("_", " ")}
                  </Button>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
