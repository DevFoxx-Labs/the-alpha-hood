"use client";

import { StarIcon } from "@hugeicons/core-free-icons";
import { useCallback, useEffect, useId, useState } from "react";
import { api, ApiError } from "@/components/checkout/api";
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
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { dateLabel } from "./labels";

/**
 * My reviews (PDP-08 "Write a review"): products the customer received and hasn't reviewed yet, and their reviews with
 * status — waiting for a check, live on the product page, or not published (with the reason). Edit or delete any time.
 * Opening `/account/reviews?order=AH…&line=…` (from an order or the review-request email) opens that item's form.
 */
interface ToReview {
  orderNumber: string;
  lineId: string;
  productId: string;
  title: string;
  size: string;
  image: { art: string; colour: string; alt: string };
}
interface MyReview extends ToReview {
  id: string;
  status: "pending" | "published" | "rejected";
  createdAt: string;
  productTitle: string;
  productHandle: string;
  rating: number;
  body: string;
  fit: "small" | "true" | "large";
  author: string;
  rejectReason?: string;
  photoIds: string[];
  reply: { text: string; at: string } | null;
}

const MAX_PHOTOS = 3;
const ownPhoto = (id: string) => `/api/returns/photos/${id}`;

/** Add up to 3 photos (JPEG / PNG, ≤ 5 MB). Private until the review is approved; metadata is removed on upload. */
function PhotoPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const upload = async (file: File) => {
    if (value.length >= MAX_PHOTOS) return;
    if (!["image/jpeg", "image/png"].includes(file.type) || file.size > 5 * 1024 * 1024) return setError("Photos must be JPEG or PNG and 5 MB or smaller.");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/returns/photos", { method: "POST", headers: { "Content-Type": file.type }, body: file });
      const data = (await res.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null;
      if (!res.ok || !data?.id) throw new Error(data?.error?.message ?? "Upload failed.");
      onChange([...value, data.id]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-1.5">
      <span className="text-[12px] font-bold uppercase tracking-[0.06em]">
        Photos <span className="font-normal normal-case tracking-normal text-ink-2">(optional, up to {MAX_PHOTOS})</span>
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {value.map((pid, i) => (
          <div key={pid} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element -- private, owner-only image served by our API */}
            <img src={ownPhoto(pid)} alt={`Your photo ${i + 1}`} className="h-20 w-16 border border-line object-cover" />
            <button type="button" onClick={() => onChange(value.filter((x) => x !== pid))} aria-label={`Remove photo ${i + 1}`} className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full bg-black text-[12px] text-white">
              ×
            </button>
          </div>
        ))}
        {value.length < MAX_PHOTOS ? (
          <label htmlFor={id} className={cn("grid h-20 w-16 cursor-pointer place-items-center border border-dashed border-ink-2 text-center text-[11px] font-semibold", busy && "opacity-50")}>
            {busy ? "Uploading…" : "+ Add photo"}
            <input
              id={id}
              type="file"
              accept="image/jpeg,image/png"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void upload(f);
              }}
            />
          </label>
        ) : null}
      </div>
      <p className="text-[12px] text-ink-2">Photos of the product as you wear it help most. We remove location and camera details. Shown only after our check.</p>
      {error ? (
        <p role="alert" className="text-[12px] font-semibold text-accent">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const STATUS: Record<MyReview["status"], { label: string; cls: string }> = {
  pending: { label: "Waiting for a quick check", cls: "bg-soft" },
  published: { label: "Live on the product page", cls: "bg-black text-white" },
  rejected: { label: "Not published", cls: "border border-accent text-accent" },
};

function Stars({ value, onChange, size = 22 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  return (
    <div className="flex gap-1" role={onChange ? "radiogroup" : "img"} aria-label={onChange ? "Rating" : `${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) =>
        onChange ? (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => onChange(n)} className="p-0.5">
            <Icon icon={StarIcon} size={size} className={cn(n <= value ? "fill-black text-black" : "text-line")} />
          </button>
        ) : (
          <Icon key={n} icon={StarIcon} size={size} className={cn(n <= value ? "fill-black text-black" : "text-line")} />
        ),
      )}
    </div>
  );
}

function ReviewForm({ item, existing, onDone, onCancel }: { item: ToReview; existing?: MyReview; onDone: () => void; onCancel: () => void }) {
  const id = useId();
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [fit, setFit] = useState<MyReview["fit"]>(existing?.fit ?? "true");
  const [photos, setPhotos] = useState<string[]>(existing?.photoIds ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating) return setError("Choose a star rating.");
    setBusy(true);
    setError(null);
    try {
      if (existing) await api(`/api/account/reviews/${existing.id}`, { method: "PATCH", body: { rating, title, body, fit, photos } });
      else await api("/api/account/reviews", { method: "POST", body: { orderNumber: item.orderNumber, lineId: item.lineId, rating, title, body, fit, photos } });
      showMessageToast(existing ? "Review updated — it'll be live again after a quick check." : "Thanks! Your review will be live after a quick check.");
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save your review.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 border border-black p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <GarmentArt image={{ art: item.image.art as never, colour: item.image.colour, alt: "" }} className="h-16 w-12 shrink-0" />
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold">{item.title}</p>
          <p className="text-[12px] text-ink-2">Size {item.size} · Order {item.orderNumber}</p>
        </div>
      </div>
      <div className="grid gap-1.5">
        <span className="text-[12px] font-bold uppercase tracking-[0.06em]">Your rating</span>
        <Stars value={rating} onChange={setRating} size={28} />
      </div>
      <fieldset className="grid gap-1.5">
        <legend className="mb-1 text-[12px] font-bold uppercase tracking-[0.06em]">How did it fit?</legend>
        <div className="flex flex-wrap gap-2">
          {(["small", "true", "large"] as const).map((f) => (
            <label key={f} className="flex h-10 cursor-pointer items-center gap-2 border border-line px-3 text-[13px] has-[:checked]:border-black has-[:checked]:font-semibold">
              <input type="radio" name={`${id}-fit`} checked={fit === f} onChange={() => setFit(f)} className="accent-black" />
              {f === "small" ? "Runs small" : f === "large" ? "Runs large" : "True to size"}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-t`} className="text-[12px] font-bold uppercase tracking-[0.06em]">
          Title
        </label>
        <Input id={`${id}-t`} maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Heavy, soft and holds its shape" />
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-b`} className="text-[12px] font-bold uppercase tracking-[0.06em]">
          Your review
        </label>
        <textarea id={`${id}-b`} rows={5} maxLength={1500} value={body} onChange={(e) => setBody(e.target.value)} className="border border-input bg-white px-3 py-2 text-[14px] outline-none focus-visible:border-black" placeholder="Fabric, fit, colour, how it washed — what would help another shopper?" />
        <p className="text-[12px] text-ink-2">At least 20 characters. Shown with your first name and last initial and a “Verified buyer” badge — never your phone or email.</p>
      </div>
      <PhotoPicker value={photos} onChange={setPhotos} />
      {error ? (
        <p role="alert" className="text-[13px] font-semibold text-accent">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" loading={busy}>
          {existing ? "Save changes" : "Submit review"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function ReviewsView() {
  const [data, setData] = useState<{ reviews: MyReview[]; toReview: ToReview[] } | null>(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState<{ item: ToReview; existing?: MyReview } | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<{ reviews: MyReview[]; toReview: ToReview[] }>("/api/account/reviews");
      setData(d);
      return d;
    } catch {
      setError(true);
      return null;
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() =>
      void load().then((d) => {
      const q = new URLSearchParams(window.location.search);
      const item = d?.toReview.find((t) => t.orderNumber === q.get("order") && (!q.get("line") || t.lineId === q.get("line")));
      if (item) setOpen({ item });
      }),
    );
  }, [load]);

  if (error) return <p className="text-[13px] text-ink-2">Couldn&apos;t load your reviews.</p>;
  if (!data) return <p className="text-[13px] text-ink-2">Loading…</p>;

  return (
    <div className="space-y-8">
      {open ? (
        <ReviewForm
          key={open.existing?.id ?? open.item.lineId}
          item={open.item}
          existing={open.existing}
          onCancel={() => setOpen(null)}
          onDone={() => {
            setOpen(null);
            void load();
          }}
        />
      ) : null}

      <section>
        <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[0.12em]">Waiting for your review</h2>
        {data.toReview.length === 0 ? (
          <p className="text-[13px] text-ink-2">Nothing to review right now. Products appear here after they are delivered.</p>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {data.toReview.map((t) => (
              <li key={t.productId} className="flex items-center gap-4 py-3">
                <GarmentArt image={{ art: t.image.art as never, colour: t.image.colour, alt: "" }} className="h-16 w-12 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold">{t.title}</p>
                  <p className="text-[12px] text-ink-2">Size {t.size} · Order {t.orderNumber}</p>
                </div>
                <Button size="sm" onClick={() => setOpen({ item: t })} disabled={!!open}>
                  Write a review
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[0.12em]">Your reviews</h2>
        {data.reviews.length === 0 ? (
          <p className="text-[13px] text-ink-2">You haven&apos;t written any reviews yet.</p>
        ) : (
          <ul className="grid gap-3">
            {data.reviews.map((r) => (
              <li key={r.id} className="border border-line p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] text-ink-2">{r.productTitle} · Size {r.size}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <Stars value={r.rating} size={16} />
                      <span className={cn("px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]", STATUS[r.status].cls)}>{STATUS[r.status].label}</span>
                    </div>
                    <p className="mt-2 text-[14px] font-semibold">{r.title}</p>
                    <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-ink-2">{r.body}</p>
                    {r.photoIds.length ? (
                      <div className="mt-2 flex gap-2">
                        {r.photoIds.map((pid, i) => (
                          // eslint-disable-next-line @next/next/no-img-element -- private, owner-only image served by our API
                          <img key={pid} src={ownPhoto(pid)} alt={`Your photo ${i + 1}`} className="h-16 w-12 border border-line object-cover" />
                        ))}
                      </div>
                    ) : null}
                    {r.reply ? (
                      <div className="mt-3 border-l-2 border-black pl-3">
                        <p className="text-[11px] font-bold uppercase tracking-[0.1em]">Reply from The Alpha Hood · {dateLabel(r.reply.at)}</p>
                        <p className="mt-1 whitespace-pre-line text-[13px] text-ink-2">{r.reply.text}</p>
                      </div>
                    ) : null}
                    {r.status === "rejected" && r.rejectReason ? <p className="mt-2 text-[12px] text-accent">Why: {r.rejectReason} — edit it and we&apos;ll check it again.</p> : null}
                    <p className="mt-2 text-[11px] text-ink-2">Written {dateLabel(r.createdAt)} as “{r.author}”</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setOpen({ item: { orderNumber: r.orderNumber, lineId: r.lineId, productId: r.productId, title: r.productTitle, size: r.size, image: r.image }, existing: r })} disabled={!!open}>
                      Edit
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline">
                          Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogTitle>Delete this review?</AlertDialogTitle>
                        <AlertDialogDescription>It is removed from the product page too. You can write a new one later.</AlertDialogDescription>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() =>
                              void api(`/api/account/reviews/${r.id}`, { method: "DELETE", body: {} })
                                .then(() => (showMessageToast("Review deleted"), load()))
                                .catch((e) => showMessageToast(e instanceof ApiError ? e.message : "Couldn't delete."))
                            }
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
