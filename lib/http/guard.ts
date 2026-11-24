import { BackendUnavailableError } from "@/lib/mock-guard";
import { rateLimiter, type RateLimiter } from "./rate-limit";

/**
 * Shared guards for public write endpoints (consent, newsletter, privacy requests…).
 * Order: same-origin (CSRF) → rate limit per IP → content-type + size cap → JSON parse.
 */

export function jsonError(status: number, code: string, message: string, headers?: HeadersInit) {
  return Response.json({ error: { code, message } }, { status, headers });
}

/**
 * Client IP for rate limiting and the consent ledger. Takes the first X-Forwarded-For hop, which is only
 * trustworthy behind our own CDN/host (Vercel / CloudFront) that overwrites the header — see known gaps.
 */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  const ip = first || request.headers.get("x-real-ip")?.trim() || "unknown";
  // Bound and allow-list the characters (IPv4/IPv6) so the value is safe to store and log.
  return /^[0-9a-fA-F:.]{2,45}$/.test(ip) ? ip : "unknown";
}

export function userAgent(request: Request): string {
  return (request.headers.get("user-agent") ?? "").slice(0, 300);
}

/**
 * Browsers send `Origin` on every cross-origin and same-origin POST. Missing or foreign origin → refuse
 * (fail closed). `Sec-Fetch-Site`, when present, must be same-origin.
 */
export function isSameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  return originHost === host;
}

export interface WriteGuardOptions {
  /** Bucket name, e.g. "consent". */
  name: string;
  /** Requests allowed per IP per window. */
  limit: number;
  windowMs: number;
  maxBytes?: number;
  limiter?: RateLimiter;
}

export type GuardResult = { ok: true; body: unknown; ip: string } | { ok: false; response: Response };

export async function guardPublicWrite(request: Request, options: WriteGuardOptions): Promise<GuardResult> {
  const { name, limit, windowMs, maxBytes = 4_096, limiter = rateLimiter } = options;

  if (!isSameOrigin(request)) {
    return { ok: false, response: jsonError(403, "forbidden_origin", "Cross-origin requests are not allowed.") };
  }

  const ip = clientIp(request);
  const rl = await limiter.hit(`${name}:ip:${ip}`, limit, windowMs);
  if (!rl.ok) {
    return {
      ok: false,
      response: jsonError(429, "rate_limited", "Too many requests. Please try again later.", {
        "Retry-After": String(rl.retryAfterSeconds),
      }),
    };
  }

  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return { ok: false, response: jsonError(415, "unsupported_media_type", "Send JSON.") };
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) {
    return { ok: false, response: jsonError(413, "payload_too_large", "Request is too large.") };
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).length > maxBytes) {
    return { ok: false, response: jsonError(413, "payload_too_large", "Request is too large.") };
  }
  try {
    return { ok: true, body: JSON.parse(text) as unknown, ip };
  } catch {
    return { ok: false, response: jsonError(400, "invalid_json", "Malformed JSON.") };
  }
}

/** Maps service errors to responses; never leaks internals. */
export function errorResponse(error: unknown): Response {
  if (error instanceof ValidationError) return jsonError(422, "invalid_input", error.message);
  if (error instanceof BackendUnavailableError) {
    return jsonError(503, "unavailable", "This service is temporarily unavailable.");
  }
  console.error("[api] unexpected error", error instanceof Error ? error.name : "unknown");
  return jsonError(500, "server_error", "Something went wrong.");
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/** Response headers for endpoints that return personal data. */
export const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" } as const;

/**
 * Guard for raw binary uploads (return photos): same-origin, per-IP rate limit, image Content-Type, and a
 * hard size cap enforced while reading (Content-Length is not trusted). Type is re-checked by magic bytes.
 */
export async function guardPublicUpload(
  request: Request,
  options: { name: string; limit: number; windowMs: number; maxBytes: number; limiter?: RateLimiter },
): Promise<{ ok: true; bytes: Uint8Array; ip: string } | { ok: false; response: Response }> {
  const { name, limit, windowMs, maxBytes, limiter = rateLimiter } = options;
  if (!isSameOrigin(request)) return { ok: false, response: jsonError(403, "forbidden_origin", "Cross-origin requests are not allowed.") };
  const ip = clientIp(request);
  const rl = await limiter.hit(`${name}:ip:${ip}`, limit, windowMs);
  if (!rl.ok) {
    return { ok: false, response: jsonError(429, "rate_limited", "Too many uploads. Please try again later.", { "Retry-After": String(rl.retryAfterSeconds) }) };
  }
  const type = (request.headers.get("content-type") ?? "").toLowerCase();
  if (type !== "image/jpeg" && type !== "image/png") return { ok: false, response: jsonError(415, "unsupported_media_type", "Upload a JPEG or PNG photo.") };
  if (Number(request.headers.get("content-length") ?? "0") > maxBytes) {
    return { ok: false, response: jsonError(413, "payload_too_large", `Photos must be ${Math.round(maxBytes / 1_048_576)} MB or smaller.`) };
  }
  if (!request.body) return { ok: false, response: jsonError(400, "empty", "No file received.") };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return { ok: false, response: jsonError(413, "payload_too_large", `Photos must be ${Math.round(maxBytes / 1_048_576)} MB or smaller.`) };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    bytes.set(c, o);
    o += c.byteLength;
  }
  return { ok: true, bytes, ip };
}
