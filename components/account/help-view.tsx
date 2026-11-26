"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import { api, ApiError } from "@/components/checkout/api";
import { showMessageToast } from "@/components/store/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { dateLabel } from "./labels";

/** Help & feedback: write to the store about anything (optionally an order and a 1–5 rating), and read the replies. */
interface Message {
  id: string;
  status: "open" | "resolved";
  createdAt: string;
  topicLabel: string;
  orderNumber: string | null;
  rating: number | null;
  message: string;
  reply: string | null;
  repliedAt: string | null;
}

export function HelpView() {
  const id = useId();
  const [data, setData] = useState<{ messages: Message[]; topics: { value: string; label: string }[] } | null>(null);
  const [topic, setTopic] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ messages: Message[]; topics: { value: string; label: string }[] }>("/api/account/feedback")
      .then(setData)
      .catch(() => setData({ messages: [], topics: [] }));
  }, []);
  useEffect(() => {
    load();
    const order = new URLSearchParams(window.location.search).get("order");
    if (order) {
      queueMicrotask(() => {
        setOrderNumber(order.toUpperCase().slice(0, 10));
        setTopic("order");
      });
    }
  }, [load]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/account/feedback", { method: "POST", body: { topic, orderNumber, rating, message } });
      showMessageToast("Sent. We'll reply here and by email if you've verified it.");
      setMessage("");
      setRating(null);
      setOrderNumber("");
      setTopic("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send your message.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <section className="border border-line p-4 sm:p-5">
        <h2 className="mb-1 text-[13px] font-bold uppercase tracking-[0.12em]">Write to us</h2>
        <p className="mb-4 text-[13px] text-ink-2">
          A problem with an order, a product question, or an idea for us. For a return, use{" "}
          <Link href="/account/orders" className="underline underline-offset-2">
            your order page
          </Link>
          ; for your data rights,{" "}
          <Link href="/privacy/request" className="underline underline-offset-2">
            make a privacy request
          </Link>
          .
        </p>
        <form onSubmit={send} noValidate className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-topic`} className="text-[12px] font-bold uppercase tracking-[0.06em]">
              About
            </label>
            <select id={`${id}-topic`} value={topic} onChange={(e) => setTopic(e.target.value)} className="h-12 border border-input bg-white px-3 text-[14px] outline-none focus-visible:border-black">
              <option value="">Choose…</option>
              {data?.topics.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-order`} className="text-[12px] font-bold uppercase tracking-[0.06em]">
              Order number <span className="font-normal normal-case tracking-normal text-ink-2">(optional)</span>
            </label>
            <Input id={`${id}-order`} maxLength={10} value={orderNumber} onChange={(e) => setOrderNumber(e.target.value.toUpperCase())} placeholder="AH…" />
          </div>
          <fieldset className="flex flex-col gap-1.5 sm:col-span-2">
            <legend className="mb-1 text-[12px] font-bold uppercase tracking-[0.06em]">
              How was your experience? <span className="font-normal normal-case tracking-normal text-ink-2">(optional)</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" aria-pressed={rating === n} onClick={() => setRating(rating === n ? null : n)} className={cn("h-10 min-w-10 border px-3 text-[13px] font-semibold", rating === n ? "border-black bg-black text-white" : "border-line")}>
                  {n}
                </button>
              ))}
              <span className="self-center text-[12px] text-ink-2">1 = poor · 5 = great</span>
            </div>
          </fieldset>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label htmlFor={`${id}-msg`} className="text-[12px] font-bold uppercase tracking-[0.06em]">
              Message
            </label>
            <textarea id={`${id}-msg`} rows={5} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} className="border border-input bg-white px-3 py-2 text-[14px] outline-none focus-visible:border-black" />
          </div>
          {error ? (
            <p role="alert" className="text-[13px] font-semibold text-accent sm:col-span-2">
              {error}
            </p>
          ) : null}
          <div className="sm:col-span-2">
            <Button type="submit" loading={busy}>
              Send
            </Button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[0.12em]">Your messages</h2>
        {!data ? (
          <p className="text-[13px] text-ink-2">Loading…</p>
        ) : data.messages.length === 0 ? (
          <p className="text-[13px] text-ink-2">No messages yet.</p>
        ) : (
          <ul className="grid gap-3">
            {data.messages.map((m) => (
              <li key={m.id} className="border border-line p-4">
                <p className="flex flex-wrap items-center gap-2 text-[12px] text-ink-2">
                  <span className={cn("px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]", m.status === "resolved" ? "bg-black text-white" : "bg-soft")}>{m.status === "resolved" ? "Answered" : "Open"}</span>
                  {m.topicLabel} · {dateLabel(m.createdAt)}
                  {m.orderNumber ? ` · ${m.orderNumber}` : ""}
                  {m.rating ? ` · ${m.rating}/5` : ""}
                </p>
                <p className="mt-2 whitespace-pre-line text-[13.5px] leading-relaxed">{m.message}</p>
                {m.reply ? (
                  <div className="mt-3 border-l-2 border-black pl-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.1em]">The Alpha Hood{m.repliedAt ? ` · ${dateLabel(m.repliedAt)}` : ""}</p>
                    <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-ink-2">{m.reply}</p>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
