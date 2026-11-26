import { INDIA_BOUNDS } from "@/lib/checkout/address";
import { INDIAN_STATES } from "@/lib/checkout/address-types";
import type { Env } from "@/lib/mock-guard";
import { readSiteUrl } from "@/lib/seo/site";

/**
 * Turns a map pin into address suggestions (reverse geocoding) and a pincode into a map position, on the SERVER:
 * the customer's browser never talks to the geocoder, so their IP address isn't shared with it.
 *
 * - Providers are fixed hosts: OpenStreetMap Nominatim (default, no key) or Google Geocoding (key in
 *   Admin → Settings → Maps). No setting can point the server at another address.
 * - Nominatim's usage policy: an identifying User-Agent, at most 1 request a second, results cached. This server
 *   keeps to that with a queue and an in-memory cache; for high traffic use Google (or a paid Nominatim host).
 * - Only the coordinates (rounded) or the pincode are sent — never a name, phone or house number.
 * - Results are suggestions: the customer sees them filled in and can change every field.
 */
export interface AddressSuggestion {
  pincode: string;
  city: string;
  state: string;
  /** Area / street / locality, best effort. */
  area: string;
}

export interface GeoDeps {
  fetcher?: typeof fetch;
  env?: Env;
}

const TIMEOUT_MS = 6_000;
const cache = new Map<string, { at: number; value: unknown }>();
const CACHE_MS = 24 * 3_600_000;
const CACHE_MAX = 2_000;

function cached<T>(key: string): T | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_MS) {
    cache.delete(key);
    return undefined;
  }
  return hit.value as T;
}
function remember(key: string, value: unknown) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: Date.now(), value });
}

/** Nominatim allows one request a second per application: calls are spaced out on this server. */
let nextSlot = 0;
async function nominatimTurn(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + 1_100;
  if (wait > 4_000) throw new Error("busy");
  if (wait) await new Promise((r) => setTimeout(r, wait));
}

export const googleKey = (env: Env = process.env) => {
  const k = env.GOOGLE_MAPS_API_KEY?.trim() ?? "";
  return /^[A-Za-z0-9_-]{30,60}$/.test(k) ? k : null;
};
const googleChosen = (env: Env) => env.MAP_GEOCODER === "google" && !!googleKey(env);

function matchState(raw: string): string {
  const s = raw.trim().toLowerCase();
  const alias: Record<string, string> = { "nct of delhi": "Delhi", "national capital territory of delhi": "Delhi", orissa: "Odisha", pondicherry: "Puducherry", "jammu & kashmir": "Jammu and Kashmir" };
  return alias[s] ?? INDIAN_STATES.find((x) => x.toLowerCase() === s) ?? "";
}
const clean = (v: unknown, max = 80) => (typeof v === "string" ? v.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max) : "");

async function getJson(fetcher: typeof fetch, url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const res = await fetcher(url, { redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: "application/json", ...headers } });
  if (!res.ok) throw new Error(`geocoder ${res.status}`);
  return res.json();
}

export function inIndia(lat: number, lng: number): boolean {
  const b = INDIA_BOUNDS;
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;
}

/** Pin → address suggestion, or null when nothing useful was found / the geocoder is unavailable. */
export async function reverseGeocode(lat: number, lng: number, deps: GeoDeps = {}): Promise<AddressSuggestion | null> {
  if (!inIndia(lat, lng)) return null;
  const env = deps.env ?? process.env;
  const fetcher = deps.fetcher ?? fetch;
  // ~11 m grid: nearby taps share a cache entry, and the geocoder never gets more precision than it needs.
  const la = lat.toFixed(4);
  const lo = lng.toFixed(4);
  const key = `r:${googleChosen(env) ? "g" : "o"}:${la},${lo}`;
  const hit = cached<AddressSuggestion | null>(key);
  if (hit !== undefined) return hit;
  let out: AddressSuggestion | null = null;
  try {
    if (googleChosen(env)) {
      const data = (await getJson(fetcher, `https://maps.googleapis.com/maps/api/geocode/json?${new URLSearchParams({ latlng: `${la},${lo}`, key: googleKey(env)!, region: "in", language: "en" })}`)) as {
        status?: string;
        results?: { address_components?: { long_name: string; types: string[] }[] }[];
      };
      const parts = data.status === "OK" ? (data.results?.[0]?.address_components ?? []) : [];
      const pick = (...types: string[]) => parts.find((p) => types.some((t) => p.types.includes(t)))?.long_name ?? "";
      out = {
        pincode: pick("postal_code"),
        city: clean(pick("locality") || pick("administrative_area_level_3") || pick("administrative_area_level_2")),
        state: matchState(pick("administrative_area_level_1")),
        area: clean([pick("sublocality_level_2"), pick("sublocality_level_1", "sublocality"), pick("route")].filter(Boolean).join(", "), 120),
      };
    } else {
      await nominatimTurn();
      const data = (await getJson(
        fetcher,
        `https://nominatim.openstreetmap.org/reverse?${new URLSearchParams({ format: "jsonv2", lat: la, lon: lo, zoom: "18", addressdetails: "1", "accept-language": "en" })}`,
        { "user-agent": `TheAlphaHoodStore/1.0 (+${readSiteUrl(env)})` },
      )) as { address?: Record<string, string> };
      const a = data.address ?? {};
      out = {
        pincode: clean(a.postcode, 10),
        city: clean(a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? a.state_district),
        state: matchState(a.state ?? ""),
        area: clean([a.neighbourhood ?? a.quarter, a.suburb, a.road].filter(Boolean).join(", "), 120),
      };
    }
  } catch {
    return null; // not cached: try again next time
  }
  if (out && !/^[1-9]\d{5}$/.test(out.pincode)) out.pincode = "";
  if (out && !out.pincode && !out.city && !out.state && !out.area) out = null;
  remember(key, out);
  return out;
}

/** Pincode → a map position to centre on, or null. */
export async function locatePincode(pincode: string, deps: GeoDeps = {}): Promise<{ lat: number; lng: number } | null> {
  if (!/^[1-9]\d{5}$/.test(pincode)) return null;
  const env = deps.env ?? process.env;
  const fetcher = deps.fetcher ?? fetch;
  const key = `p:${googleChosen(env) ? "g" : "o"}:${pincode}`;
  const hit = cached<{ lat: number; lng: number } | null>(key);
  if (hit !== undefined) return hit;
  let out: { lat: number; lng: number } | null = null;
  try {
    if (googleChosen(env)) {
      const data = (await getJson(fetcher, `https://maps.googleapis.com/maps/api/geocode/json?${new URLSearchParams({ components: `postal_code:${pincode}|country:IN`, key: googleKey(env)! })}`)) as {
        status?: string;
        results?: { geometry?: { location?: { lat: number; lng: number } } }[];
      };
      const loc = data.status === "OK" ? data.results?.[0]?.geometry?.location : undefined;
      if (loc) out = { lat: loc.lat, lng: loc.lng };
    } else {
      await nominatimTurn();
      const data = (await getJson(fetcher, `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ format: "jsonv2", postalcode: pincode, countrycodes: "in", limit: "1" })}`, {
        "user-agent": `TheAlphaHoodStore/1.0 (+${readSiteUrl(env)})`,
      })) as { lat?: string; lon?: string }[];
      if (Array.isArray(data) && data[0]?.lat && data[0]?.lon) out = { lat: Number(data[0].lat), lng: Number(data[0].lon) };
    }
  } catch {
    return null;
  }
  if (out && !inIndia(out.lat, out.lng)) out = null;
  remember(key, out);
  return out;
}

/** Tests only. */
export function clearGeoCache() {
  cache.clear();
  nextSlot = 0;
}
