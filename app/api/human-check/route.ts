import { connection } from "next/server";
import { readTurnstile } from "@/lib/security/turnstile";

/**
 * GET → `{ siteKey }`: the public Turnstile site key when bot protection is on, else null. The sign-in forms call
 * it once to know whether to load Cloudflare's script. Public by design (the site key is shown to every browser);
 * the secret key never leaves the server. Read at request time so a change in Admin → Settings applies at once.
 */
export async function GET() {
  await connection();
  return Response.json({ siteKey: readTurnstile()?.siteKey ?? null }, { headers: { "Cache-Control": "private, max-age=60" } });
}
