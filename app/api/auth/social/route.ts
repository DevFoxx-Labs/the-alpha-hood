import { connection } from "next/server";
import { enabledSocialProviders } from "@/lib/auth/social";
import { signInEnabled } from "@/lib/checkout/flags";

/**
 * GET → `{ providers }`: which "Continue with …" buttons to show (only those whose keys are saved, and only while
 * sign-in is on). Public by design; no keys or IDs are returned. Read at request time so Settings apply at once.
 */
export async function GET() {
  await connection();
  return Response.json({ providers: signInEnabled() ? enabledSocialProviders() : [] }, { headers: { "Cache-Control": "private, max-age=60" } });
}
