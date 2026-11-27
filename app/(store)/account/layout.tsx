import { Suspense } from "react";
import { AccountSessionProvider } from "@/components/account/account-session";
import { currentAccount } from "@/lib/account/server";

/**
 * ACC-01 / ACC-02: decide "signed in or not" on the server before any account screen is drawn, so a guest sees the
 * sign-in form first (no account shell flashing for a few seconds while the browser asks /api/account/me).
 * The session read is request-time, so it streams in behind this boundary; the store header and footer around it
 * stay in the static shell. Personal data is only in this request's stream (account pages are noindex, no-store).
 */
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="mx-auto min-h-[60vh] max-w-[1280px]" aria-busy="true" />}>
      <Session>{children}</Session>
    </Suspense>
  );
}

async function Session({ children }: { children: React.ReactNode }) {
  const initial = await currentAccount();
  return <AccountSessionProvider initial={initial}>{children}</AccountSessionProvider>;
}
