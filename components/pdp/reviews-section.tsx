"use client";

import { ThumbsUpIcon } from "@hugeicons/core-free-icons";
import { useEffect, useRef, useState, useTransition } from "react";
import { ReviewCard, ReviewSummary } from "@/components/store/review-summary";
import { showMessageToast } from "@/components/store/toast";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { Review, ReviewPage, ReviewSummary as Summary } from "@/lib/reviews/types";
import { cn } from "@/lib/utils";

type Filters = { rating?: number; withPhotos: boolean; size?: string; sort: "recent" | "helpful" };

const FIT_LABEL = { small: "runs small", true: "true to size", large: "runs large" } as const;

/** Absolute date (deterministic on server and client — no hydration mismatch). */
function reviewDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

/**
 * PDP-08 ratings & reviews: summary (average, distribution, fit meter), filters (rating, with photos,
 * size), sort, "Load more", verified-buyer badge and helpful votes. When the style has no reviews the
 * category's reviews are shown, clearly labelled (fallback).
 */
export function ReviewsSection({
  summary,
  scope,
  target,
  initial,
  categoryLabel,
}: {
  summary: Summary;
  scope: "style" | "category";
  target: { style: string } | { category: string };
  initial: ReviewPage;
  categoryLabel: string;
}) {
  const [filters, setFilters] = useState<Filters>({ withPhotos: false, sort: "recent" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ReviewPage>(initial);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const [voted, setVoted] = useState<Record<string, number>>({});
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const ctrl = new AbortController();
    const params = new URLSearchParams({
      ...("style" in target ? { style: target.style } : { category: target.category }),
      sort: filters.sort,
      page: String(page),
    });
    if (filters.rating) params.set("rating", String(filters.rating));
    if (filters.withPhotos) params.set("photos", "1");
    if (filters.size) params.set("size", filters.size);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/reviews?${params}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(String(res.status));
        const next = (await res.json()) as ReviewPage;
        startTransition(() => {
          setData(next);
          setError(false);
        });
      } catch {
        if (!ctrl.signal.aborted) setError(true);
      }
    });
    return () => ctrl.abort();
  }, [filters, page, target]);

  const update = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  const vote = async (r: Review) => {
    try {
      const res = await fetch("/api/reviews/helpful", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId: r.id }),
      });
      if (res.status === 409) {
        setVoted((v) => ({ ...v, [r.id]: v[r.id] ?? r.helpful }));
        return;
      }
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { helpful: number };
      setVoted((v) => ({ ...v, [r.id]: body.helpful }));
    } catch {
      showMessageToast("Couldn't record that. Try again.");
    }
  };

  const chip = (on: boolean) =>
    cn(
      "h-8 shrink-0 border px-3 text-[12px] font-medium transition-colors",
      on ? "border-black bg-black text-white" : "border-line bg-white hover:border-black",
    );

  return (
    <section id="reviews" aria-labelledby="reviews-h" className="scroll-mt-24">
      <h2 id="reviews-h" className="type-section">
        Ratings &amp; reviews
      </h2>
      {scope === "category" ? (
        <p className="mt-2 text-[13px] text-ink-2">
          No reviews for this style yet — here&apos;s what buyers say about our {categoryLabel.toLowerCase()}.
        </p>
      ) : null}
      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[320px_1fr] lg:gap-14">
        <ReviewSummary
          average={summary.average}
          count={summary.count}
          distribution={summary.distribution}
          fit={summary.fit}
          footer={
            <p className="border border-line px-4 py-3 text-[12.5px] leading-[1.55] text-ink-2">
              Only verified buyers can review. Bought this? You can review it from your orders after delivery.
            </p>
          }
        />
        <div aria-busy={pending} className="min-w-0">
          <div className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0" role="group" aria-label="Filter reviews">
            <button type="button" aria-pressed={!filters.rating && !filters.withPhotos && !filters.size} className={chip(!filters.rating && !filters.withPhotos && !filters.size)} onClick={() => update({ rating: undefined, withPhotos: false, size: undefined })}>
              All
            </button>
            {[5, 4, 3, 2, 1].map((n) => (
              <button key={n} type="button" aria-pressed={filters.rating === n} className={chip(filters.rating === n)} onClick={() => update({ rating: filters.rating === n ? undefined : n })}>
                {n}★
              </button>
            ))}
            {summary.withPhotos > 0 ? (
              <button type="button" aria-pressed={filters.withPhotos} className={chip(filters.withPhotos)} onClick={() => update({ withPhotos: !filters.withPhotos })}>
                With photos
              </button>
            ) : null}
            {summary.sizes.length > 1 ? (
              <select
                aria-label="Filter by size bought"
                value={filters.size ?? ""}
                onChange={(e) => update({ size: e.target.value || undefined })}
                className="h-8 shrink-0 border border-line bg-white px-2 text-[12px]"
              >
                <option value="">Any size</option>
                {summary.sizes.map((s) => (
                  <option key={s} value={s}>
                    Size {s}
                  </option>
                ))}
              </select>
            ) : null}
            <select
              aria-label="Sort reviews"
              value={filters.sort}
              onChange={(e) => update({ sort: e.target.value === "helpful" ? "helpful" : "recent" })}
              className="h-8 shrink-0 border border-line bg-white px-2 text-[12px] lg:ml-auto"
            >
              <option value="recent">Most recent</option>
              <option value="helpful">Most helpful</option>
            </select>
          </div>

          <div className={cn("mt-5 transition-opacity", pending && "opacity-50")}>
            {error ? (
              <p role="alert" className="text-[13px] text-ink-2">
                Couldn&apos;t load reviews. Please try again.
              </p>
            ) : data.reviews.length === 0 ? (
              <p className="text-[13px] text-ink-2">No reviews match these filters.</p>
            ) : (
              data.reviews.map((r) => {
                const helpful = voted[r.id] ?? r.helpful;
                return (
                  <div key={r.id}>
                    <ReviewCard
                      rating={r.rating}
                      title={r.title}
                      body={r.body}
                      verified={r.verified}
                      photos={r.photos}
                      reply={r.reply ?? null}
                      meta={`${r.author} · Size ${r.size} · Fit: ${FIT_LABEL[r.fit]} · ${reviewDate(r.createdAt)}`}
                    />
                    <button
                      type="button"
                      onClick={() => vote(r)}
                      disabled={r.id in voted}
                      aria-pressed={r.id in voted}
                      className="-mt-3 mb-4 inline-flex items-center gap-1.5 text-[11.5px] text-ink-2 hover:text-ink disabled:text-ink"
                    >
                      <Icon icon={ThumbsUpIcon} size={14} />
                      Helpful ({helpful})
                    </button>
                  </div>
                );
              })
            )}
          </div>
          {data.reviews.length < data.total ? (
            <Button variant="outline" className="mt-2 w-full sm:w-auto" loading={pending} onClick={() => setPage((n) => n + 1)}>
              Load more reviews
            </Button>
          ) : null}
          <p className="mt-4 text-[11.5px] text-muted">
            Showing {data.reviews.length} of {data.total} reviews
          </p>
        </div>
      </div>
    </section>
  );
}
