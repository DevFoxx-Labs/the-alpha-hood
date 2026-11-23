import { timingSafeEqual } from "node:crypto";
import type { Env } from "@/lib/mock-guard";

/**
 * Server-to-server cron calls: `Authorization: Bearer <CRON_SECRET>` (Vercel Cron sends this). Fails closed when
 * the secret is missing or shorter than 32 characters. Constant-time comparison.
 */
export function cronAuthorised(request: Request, env: Env = process.env): boolean {
  const secret = env.CRON_SECRET ?? "";
  if (secret.length < 32) return false;
  const header = request.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  return given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}
