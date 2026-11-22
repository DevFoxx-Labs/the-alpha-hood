"use client";

import { useReportWebVitals } from "next/web-vitals";

type Metric = Parameters<Parameters<typeof useReportWebVitals>[0]>[0];
const WANTED = new Set(["LCP", "INP", "CLS", "TTFB", "FCP"]);

/** Stable reference (docs: a new function would re-report). Sends only metric, value, path and device class. */
function report(metric: Metric) {
  if (!WANTED.has(metric.name)) return;
  try {
    void fetch("/api/rum", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        metric: metric.name,
        value: metric.value,
        path: window.location.pathname,
        device: window.matchMedia("(max-width: 767px)").matches ? "mobile" : "desktop",
      }),
    }).catch(() => undefined);
  } catch {
    // never affects the page
  }
}

/** §7 RUM: first-party only, no cookies or identifiers (web-performance rule). */
export function WebVitals() {
  useReportWebVitals(report);
  return null;
}
