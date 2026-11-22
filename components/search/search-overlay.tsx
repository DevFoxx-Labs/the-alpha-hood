"use client";

import { ArrowRight01Icon, Cancel01Icon, Clock01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { useEffect, useState, useSyncExternalStore } from "react";
import { GarmentArt } from "@/components/store/garment-art";
import { Price } from "@/components/store/price";
import { Icon } from "@/components/ui/icon";
import { MAX_QUERY_LENGTH, normaliseSearchTerm } from "@/lib/catalog/query";
import type { SearchSuggestions } from "@/lib/catalog/types";

/**
 * SRCH-01 full-screen search: recent searches (this device only), trending searches (CMS) and instant
 * results as you type (150 ms debounce, stale requests aborted). Enter → /search?q=.
 */
export const RECENT_KEY = "ah_recent_searches";
const MAX_RECENT = 8;
const RECENT_EVENT = "ah:recent-searches";

function readRecent(): string[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]") as unknown;
    return Array.isArray(raw) ? raw.filter((s): s is string => typeof s === "string").slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}
let recentCache: { raw: string | null; value: string[] } = { raw: null, value: [] };
function recentSnapshot(): string[] {
  const raw = window.localStorage.getItem(RECENT_KEY);
  if (raw !== recentCache.raw) recentCache = { raw, value: readRecent() };
  return recentCache.value;
}
const EMPTY: string[] = [];
function subscribeRecent(cb: () => void) {
  window.addEventListener(RECENT_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(RECENT_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
function writeRecent(list: string[]) {
  try {
    if (list.length) window.localStorage.setItem(RECENT_KEY, JSON.stringify(list));
    else window.localStorage.removeItem(RECENT_KEY);
  } catch {
    // Storage unavailable (private mode) — recent searches are a convenience only.
  }
  window.dispatchEvent(new Event(RECENT_EVENT));
}

export function SearchOverlay({
  open,
  onOpenChange,
  trending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trending: string[];
}) {
  const router = useRouter();
  const recent = useSyncExternalStore(subscribeRecent, recentSnapshot, () => EMPTY);
  const [term, setTerm] = useState("");
  const [state, setState] = useState<{ q: string; data: SearchSuggestions | null; error: boolean }>({ q: "", data: null, error: false });

  const q = normaliseSearchTerm(term);

  useEffect(() => {
    if (q.length < 2) return;
    const ctrl = new AbortController();
    const t = window.setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? (r.json() as Promise<SearchSuggestions>) : Promise.reject(new Error(String(r.status)))))
        .then((data) => setState({ q, data, error: false }))
        .catch(() => {
          if (!ctrl.signal.aborted) setState({ q, data: null, error: true });
        });
    }, 150);
    return () => {
      ctrl.abort();
      window.clearTimeout(t);
    };
  }, [q]);

  const close = () => {
    onOpenChange(false);
    setTerm("");
  };

  const submit = (raw: string) => {
    const value = normaliseSearchTerm(raw);
    if (!value) return;
    writeRecent([value, ...recent.filter((r) => r.toLowerCase() !== value.toLowerCase())].slice(0, MAX_RECENT));
    close();
    router.push(`/search?q=${encodeURIComponent(value)}`);
  };

  const showResults = q.length >= 2;
  const current = state.q === q ? state : null;

  return (
    <Dialog.Root open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex flex-col bg-white outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 lg:inset-x-0 lg:bottom-auto lg:max-h-[85dvh]"
        >
          <Dialog.Title className="sr-only">Search</Dialog.Title>
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              submit(term);
            }}
            className="flex h-16 shrink-0 items-center gap-2 border-b border-line px-3 lg:px-10"
          >
            <Icon icon={Search01Icon} size={22} className="shrink-0" />
            <label htmlFor="search-overlay-q" className="sr-only">
              Search products
            </label>
            <input
              id="search-overlay-q"
              type="search"
              autoFocus
              autoComplete="off"
              enterKeyHint="search"
              maxLength={MAX_QUERY_LENGTH}
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search tees, jeans, hoodies…"
              className="h-12 min-w-0 flex-1 text-[16px] outline-none lg:text-[18px]"
            />
            <Dialog.Close className="grid size-10 shrink-0 place-items-center" aria-label="Close search">
              <Icon icon={Cancel01Icon} size={22} />
            </Dialog.Close>
          </form>

          <div className="flex-1 overflow-y-auto px-4 pb-10 pt-5 lg:px-10">
            <div className="mx-auto max-w-[1360px]">
              {!showResults ? (
                <div className="grid gap-8 lg:grid-cols-2">
                  {recent.length ? (
                    <section aria-labelledby="recent-h">
                      <div className="flex items-center justify-between">
                        <h2 id="recent-h" className="type-label">
                          Recent searches
                        </h2>
                        <button type="button" onClick={() => writeRecent([])} className="text-[11px] font-bold uppercase tracking-[0.1em] underline underline-offset-4">
                          Clear
                        </button>
                      </div>
                      <ul className="mt-3">
                        {recent.map((r) => (
                          <li key={r}>
                            <button type="button" onClick={() => submit(r)} className="flex h-10 w-full items-center gap-3 text-left text-[14px] hover:underline">
                              <Icon icon={Clock01Icon} size={16} className="text-ink-2" />
                              {r}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                  {trending.length ? (
                    <section aria-labelledby="trending-h">
                      <h2 id="trending-h" className="type-label">
                        Trending searches
                      </h2>
                      <ul className="mt-3 flex flex-wrap gap-2">
                        {trending.map((t) => (
                          <li key={t}>
                            <button type="button" onClick={() => submit(t)} className="border border-line px-3 py-2 text-[13px] hover:border-black">
                              {t}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                </div>
              ) : (
                <Results q={q} current={current} onNavigate={() => submit(q)} />
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Results({
  q,
  current,
  onNavigate,
}: {
  q: string;
  current: { data: SearchSuggestions | null; error: boolean } | null;
  onNavigate: () => void;
}) {
  if (!current) return <p className="text-[13px] text-ink-2" role="status">Searching…</p>;
  if (current.error || !current.data) {
    return (
      <p className="text-[13px] text-ink-2" role="status">
        Instant results are unavailable. Press Enter to search.
      </p>
    );
  }
  const { products, categories } = current.data;
  if (!products.length && !categories.length) {
    return (
      <p className="text-[14px]" role="status">
        No matches for “{q}”. Try another word — e.g. “tee”, “jeans” or “hoodie”.
      </p>
    );
  }
  return (
    <div className="grid gap-8 lg:grid-cols-[260px_1fr]" role="status" aria-live="polite">
      {categories.length ? (
        <section aria-labelledby="cat-h">
          <h2 id="cat-h" className="type-label">
            Categories
          </h2>
          <ul className="mt-3">
            {categories.map((c) => (
              <li key={c.href}>
                <Link href={c.href} onClick={onNavigate} className="flex h-10 items-center justify-between text-[14px] hover:underline">
                  {c.title}
                  <Icon icon={ArrowRight01Icon} size={16} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section aria-labelledby="prod-h">
        <h2 id="prod-h" className="type-label">
          Products
        </h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <li key={p.handle}>
              <Link href={`/products/${p.handle}`} onClick={onNavigate} className="flex items-center gap-3 hover:bg-soft">
                <GarmentArt image={{ ...p.image, alt: "" }} className="h-[80px] w-[62px] shrink-0" />
                <div className="min-w-0">
                  <div className="line-clamp-2 text-[13px]">{p.title}</div>
                  <Price price={p.price} mrp={p.mrp} className="mt-1" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
        <Link
          href={`/search?q=${encodeURIComponent(q)}`}
          onClick={onNavigate}
          className="mt-5 inline-flex items-center gap-1 text-[12px] font-bold uppercase tracking-[0.1em] underline underline-offset-4"
        >
          See all results for “{q}”
          <Icon icon={ArrowRight01Icon} size={14} />
        </Link>
      </section>
    </div>
  );
}
