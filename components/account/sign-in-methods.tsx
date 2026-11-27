"use client";

import { useEffect, useId, useState } from "react";
import { api, ApiError } from "@/components/checkout/api";
import { showMessageToast } from "@/components/store/toast";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { EmailSignIn } from "./email-sign-in";
import { OtpSignIn } from "./otp-sign-in";
import { ICON, LABEL, type Provider } from "./social-sign-in";

interface MethodsData {
  linked: { provider: Provider; linkedAt: string }[];
  available: Provider[];
  methods: { phone: string | null; email: string | null; password: boolean } | null;
}

/**
 * Account → Settings → Sign-in & security: mobile number (add one with a code), email + password (set with a code
 * to the sign-in email, change with the current password), linked Google / Facebook (link, unlink). The server
 * refuses removing the last way in.
 */
export function SignInMethods({ box, h2, onChanged }: { box: string; h2: string; onChanged?: () => void }) {
  const [data, setData] = useState<MethodsData | null>(null);
  const [busy, setBusy] = useState<Provider | null>(null);
  const [panel, setPanel] = useState<"phone" | "set_password" | "change_password" | null>(null);
  const load = () =>
    api<MethodsData>("/api/account/social")
      .then(setData)
      .catch(() => setData({ linked: [], available: [], methods: null }));
  useEffect(() => {
    void load();
    const social = new URLSearchParams(window.location.search).get("social");
    if (social === "linked") showMessageToast("Linked. You can now sign in with one tap.");
    if (social === "other_account") showMessageToast("That account is already linked to a different customer account.");
  }, []);
  if (!data) return null;
  const linked = new Set(data.linked.map((l) => l.provider));
  const providers = [...new Set<Provider>([...data.available, ...data.linked.map((l) => l.provider)])];
  const m = data.methods;

  const unlink = async (p: Provider) => {
    setBusy(p);
    try {
      await api("/api/account/social", { method: "DELETE", body: { provider: p } });
      showMessageToast(`${LABEL[p]} unlinked. Use your other sign-in methods from now on, or link it again.`);
      await load();
    } catch (e) {
      showMessageToast(e instanceof ApiError ? e.message : "Couldn't unlink. Try again.");
    } finally {
      setBusy(null);
    }
  };
  const done = async (message: string) => {
    setPanel(null);
    showMessageToast(message);
    await load();
    onChanged?.();
  };

  const row = "flex flex-wrap items-center justify-between gap-3 py-3";
  return (
    <section className={box}>
      <h2 className={h2}>Sign-in &amp; security</h2>
      <p className="mb-2 text-[13px] text-ink-2">Ways you can sign in. Keep at least two, so you never get locked out.</p>
      <ul className="divide-y divide-line">
        <li className={row}>
          <span className="min-w-0 text-[14px]">
            <b className="font-semibold">Mobile number</b> <span className="text-[12.5px] text-ink-2">{m?.phone ? `${m.phone} · verified` : "Not added"}</span>
          </span>
          {!m?.phone ? (
            <Button variant="outline" size="sm" onClick={() => setPanel(panel === "phone" ? null : "phone")}>
              Add mobile number
            </Button>
          ) : null}
        </li>
        {panel === "phone" ? (
          <li className="py-4">
            <OtpSignIn social={false} submitLabel="Send code" onSignedIn={() => void done("Mobile number added.")} />
          </li>
        ) : null}
        <li className={row}>
          <span className="min-w-0 break-all text-[14px]">
            <b className="font-semibold">Email &amp; password</b>{" "}
            <span className="text-[12.5px] text-ink-2">{m?.email ? `${m.email} · ${m.password ? "password set" : "sign in with a code"}` : "Verify an email in your profile to use it for sign-in"}</span>
          </span>
          {m?.email ? (
            <Button variant="outline" size="sm" onClick={() => setPanel(panel ? null : m.password ? "change_password" : "set_password")}>
              {m.password ? "Change password" : "Set a password"}
            </Button>
          ) : null}
        </li>
        {panel === "set_password" && m?.email ? (
          <li className="max-w-[420px] py-4">
            <p className="mb-3 text-[13px] text-ink-2">We&apos;ll email a code to {m.email} to confirm it&apos;s you. Other devices are signed out.</p>
            <EmailSignIn initialMode="reset" lockedEmail={m.email} onSignedIn={() => void done("Password set. Other devices were signed out.")} />
          </li>
        ) : null}
        {panel === "change_password" ? (
          <li className="max-w-[420px] py-4">
            <ChangePassword onDone={() => void done("Password changed. Other devices were signed out.")} />
          </li>
        ) : null}
        {providers.map((p) => (
          <li key={p} className={row}>
            <span className="flex items-center gap-2.5 text-[14px] font-semibold">
              <Icon icon={ICON[p]} size={18} />
              {LABEL[p]}
              {linked.has(p) ? <span className="text-[12px] font-normal text-ink-2">Linked</span> : null}
            </span>
            {linked.has(p) ? (
              <Button variant="outline" size="sm" loading={busy === p} onClick={() => void unlink(p)}>
                Unlink
              </Button>
            ) : data.available.includes(p) ? (
              <Button variant="outline" size="sm" asChild>
                <a href={`/api/auth/social/${p}/start?next=${encodeURIComponent("/account/settings")}`}>Link</a>
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Change password: the current one is required (a stolen session alone can't change it). */
function ChangePassword({ onDone }: { onDone: () => void }) {
  const id = useId();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 8) return setError("Use at least 8 characters for your new password.");
    setBusy(true);
    setError(null);
    try {
      await api("/api/account/password", { method: "POST", body: { currentPassword: current, newPassword: next } });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't change your password.");
    } finally {
      setBusy(false);
    }
  };
  const label = "text-[12px] font-bold uppercase tracking-[0.06em]";
  return (
    <form onSubmit={submit} noValidate className="grid gap-3">
      <label htmlFor={`${id}-current`} className={label}>
        Current password
      </label>
      <Input id={`${id}-current`} type="password" autoComplete="current-password" maxLength={128} value={current} onChange={(e) => setCurrent(e.target.value)} />
      <label htmlFor={`${id}-next`} className={label}>
        New password
      </label>
      <Input id={`${id}-next`} type="password" autoComplete="new-password" maxLength={128} value={next} onChange={(e) => setNext(e.target.value)} />
      <p className="text-[12px] text-ink-2">At least 8 characters. Other devices are signed out.</p>
      {error ? (
        <p role="alert" className="text-[13px] font-semibold text-accent">
          {error}
        </p>
      ) : null}
      <Button type="submit" loading={busy} disabled={!current || next.length < 8} className="justify-self-start">
        Change password
      </Button>
    </form>
  );
}
