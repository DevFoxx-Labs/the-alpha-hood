"use client";

import { createContext, useContext, useState } from "react";
import type { Me } from "./account-frame";

/**
 * The account session decided on the server for this visit (app/(store)/account/layout.tsx), shared by every
 * /account page. It lives in the layout, so moving between account pages keeps it; sign-in, sign-out and profile
 * changes update it, so the next page never shows a stale "signed out" or an old profile.
 */
export type InitialAccount = { known: true; me: Me | null } | { known: false };

const Ctx = createContext<{ state: InitialAccount; set: (me: Me | null) => void } | null>(null);

export function AccountSessionProvider({ initial, children }: { initial: InitialAccount; children: React.ReactNode }) {
  const [state, setState] = useState<InitialAccount>(initial);
  return <Ctx value={{ state, set: (me) => setState({ known: true, me }) }}>{children}</Ctx>;
}

/** null outside the /account layout (then the frame asks the API, as before). */
export const useAccountSession = () => useContext(Ctx);
