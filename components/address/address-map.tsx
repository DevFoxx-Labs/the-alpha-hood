"use client";

import "leaflet/dist/leaflet.css";
import type * as L from "leaflet";
import { useEffect, useRef, useState } from "react";
import type { GeoPoint } from "@/lib/checkout/address-types";

/**
 * The map inside the address form (Leaflet). Loaded only when the form is open (dynamic import from
 * address-form.tsx), so no other page carries its code. Tap the map or drag the pin to place it; the parent turns
 * the pin into address suggestions. No coordinates are ever shown as numbers.
 * Tiles: GET /api/geo/tiles (OpenStreetMap, or MapTiler when the owner saved a key).
 */
const INDIA_CENTRE: GeoPoint = { lat: 22.5, lng: 79 };
const PIN_ZOOM = 17;

export interface AddressMapProps {
  value: GeoPoint | null;
  /** Where to look when there is no pin yet (e.g. the pincode's area). */
  focus: GeoPoint | null;
  onChange: (p: GeoPoint) => void;
}

/** A plain CSS pin (no image assets, no icon library inside the map). */
const pinHtml = '<span class="ah-pin" aria-hidden="true"></span>';

export default function AddressMap({ value, focus, onChange }: AddressMapProps) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const lib = useRef<typeof L | null>(null);
  const changeRef = useRef(onChange);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    changeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [leaflet, tiles] = await Promise.all([import("leaflet"), fetch("/api/geo/tiles").then((r) => r.json() as Promise<{ url: string; attribution: string; maxZoom: number }>)]);
        if (cancelled || !box.current || map.current) return;
        lib.current = leaflet;
        const start = value ?? focus ?? INDIA_CENTRE;
        const m = leaflet.map(box.current, { center: [start.lat, start.lng], zoom: value ? PIN_ZOOM : focus ? 14 : 4, zoomControl: true, attributionControl: true });
        leaflet.tileLayer(tiles.url, { attribution: tiles.attribution, maxZoom: tiles.maxZoom }).addTo(m);
        m.on("click", (e: L.LeafletMouseEvent) => changeRef.current({ lat: e.latlng.lat, lng: e.latlng.lng }));
        map.current = m;
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
    // Built once; later pin / focus changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pin follows the value; dragging it reports the new place.
  useEffect(() => {
    const m = map.current;
    const leaflet = lib.current;
    if (!m || !leaflet) return;
    if (!value) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    if (!marker.current) {
      marker.current = leaflet
        .marker([value.lat, value.lng], { draggable: true, keyboard: true, title: "Delivery location — drag to adjust", icon: leaflet.divIcon({ className: "ah-pin-wrap", html: pinHtml, iconSize: [28, 36], iconAnchor: [14, 34] }) })
        .addTo(m);
      marker.current.on("dragend", () => {
        const p = marker.current!.getLatLng();
        changeRef.current({ lat: p.lat, lng: p.lng });
      });
    } else marker.current.setLatLng([value.lat, value.lng]);
    if (m.getZoom() < 15) m.setView([value.lat, value.lng], PIN_ZOOM);
    else m.panTo([value.lat, value.lng]);
  }, [value]);

  // No pin yet: move to the pincode's area when it becomes known.
  useEffect(() => {
    if (!value && focus && map.current) map.current.setView([focus.lat, focus.lng], 14);
  }, [focus, value]);

  if (failed) return <p className="border border-line p-3 text-[13px] text-ink-2">The map couldn&apos;t load. You can still type the address below.</p>;
  return <div ref={box} className="relative z-0 h-[260px] w-full border border-line bg-soft sm:h-[300px]" role="application" aria-label="Map: tap to place your delivery pin, or drag the pin to adjust" />;
}
