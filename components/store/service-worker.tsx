"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js (PWA: installable + offline page) in production only, after the page has loaded so it never
 * competes with LCP. No push notifications yet (needs a push provider / VAPID keys — owner decision).
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const register = () => navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
