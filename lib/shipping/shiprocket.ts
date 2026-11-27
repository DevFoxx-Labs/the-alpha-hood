import { createHash } from "node:crypto";
import { rupees } from "@/lib/format";
import { addBusinessDays, COD, type DeliveryPromise, PINCODE_RE } from "./common";

/**
 * Shiprocket (courier aggregator) — pincode serviceability for the delivery promise (PDP-05, checkout).
 *
 * Endpoints (Shiprocket API help sheet + developers page): POST /v1/external/auth/login with the API user's
 * credentials → a token valid 240 hours, sent as `Authorization: Bearer`; GET /v1/external/courier/serviceability/.
 * The request / response field names below are the ones Shiprocket integrations use; their JSON reference is not
 * machine-readable, so the parser is defensive, and Admin → Shipping runs a live test with the real account before
 * Shiprocket can go live (a mismatch shows up there, never on the store).
 *
 * Security: one fixed https host (no admin-typed URL → no SSRF), redirects refused, 8 s timeout, responses capped at
 * 1 MB, credentials never logged or returned, the token kept in this process's memory only.
 */
export const SHIPROCKET_HOST = "https://apiv2.shiprocket.in";
const TIMEOUT_MS = 8_000;
const MAX_BYTES = 1_000_000;
/** Renew a little before Shiprocket's 240-hour expiry. */
const TOKEN_TTL_MS = 216 * 3_600_000;

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

export interface ShiprocketConfig {
  /** The API user's email (Shiprocket → Settings → API → Create API user). */
  email: string;
  password: string;
  /** Pincode of the registered pickup address (where parcels leave from). */
  pickupPincode: string;
  /** Parcel weight sent with every check, in kg (couriers price and route by it). */
  weightKg: number;
}

export class ShiprocketError extends Error {
  constructor(
    public readonly code: "auth" | "unreachable" | "bad_response" | "rejected",
    message: string,
  ) {
    super(message);
    this.name = "ShiprocketError";
  }
}

// ── Token cache (per process, per credentials) ───────────────────────────────────────────────────

const g = globalThis as unknown as { __alpha_hood_shiprocket_tokens?: Map<string, { token: string; until: number }> };
const tokens = () => (g.__alpha_hood_shiprocket_tokens ??= new Map());
const credKey = (c: Pick<ShiprocketConfig, "email" | "password">) => createHash("sha256").update(`${c.email}\u0000${c.password}`).digest("hex");
export const forgetShiprocketTokens = () => tokens().clear();

async function call(fetcher: Fetcher, path: string, init: RequestInit): Promise<{ status: number; json: unknown }> {
  let res: Response;
  try {
    res = await fetcher(`${SHIPROCKET_HOST}${path}`, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "application/json", ...(init.headers as Record<string, string> | undefined) },
    });
  } catch {
    throw new ShiprocketError("unreachable", "Shiprocket could not be reached. Try again in a minute.");
  }
  const text = (await res.text().catch(() => "")).slice(0, MAX_BYTES);
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

/** Shiprocket's own message, shortened, single line (shown to the admin in the test result only). */
function messageOf(json: unknown): string {
  const m = (json as { message?: unknown } | null)?.message;
  return typeof m === "string" ? m.replace(/[\r\n]+/g, " ").slice(0, 160) : "";
}

export async function shiprocketToken(cfg: Pick<ShiprocketConfig, "email" | "password">, fetcher: Fetcher = fetch, now = Date.now(), fresh = false): Promise<string> {
  const key = credKey(cfg);
  const hit = tokens().get(key);
  if (!fresh && hit && hit.until > now) return hit.token;
  const { status, json } = await call(fetcher, "/v1/external/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: cfg.email, password: cfg.password }),
  });
  const token = (json as { token?: unknown } | null)?.token;
  if (status === 401 || status === 403 || status === 400 || status === 422) {
    throw new ShiprocketError("auth", `Shiprocket refused the API user's email or password.${messageOf(json) ? ` (${messageOf(json)})` : ""}`);
  }
  if (status < 200 || status >= 300 || typeof token !== "string" || token.length < 20 || token.length > 4_000) {
    throw new ShiprocketError("bad_response", `Shiprocket sign-in didn't return a token (HTTP ${status}).`);
  }
  tokens().set(key, { token, until: now + TOKEN_TTL_MS });
  return token;
}

// ── Serviceability ───────────────────────────────────────────────────────────────────────────────

interface Courier {
  id: number | null;
  name: string;
  days: number | null;
  cod: boolean;
  city: string | null;
  state: string | null;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 60) : null);
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d{1,3}$/.test(v.trim()) ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 60 ? Math.round(n) : null;
};
const flag = (v: unknown) => v === 1 || v === true || v === "1" || v === "true";

function couriersOf(json: unknown): { couriers: Courier[]; recommended: number | null } {
  const data = (json as { data?: unknown } | null)?.data as Record<string, unknown> | undefined;
  const list = Array.isArray(data?.available_courier_companies) ? (data!.available_courier_companies as unknown[]) : [];
  const couriers = list.slice(0, 100).flatMap((c): Courier[] => {
    if (!c || typeof c !== "object") return [];
    const o = c as Record<string, unknown>;
    return [{ id: typeof o.courier_company_id === "number" ? o.courier_company_id : null, name: str(o.courier_name) ?? "Courier", days: num(o.estimated_delivery_days), cod: flag(o.cod), city: str(o.city), state: str(o.state) }];
  });
  const rec = data?.recommended_courier_company_id;
  return { couriers, recommended: typeof rec === "number" ? rec : null };
}

/**
 * The delivery promise for a pincode: serviceable if any courier takes it; the date from the recommended courier
 * (else the fastest), counted in business days from today's dispatch; express when a courier is at least a day
 * faster and arrives within 2 business days; COD when any courier collects cash.
 */
export async function shiprocketCheck(cfg: ShiprocketConfig, pincode: string, fetcher: Fetcher = fetch, now = new Date()): Promise<DeliveryPromise & { couriers: number }> {
  if (!PINCODE_RE.test(pincode)) throw new ShiprocketError("rejected", "invalid pincode");
  const query = new URLSearchParams({ pickup_postcode: cfg.pickupPincode, delivery_postcode: pincode, weight: String(cfg.weightKg), cod: "0" });
  const ask = async (fresh: boolean) => {
    const token = await shiprocketToken(cfg, fetcher, now.getTime(), fresh);
    return call(fetcher, `/v1/external/courier/serviceability/?${query}`, { method: "GET", headers: { authorization: `Bearer ${token}` } });
  };
  let r = await ask(false);
  // An expired / revoked token: sign in again once.
  if (r.status === 401) r = await ask(true);
  if (r.status === 401 || r.status === 403) throw new ShiprocketError("auth", "Shiprocket refused the API user. Check it in Admin → Shipping.");
  if (r.status >= 500) throw new ShiprocketError("unreachable", `Shiprocket had a problem (HTTP ${r.status}). Try again in a minute.`);
  const { couriers, recommended } = couriersOf(r.json);
  const noCod = { available: false, fee: COD.fee, maxOrderValue: COD.maxOrderValue };
  // 404 / 422 / an empty list = no courier serves this pincode.
  if (couriers.length === 0) return { pincode, serviceable: false, cod: noCod, couriers: 0 };
  if (r.status < 200 || r.status >= 300) throw new ShiprocketError("bad_response", `Unexpected answer from Shiprocket (HTTP ${r.status}).`);

  const withDays = couriers.filter((c) => c.days !== null) as (Courier & { days: number })[];
  const fastest = withDays.reduce<(Courier & { days: number }) | null>((a, c) => (!a || c.days < a.days ? c : a), null);
  const rec = withDays.find((c) => c.id !== null && c.id === recommended) ?? fastest;
  const days = Math.max(1, rec?.days ?? 6);
  const place = couriers.find((c) => c.city || c.state);
  return {
    pincode,
    serviceable: true,
    ...(place?.city ? { city: place.city } : {}),
    ...(place?.state ? { state: place.state } : {}),
    standardBy: addBusinessDays(now, days),
    express: fastest && fastest.days <= 2 && fastest.days < days ? { by: addBusinessDays(now, Math.max(1, fastest.days)), fee: rupees(99) } : null,
    cod: { available: couriers.some((c) => c.cod), fee: COD.fee, maxOrderValue: COD.maxOrderValue },
    couriers: couriers.length,
  };
}
