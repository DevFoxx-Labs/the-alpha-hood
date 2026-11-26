"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { CheckoutStep, DoneLine } from "@/components/store/checkout-blocks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useHumanCheck } from "@/components/security/human-check";
import { api, ApiError } from "./api";

/**
 * CHK-02 contact: phone + OTP (creates the customer account) and optional email. One-tap sign-up shows the
 * Terms/Privacy notice next to the button (DPDP); the server records it in the consent ledger.
 */
export function ContactStep({ customer, onVerified }: { customer: { phone: string; email: string | null } | null; onVerified: () => void }) {
  const id = useId();
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<{ id: string; demoCode?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const human = useHumanCheck();

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  if (customer) {
    return (
      <CheckoutStep number={1} title="Contact" done>
        <DoneLine>
          {customer.phone} · verified{customer.email ? ` · ${customer.email}` : ""}
        </DoneLine>
      </CheckoutStep>
    );
  }

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      // A fresh bot-check token per request (undefined when the check is off).
      const turnstile = (await human.token()) ?? undefined;
      const r = await api<{ challengeId: string; demoCode?: string }>("/api/otp/send", { method: "POST", body: { phone, turnstile } });
      setChallenge({ id: r.challengeId, demoCode: r.demoCode });
      setCode("");
      setCooldown(30);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't send the code.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!challenge) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/otp/verify", { method: "POST", body: { challengeId: challenge.id, code, ...(email ? { email } : {}) } });
      onVerified();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't verify the code.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <CheckoutStep number={1} title="Contact">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (challenge) void verify();
          else void send();
        }}
        className="flex flex-col gap-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-phone`} className="text-[12px] font-bold uppercase tracking-[0.06em]">
              Mobile number
            </label>
            <div className="flex border border-input focus-within:border-black">
              <span className="grid place-items-center border-r border-line px-3 text-[14px] text-ink-2">+91</span>
              <input
                id={`${id}-phone`}
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                maxLength={10}
                value={phone}
                readOnly={!!challenge}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                className="h-12 min-w-0 flex-1 px-3 text-[14px] outline-none read-only:bg-soft"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-email`} className="text-[12px] font-bold uppercase tracking-[0.06em]">
              Email <span className="font-normal normal-case tracking-normal text-ink-2">(optional, for the invoice)</span>
            </label>
            <Input id={`${id}-email`} type="email" autoComplete="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>

        {challenge ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-code`} className="text-[12px] font-bold uppercase tracking-[0.06em]">
              6-digit code sent to +91 {phone}
            </label>
            <Input
              id={`${id}-code`}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              autoFocus
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="tabular max-w-[220px] tracking-[0.4em]"
            />
            {challenge.demoCode ? (
              <p className="border border-dashed border-ink-2 bg-white px-3 py-2 text-[12px]" role="status">
                Demo SMS (development only — no message is sent): your code is <b className="tabular">{challenge.demoCode}</b>
              </p>
            ) : null}
            <div className="flex gap-4 text-[12px]">
              <button type="button" disabled={cooldown > 0 || busy} onClick={send} className="font-semibold underline underline-offset-2 disabled:text-muted disabled:no-underline">
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
              </button>
              <button type="button" onClick={() => setChallenge(null)} className="font-semibold underline underline-offset-2">
                Change number
              </button>
            </div>
          </div>
        ) : null}

        {human.slot}
        {error ? (
          <p role="alert" className="text-[13px] font-semibold text-accent">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <Button type="submit" loading={busy} disabled={challenge ? code.length !== 6 : phone.length !== 10} className="sm:w-[220px]">
            {challenge ? "Verify & continue" : "Send code"}
          </Button>
          <p className="text-[12px] leading-[1.5] text-ink-2">
            By continuing you agree to our{" "}
            <Link href="/legal/terms" target="_blank" className="underline underline-offset-2">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/legal/privacy" target="_blank" className="underline underline-offset-2">
              Privacy Notice
            </Link>
            . We use your number to verify you and send order updates.
          </p>
        </div>
      </form>
    </CheckoutStep>
  );
}
