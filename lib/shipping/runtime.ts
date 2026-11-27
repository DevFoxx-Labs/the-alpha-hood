import type { Env } from "@/lib/mock-guard";
import { type ProviderStore, resolveProviderStore } from "@/lib/providers/store";
import type { ShiprocketConfig } from "./shiprocket";

/**
 * Which courier account answers delivery checks for this server process (Admin → Shipping). Kept in memory —
 * loaded at boot (instrumentation.ts), re-read after every admin change on this instance and refreshed every minute
 * so other instances follow. None live (or the database down) = the development demo, or "unavailable" in production.
 */
export const SHIPPING_ID = "shp_shiprocket";
export const SHIPPING_REFRESH_MS = 60_000;

export interface ShippingDoc {
  shiprocket?: ShiprocketConfig;
  lastTest: { ok: boolean; at: string; message: string } | null;
  activatedAt: string | null;
  updatedBy: string;
  updatedAtIso: string;
}

const g = globalThis as unknown as { __alpha_hood_shipping_live?: ShiprocketConfig | null; __alpha_hood_shipping_timer?: ReturnType<typeof setInterval> };

export const liveShiprocket = (): ShiprocketConfig | null => g.__alpha_hood_shipping_live ?? null;
export function setLiveShiprocket(cfg: ShiprocketConfig | null) {
  g.__alpha_hood_shipping_live = cfg;
}

/** Reads the store and installs the live account. Never throws: on failure the current one stays. */
export async function refreshShipping(store?: ProviderStore, env: Env = process.env): Promise<boolean> {
  try {
    const row = (await (store ?? resolveProviderStore(env)).list<ShippingDoc>("shipping")).find((r) => r.id === SHIPPING_ID);
    setLiveShiprocket(row?.active && row.doc?.shiprocket ? row.doc.shiprocket : null);
    return true;
  } catch {
    return false;
  }
}

export async function startShippingRuntime(): Promise<void> {
  await refreshShipping();
  if (g.__alpha_hood_shipping_timer) return;
  g.__alpha_hood_shipping_timer = setInterval(() => void refreshShipping(), SHIPPING_REFRESH_MS);
  g.__alpha_hood_shipping_timer.unref?.();
}
