import { guardPublicWrite } from "@/lib/http/guard";
import { RUM_METRICS, type RumMetric, recordSample, routeTemplate } from "@/lib/rum/store";

/**
 * POST /api/rum `{ metric, value, path, device }` — Core Web Vitals from real visits (§7). Same-origin,
 * rate-limited, tiny body. The path is reduced to a route template on the server; nothing personal is kept.
 */
export async function POST(request: Request) {
  const guard = await guardPublicWrite(request, { name: "rum", limit: 60, windowMs: 10 * 60_000, maxBytes: 256 });
  if (!guard.ok) return guard.response;
  const b = guard.body as Record<string, unknown> | null;
  if (!b || typeof b !== "object" || Array.isArray(b)) return new Response(null, { status: 204 });
  const metric = b.metric;
  const value = b.value;
  if (typeof metric !== "string" || !(RUM_METRICS as readonly string[]).includes(metric)) return new Response(null, { status: 204 });
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > (metric === "CLS" ? 10 : 120_000)) return new Response(null, { status: 204 });
  recordSample({
    metric: metric as RumMetric,
    value: Math.round(value * (metric === "CLS" ? 1000 : 1)) / (metric === "CLS" ? 1000 : 1),
    route: routeTemplate(typeof b.path === "string" ? b.path.slice(0, 200) : ""),
    device: b.device === "mobile" ? "mobile" : "desktop",
    at: Date.now(),
  });
  return new Response(null, { status: 204 });
}
