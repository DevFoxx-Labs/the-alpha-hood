/**
 * Instant navigation inside the admin (admin-panel-design §7 "never a blank screen"): admin pages are personal and
 * dynamic, so without this the router keeps the old page on screen until the new one is ready — a click looks like
 * it did nothing. With it, the persistent shell stays and only the page area shows this skeleton at once.
 * Same height band as a page header + table, so nothing jumps when the page arrives.
 */
export default function Loading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="space-y-2">
        <div className="h-6 w-48 animate-pulse rounded bg-muted" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded bg-muted" />
      </div>
      <div className="h-9 w-72 max-w-full animate-pulse rounded-md bg-muted" />
      <div className="h-64 animate-pulse rounded-xl border border-border bg-card" />
    </div>
  );
}
