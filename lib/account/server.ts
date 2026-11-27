import { headers } from "next/headers";
import { connection } from "next/server";
import { customerIdFromRequest, SESSION_COOKIE } from "@/lib/auth/session";
import { accountsEnabled, checkoutEnabled } from "@/lib/checkout/flags";
import { type AccountView, accountView } from "./me";

/**
 * Who is signed in, for the server-rendered /account pages — the same session check as `requireAccount`
 * (cookie → hashed token → expiry → customer), read from the incoming request. The first HTML is then already the
 * right screen: the sign-in form for a guest, the account for a customer — never the account shell first and the
 * form a few seconds later. The pages' APIs still check the session on every call.
 *
 * - `{ known: true, me: null }` → signed out (no cookie, expired / revoked session, deleted customer).
 * - `{ known: false }` → couldn't decide here (accounts switched off, backend unavailable): the browser asks
 *   GET /api/account/me and shows its error handling, as before.
 */
export type AccountSession = { known: true; me: AccountView | null } | { known: false };

export async function currentAccount(): Promise<AccountSession> {
  if (!accountsEnabled() && !checkoutEnabled()) return { known: false };
  const cookie = (await headers()).get("cookie") ?? "";
  // No session cookie at all: signed out, nothing to look up.
  if (!cookie.includes(`${SESSION_COOKIE}=`)) return { known: true, me: null };
  // The check compares expiry times with the clock: request time only, never a prerender.
  await connection();
  try {
    const customerId = await customerIdFromRequest(new Request("http://store.internal/", { headers: { cookie } }));
    if (!customerId) return { known: true, me: null };
    return { known: true, me: await accountView(customerId) };
  } catch {
    return { known: false };
  }
}
