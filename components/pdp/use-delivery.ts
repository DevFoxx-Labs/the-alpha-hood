"use client";

import { useCallback, useEffect, useState } from "react";
import type { DeliveryPromise } from "@/lib/shipping";

/**
 * PDP-05 delivery state. The pincode is remembered on this device only (`ah_pincode`, listed in the Cookie
 * Policy) so the promise shows on every product; it is sent to our server only for the lookup.
 * IP / geolocation detection is not used (would need consent — see docs/known-gaps.md).
 */
export const PINCODE_KEY = "ah_pincode";
const PIN_RE = /^[1-9][0-9]{5}$/;

export function formatDeliveryDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

export function useDelivery() {
  const [promise, setPromise] = useState<DeliveryPromise | null>(null);
  const [savedPincode, setSavedPincode] = useState("");

  const check = useCallback(async (pincode: string): Promise<DeliveryPromise | null> => {
    const res = await fetch(`/api/delivery?pincode=${pincode}`);
    if (res.status === 422) return null;
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as DeliveryPromise;
    setPromise(data);
    try {
      window.localStorage.setItem(PINCODE_KEY, pincode);
    } catch {
      // storage unavailable — fine
    }
    return data;
  }, []);

  useEffect(() => {
    let saved = "";
    try {
      saved = window.localStorage.getItem(PINCODE_KEY) ?? "";
    } catch {
      saved = "";
    }
    if (!PIN_RE.test(saved)) return;
    let cancelled = false;
    fetch(`/api/delivery?pincode=${saved}`)
      .then((r) => (r.ok ? (r.json() as Promise<DeliveryPromise>) : null))
      .then((data) => {
        if (cancelled || !data) return;
        setSavedPincode(saved);
        setPromise(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return { promise, savedPincode, check };
}
