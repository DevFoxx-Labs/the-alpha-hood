"use client";

/** Typed fetch helpers for the checkout pages (same-origin JSON; errors carry the server's safe message). */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export async function api<T>(url: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
  const method = init.method ?? "GET";
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      cache: "no-store",
      headers: method === "GET" ? init.headers : { "Content-Type": "application/json", ...init.headers },
      body: method === "GET" ? undefined : JSON.stringify(init.body ?? {}),
    });
  } catch {
    throw new ApiError(0, "offline", "You seem to be offline. Please try again.");
  }
  const data = (await res.json().catch(() => null)) as ({ error?: { code?: string; message?: string } & Record<string, unknown> } & T) | null;
  if (!res.ok) {
    const e = data?.error;
    const message = typeof e?.message === "string" && e.message.length < 300 ? e.message : "Something went wrong. Please try again.";
    throw new ApiError(res.status, typeof e?.code === "string" ? e.code : "error", res.status === 429 ? "Too many attempts. Please wait a moment." : message, e ?? {});
  }
  return data as T;
}

/** Only same-site relative paths are followed after placing an order (no open redirect). */
export function safeRedirect(url: string): string {
  return url.startsWith("/") && !url.startsWith("//") && !url.includes("\\") ? url : "/checkout";
}

/**
 * Goes to a payment step. Same-origin paths only (`safeRedirect`). The hosted-gateway hop (`/api/payments/go/…`) is a
 * server redirect, so it needs a full page load; in-app pages use the router.
 */
export function goToPayment(url: string, push: (href: string) => void) {
  const safe = safeRedirect(url);
  if (safe.startsWith("/api/payments/go/")) window.location.assign(safe);
  else push(safe);
}
