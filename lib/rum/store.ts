/**
 * §7 real-user monitoring (web-performance rule): Core Web Vitals from real visits, aggregated per route
 * template. NO personal data — no IP, user agent, cookie, visitor id or full URL is stored; only the metric,
 * its value, a route template and a coarse device class. Per-process ring buffer (moves to the analytics
 * store with the database); the admin Reports screen reads the p75 values.
 */
export const RUM_METRICS = ["LCP", "INP", "CLS", "TTFB", "FCP"] as const;
export type RumMetric = (typeof RUM_METRICS)[number];

/** Web-vitals "good" thresholds (p75 targets: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1, TTFB ≤ 0.8 s). */
export const RUM_TARGETS: Record<RumMetric, number> = { LCP: 2500, INP: 200, CLS: 0.1, TTFB: 800, FCP: 1800 };

export interface RumSample {
  metric: RumMetric;
  value: number;
  route: string;
  device: "mobile" | "desktop";
  at: number;
}

/** Collapses a pathname to its route template so no handle, order number or token is ever stored. */
export function routeTemplate(pathname: string): string {
  const p = pathname.split("?")[0].replace(/\/+$/, "") || "/";
  const rules: [RegExp, string][] = [
    [/^\/$/, "/"],
    [/^\/men$/, "/men"],
    [/^\/men\/[^/]+$/, "/men/[category]"],
    [/^\/men\/[^/]+\/[^/]+$/, "/men/[category]/[sub]"],
    [/^\/collections\/[^/]+$/, "/collections/[handle]"],
    [/^\/products\/[^/]+$/, "/products/[handle]"],
    [/^\/search$/, "/search"],
    [/^\/bag$/, "/bag"],
    [/^\/checkout$/, "/checkout"],
    [/^\/checkout\/(order|pay)\/[^/]+$/, "/checkout/[step]/[id]"],
    [/^\/account(\/.*)?$/, "/account/*"],
    [/^\/(legal|help|privacy)(\/.*)?$/, "/content/*"],
  ];
  for (const [re, name] of rules) if (re.test(p)) return name;
  return "other";
}

const MAX = 5000;
const g = globalThis as unknown as { __alpha_hood_rum?: RumSample[] };
const buffer = () => (g.__alpha_hood_rum ??= []);

export function recordSample(s: RumSample) {
  const b = buffer();
  b.push(s);
  if (b.length > MAX) b.splice(0, b.length - MAX);
}

function p75(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.ceil(v.length * 0.75) - 1)];
}

export interface RumRow {
  route: string;
  device: "mobile" | "desktop";
  metric: RumMetric;
  p75: number;
  samples: number;
  good: boolean;
}

export function rumSummary(sinceMs = 7 * 86_400_000, now = Date.now()): RumRow[] {
  const groups = new Map<string, RumSample[]>();
  for (const s of buffer()) {
    if (s.at < now - sinceMs) continue;
    const k = `${s.route}|${s.device}|${s.metric}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(s);
  }
  return [...groups.entries()]
    .map(([k, list]) => {
      const [route, device, metric] = k.split("|") as [string, "mobile" | "desktop", RumMetric];
      const v = p75(list.map((s) => s.value));
      return { route, device, metric, p75: v, samples: list.length, good: v <= RUM_TARGETS[metric] };
    })
    .sort((a, b) => a.route.localeCompare(b.route) || a.device.localeCompare(b.device) || RUM_METRICS.indexOf(a.metric) - RUM_METRICS.indexOf(b.metric));
}

export function resetRumForTests() {
  buffer().length = 0;
}
