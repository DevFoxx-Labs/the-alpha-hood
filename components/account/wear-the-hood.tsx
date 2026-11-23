"use client";

import { Delete02Icon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { Mascot } from "@/components/brand/mascot";
import { api, ApiError } from "@/components/checkout/api";
import { showMessageToast } from "@/components/store/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { dateLabel } from "./labels";

interface Post {
  id: string;
  caption: string;
  status: "pending" | "approved" | "rejected" | "removed";
  createdAt: string;
  photo: string;
}

const STATUS: Record<Post["status"], string> = { pending: "In review", approved: "Live on the site", rejected: "Not approved", removed: "Removed" };

/**
 * LOY-03 / HOME-10 submit a #WearTheHood photo: tag up to 3 delivered items, explicit (unticked) consent to
 * publish with first name; reviewed by staff before it appears. Delete any time (withdrawal).
 */
export function WearTheHoodView() {
  const id = useId();
  const [items, setItems] = useState<{ productId: string; title: string }[] | null>(null);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [photo, setPhoto] = useState<{ id: string; url: string } | null>(null);
  const [tagged, setTagged] = useState<string[]>([]);
  const [caption, setCaption] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadPosts = () => api<{ posts: Post[] }>("/api/account/ugc").then((d) => setPosts(d.posts));
  useEffect(() => {
    let cancelled = false;
    api<{ orders: { delivered: { productId: string; title: string }[] }[] }>("/api/account/orders")
      .then((d) => {
        if (cancelled) return;
        const seen = new Map<string, string>();
        for (const o of d.orders) for (const l of o.delivered ?? []) seen.set(l.productId, l.title);
        setItems([...seen.entries()].map(([productId, title]) => ({ productId, title })));
      })
      .catch(() => !cancelled && setItems([]));
    api<{ posts: Post[] }>("/api/account/ugc")
      .then((d) => !cancelled && setPosts(d.posts))
      .catch(() => !cancelled && setPosts([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const res = await fetch("/api/returns/photos", { method: "POST", headers: { "Content-Type": file.type }, body: file });
      const data = (await res.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null;
      if (!res.ok || !data?.id) throw new Error(data?.error?.message ?? "Couldn't upload that photo.");
      setPhoto({ id: data.id, url: `/api/returns/photos/${data.id}` });
    } catch (e) {
      showMessageToast(e instanceof Error ? e.message : "Couldn't upload that photo.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!photo) return;
    setBusy(true);
    try {
      await api("/api/account/ugc", { method: "POST", body: { photoId: photo.id, caption, productIds: tagged, consent } });
      setPhoto(null);
      setTagged([]);
      setCaption("");
      setConsent(false);
      await loadPosts();
      showMessageToast("Thanks! We'll review your photo soon.");
    } catch (err) {
      showMessageToast(err instanceof ApiError ? err.message : "Couldn't submit.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (postId: string) => {
    try {
      await api(`/api/account/ugc/${postId}`, { method: "DELETE", body: {} });
      await loadPosts();
      showMessageToast("Photo removed");
    } catch (err) {
      showMessageToast(err instanceof ApiError ? err.message : "Couldn't remove.");
    }
  };

  if (!items || !posts) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-5">
      <section className="border border-line p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-[30px] uppercase leading-none">#WearTheHood</h2>
            <p className="mt-2 max-w-[520px] text-[13.5px] leading-[1.6] text-ink-2">
              Share a photo of your fit. Approved photos appear on our homepage with your first name; Alpha Club members get 50 Hood
              Coins. No faces of other people, no children.
            </p>
          </div>
          <Mascot name="alpha-09-mirror-selfie" sizes="120px" blend className="hidden w-[96px] shrink-0 sm:block" />
        </div>

        {items.length === 0 ? (
          <p className="mt-4 text-[13px]">
            You can share once an order is delivered.{" "}
            <Link href="/collections/new-in" className="underline underline-offset-2">
              Shop new in
            </Link>
          </p>
        ) : (
          <form onSubmit={submit} className="mt-5 grid max-w-[560px] gap-4">
            <div>
              <label htmlFor={`${id}-f`} className="text-[12px] font-bold uppercase tracking-[0.06em]">
                Photo (JPEG or PNG, up to 5 MB)
              </label>
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element -- private, owner-only upload preview
                <img src={photo.url} alt="Your photo" className="mt-2 h-40 w-32 object-cover" />
              ) : (
                <input
                  id={`${id}-f`}
                  type="file"
                  accept="image/jpeg,image/png"
                  className="mt-2 block text-[13px]"
                  disabled={busy}
                  onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
                />
              )}
            </div>
            <fieldset>
              <legend className="text-[12px] font-bold uppercase tracking-[0.06em]">What you&apos;re wearing (up to 3)</legend>
              <div className="mt-2 grid gap-2">
                {items.map((it) => (
                  <label key={it.productId} className="flex items-center gap-2 text-[13px]">
                    <Checkbox
                      checked={tagged.includes(it.productId)}
                      disabled={!tagged.includes(it.productId) && tagged.length >= 3}
                      onCheckedChange={(v) => setTagged((t) => (v === true ? [...t, it.productId] : t.filter((x) => x !== it.productId)))}
                    />
                    {it.title}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label htmlFor={`${id}-cap`} className="text-[12px] font-bold uppercase tracking-[0.06em]">
                Caption (optional)
              </label>
              <Input id={`${id}-cap`} maxLength={140} value={caption} onChange={(e) => setCaption(e.target.value)} className="mt-2" />
            </div>
            <label htmlFor={`${id}-ok`} className="flex items-start gap-3 text-[13px] leading-[1.55]">
              <Checkbox id={`${id}-ok`} checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
              <span>
                Publish my photo with my first name on The Alpha Hood website after review. I took this photo, and anyone else in it has
                agreed. I can remove it any time (
                <Link href="/legal/terms#ugc" className="underline underline-offset-2">
                  Terms
                </Link>
                ).
              </span>
            </label>
            <Button type="submit" loading={busy} disabled={!photo || tagged.length === 0 || !consent} className="justify-self-start">
              Submit for review
            </Button>
          </form>
        )}
      </section>

      {posts.length ? (
        <section className="border border-line p-5">
          <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[0.12em]">Your photos</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {posts.map((p) => (
              <li key={p.id} className="text-[12.5px]">
                {/* eslint-disable-next-line @next/next/no-img-element -- private, owner-only photo */}
                <img src={p.photo} alt="" className="aspect-[4/5] w-full bg-soft object-cover" />
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span>
                    <b>{STATUS[p.status]}</b>
                    <span className="block text-ink-2">{dateLabel(p.createdAt)}</span>
                  </span>
                  <button type="button" aria-label="Remove photo" onClick={() => remove(p.id)} className="grid size-9 place-items-center text-ink-2 hover:text-ink">
                    <Icon icon={Delete02Icon} size={17} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
