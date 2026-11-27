"use client";

import { useEffect, useId, useState } from "react";
import { api, ApiError } from "@/components/checkout/api";
import { showMessageToast } from "@/components/store/toast";
import { Button } from "@/components/ui/button";
import { OtpInput } from "@/components/ui/otp-input";

/**
 * Account → Settings: confirm the email address on the account with a 6-digit code. Until it is confirmed, order and
 * account emails are not sent to it while the store asks for verified addresses (Settings → Security).
 */
export function EmailVerify({ email, verified, onVerified }: { email: string | null; verified: boolean; onVerified: () => void }) {
  const id = useId();
  const [challenge, setChallenge] = useState<{ id: string; demoCode?: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  if (!email) return null;
  if (verified) return <p className="text-[12px] font-semibold text-ink">✓ Verified — order updates are emailed here.</p>;

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ challengeId: string; demoCode?: string }>("/api/account/email/send", { method: "POST", body: {} });
      setChallenge({ id: r.challengeId, demoCode: r.demoCode });
      setCode("");
      setCooldown(30);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't send the code.");
    } finally {
      setBusy(false);
    }
  };
  const confirm = async (entered = code) => {
    if (!challenge || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/account/email/confirm", { method: "POST", body: { challengeId: challenge.id, code: entered } });
      showMessageToast("Email verified");
      setChallenge(null);
      onVerified();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't verify the code.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-2 border border-dashed border-ink-2 p-3">
      <p className="text-[13px] leading-[1.5]">
        <b>Not verified yet.</b> Confirm this address so we can email your order updates to it.
      </p>
      {challenge ? (
        <>
          <label htmlFor={`${id}-code`} className="text-[12px] font-bold uppercase tracking-[0.06em]">
            Code sent to {email}
          </label>
          <OtpInput
            id={`${id}-code`}
            value={code}
            autoFocus
            status={error ? "error" : "idle"}
            onChange={(v) => {
              setCode(v);
              if (error) setError(null);
            }}
            onComplete={(v) => void confirm(v)}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" size="sm" loading={busy} disabled={code.length !== 6} onClick={() => void confirm()}>
              Verify
            </Button>
            <button type="button" disabled={cooldown > 0 || busy} onClick={() => void send()} className="text-[12px] font-semibold underline underline-offset-2 disabled:text-muted disabled:no-underline">
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
            </button>
          </div>
          {challenge.demoCode ? (
            <p className="text-[12px]" role="status">
              Demo email (development only — no message is sent): your code is <b className="tabular">{challenge.demoCode}</b>
            </p>
          ) : null}
        </>
      ) : (
        <Button type="button" variant="outline" size="sm" loading={busy} onClick={() => void send()} className="justify-self-start">
          Send verification code
        </Button>
      )}
      {error ? (
        <p role="alert" className="text-[13px] font-semibold text-accent">
          {error}
        </p>
      ) : null}
    </div>
  );
}
