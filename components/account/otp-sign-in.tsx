"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { api, ApiError } from "@/components/checkout/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useHumanCheck } from "@/components/security/human-check";
import { SocialButtons, useSocialNotice } from "./social-sign-in";

/**
 * ACC-01 phone OTP sign-in / sign-up (no passwords). `orderNumber` switches to ORD-03 track mode, where a code
 * is sent only if the phone belongs to that order (the response is the same either way).
 * The Terms/Privacy notice sits next to the button (DPDP one-tap sign-up); the server records it.
 */
export function OtpSignIn({ onSignedIn, orderNumber, submitLabel = "Continue" }: { onSignedIn: () => void; orderNumber?: string; submitLabel?: string }) {
  const id = useId();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<{ id: string; demoCode?: string; message?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const human = useHumanCheck();
  const social = useSocialNotice();

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      // A fresh bot-check token per request (null when the check is off).
      const turnstile = (await human.token()) ?? undefined;
      const r = orderNumber
        ? await api<{ challengeId: string; demoCode?: string; message: string }>("/api/track/send", { method: "POST", body: { orderNumber, phone, turnstile } })
        : await api<{ challengeId: string; demoCode?: string }>("/api/otp/send", { method: "POST", body: { phone, turnstile } });
      setChallenge({ id: r.challengeId, demoCode: r.demoCode, message: "message" in r && typeof r.message === "string" ? r.message : undefined });
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
      await api("/api/otp/verify", { method: "POST", body: { challengeId: challenge.id, code } });
      onSignedIn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't verify the code.");
      setBusy(false);
    }
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (challenge) void verify();
        else void send();
      }}
      className="flex flex-col gap-4"
    >
      {!orderNumber && social.link ? (
        <p role="status" className="border border-ink bg-white px-3 py-2.5 text-[13px] leading-[1.5]">
          <b>Almost there.</b> Verify your mobile number once to finish signing in with {social.link === "google" ? "Google" : "Facebook"}. We&apos;ll link the two, so next time one tap is enough.
        </p>
      ) : null}
      {!orderNumber && social.notice ? (
        <p role="alert" className="text-[13px] font-semibold text-accent">
          {social.notice}
        </p>
      ) : null}
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

      {challenge ? (
        <div className="flex flex-col gap-1.5">
          {challenge.message ? <p className="text-[13px] text-ink-2">{challenge.message}</p> : null}
          <label htmlFor={`${id}-code`} className="text-[12px] font-bold uppercase tracking-[0.06em]">
            6-digit code
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

      <Button type="submit" loading={busy} disabled={challenge ? code.length !== 6 : phone.length !== 10} className="w-full">
        {challenge ? "Verify" : submitLabel}
      </Button>
      {!orderNumber && !challenge && !social.link ? <SocialButtons /> : null}
      <p className="text-[12px] leading-[1.5] text-ink-2">
        By continuing you agree to our{" "}
        <Link href="/legal/terms" target="_blank" className="underline underline-offset-2">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/legal/privacy" target="_blank" className="underline underline-offset-2">
          Privacy Notice
        </Link>
        . We never ask for your code on a call — don&apos;t share it with anyone.
      </p>
    </form>
  );
}
