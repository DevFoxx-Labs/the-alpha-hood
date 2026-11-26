"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Cloudflare Turnstile for the forms that request a sign-in code. Nothing loads unless the store has Turnstile
 * switched on (`GET /api/human-check` → site key). Then Cloudflare's script loads on this form only, and a fresh
 * single-use token is fetched each time a code is requested. The widget stays hidden unless Cloudflare needs the
 * person to interact. The server decides — this component only fetches the token it will check.
 */
interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  execute(el: HTMLElement | string): void;
  reset(id: string): void;
  remove(id: string): void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<TurnstileApi> | null = null;
let keyPromise: Promise<string | null> | null = null;

function loadScript(): Promise<TurnstileApi> {
  return (scriptPromise ??= new Promise<TurnstileApi>((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.defer = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile missing")));
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("turnstile blocked"));
    };
    document.head.appendChild(s);
  }));
}

function siteKey(): Promise<string | null> {
  return (keyPromise ??= fetch("/api/human-check")
    .then((r) => (r.ok ? (r.json() as Promise<{ siteKey: string | null }>) : { siteKey: null }))
    .then((d) => d.siteKey)
    .catch(() => {
      keyPromise = null;
      return null;
    }));
}

/**
 * `slot` goes inside the form (it reserves no space until Cloudflare shows a challenge).
 * `token()` resolves to a fresh token, or null when the check is off or couldn't run — the server then decides.
 */
export function useHumanCheck() {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const waiting = useRef<((t: string | null) => void) | null>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void siteKey().then((key) => {
      if (cancelled || !key || !box.current) return;
      setOn(true);
      loadScript()
        .then((api) => {
          if (cancelled || !box.current || widget.current) return;
          const done = (t: string | null) => {
            waiting.current?.(t);
            waiting.current = null;
          };
          widget.current = api.render(box.current, {
            sitekey: key,
            execution: "execute",
            appearance: "interaction-only",
            callback: (t: string) => done(t),
            "error-callback": () => done(null),
            "timeout-callback": () => done(null),
          });
        })
        .catch(() => undefined);
    });
    return () => {
      cancelled = true;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, []);

  const token = useCallback(async (): Promise<string | null> => {
    const key = await siteKey();
    if (!key) return null;
    const api = await loadScript().catch(() => null);
    if (!api || !widget.current) return null;
    return new Promise<string | null>((resolve) => {
      const t = window.setTimeout(() => {
        waiting.current = null;
        resolve(null);
      }, 20_000);
      waiting.current = (v) => {
        window.clearTimeout(t);
        resolve(v);
      };
      api.reset(widget.current!); // tokens are single use: always a new one
      api.execute(widget.current!);
    });
  }, []);

  return { slot: <div ref={box} className={on ? "empty:hidden" : "hidden"} aria-live="polite" />, token };
}
