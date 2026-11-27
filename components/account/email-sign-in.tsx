"use client";

import { ViewIcon, ViewOffSlashIcon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { api, ApiError } from "@/components/checkout/api";
import { useHumanCheck } from "@/components/security/human-check";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";

/**
 * ACC-01 email sign-in. Four modes, one form:
 * - "password": email + password.
 * - "signup": name (optional), email, password and the unticked Terms checkbox → a code to the email → account.
 * - "code": a code to the email signs in (or creates the account; one-tap notice next to the button).
 * - "reset": email → a code → the code is checked on the server → only then the new password (forgot password;
 *   also "Set a password" in Settings). Step 2 leaves a 10-minute single-use ticket in an HttpOnly cookie.
 * The server validates everything again (password policy, the checkbox, the code); this is UX only.
 */
export type EmailMode = "password" | "signup" | "code" | "reset";
const MIN = 8;

const label = "text-[12px] font-bold uppercase tracking-[0.06em]";
const linkBtn = "font-semibold underline underline-offset-2 disabled:text-muted disabled:no-underline";

function PasswordInput({ id, value, onChange, autoComplete }: { id: string; value: string; onChange: (v: string) => void; autoComplete: "current-password" | "new-password" }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input id={id} type={visible ? "text" : "password"} autoComplete={autoComplete} maxLength={128} value={value} onChange={(e) => onChange(e.target.value)} className="pr-11" />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        aria-controls={id}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"
      >
        <Icon icon={visible ? ViewOffSlashIcon : ViewIcon} size={18} />
      </button>
    </div>
  );
}

export function EmailSignIn({
  onSignedIn,
  initialMode = "password",
  lockedEmail,
  compact = false,
}: {
  onSignedIn: (r: { created?: boolean; passwordSet?: boolean }) => void;
  initialMode?: EmailMode;
  /** Settings → "Set a password": the account's sign-in email, not editable; no mode switching. */
  lockedEmail?: string;
  /** Code only, no switching to password / sign-up (e.g. the PDP "Notify me" form). */
  compact?: boolean;
}) {
  const id = useId();
  const [mode, setMode] = useState<EmailMode>(initialMode);
  const [email, setEmail] = useState(lockedEmail ?? "");
  const [password, setPassword] = useState("");
  /** Reset only: the server accepted the code; now ask for the new password. */
  const [codeOk, setCodeOk] = useState(false);
  const [name, setName] = useState("");
  const [terms, setTerms] = useState(false);
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

  const switchMode = (m: EmailMode) => {
    setMode(m);
    setChallenge(null);
    setCode("");
    setPassword("");
    setCodeOk(false);
    setError(null);
  };

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const needsPassword = mode === "signup";
  const showPassword = mode === "password" || needsPassword || (mode === "reset" && codeOk);

  const fail = (e: unknown, fallback: string) => {
    setError(e instanceof ApiError ? e.message : fallback);
    setBusy(false);
  };

  const signInWithPassword = async () => {
    setBusy(true);
    setError(null);
    try {
      const turnstile = (await human.token()) ?? undefined;
      await api("/api/auth/password", { method: "POST", body: { email: email.trim(), password, turnstile } });
      onSignedIn({});
    } catch (e) {
      fail(e, "Couldn't sign you in.");
    }
  };

  const send = async () => {
    if (mode === "signup" && !terms) return setError("Please accept the Terms and Privacy Notice to create your account.");
    if (needsPassword && password.length < MIN) return setError(`Use at least ${MIN} characters for your password.`);
    setBusy(true);
    setError(null);
    try {
      const turnstile = (await human.token()) ?? undefined;
      const r = await api<{ challengeId: string; demoCode?: string }>("/api/auth/email/send", { method: "POST", body: { email: email.trim(), turnstile } });
      setChallenge({ id: r.challengeId, demoCode: r.demoCode });
      setCode("");
      setCooldown(30);
      setBusy(false);
    } catch (e) {
      fail(e, "Couldn't send the code.");
    }
  };

  const verify = async () => {
    if (!challenge) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "reset") {
        await api("/api/auth/email/verify", { method: "POST", body: { email: email.trim(), challengeId: challenge.id, code, intent: "reset" } });
        setCodeOk(true);
        setPassword("");
        setBusy(false);
        return;
      }
      const intent = mode === "code" ? "signin" : mode;
      const r = await api<{ created: boolean; passwordSet: boolean }>("/api/auth/email/verify", {
        method: "POST",
        body: {
          email: email.trim(),
          challengeId: challenge.id,
          code,
          intent,
          ...(needsPassword ? { password } : {}),
          ...(mode === "signup" ? { acceptTerms: terms, ...(name.trim() ? { name: name.trim() } : {}) } : {}),
        },
      });
      onSignedIn(r);
    } catch (e) {
      fail(e, "Couldn't verify the code.");
    }
  };

  const saveNewPassword = async () => {
    if (password.length < MIN) return setError(`Use at least ${MIN} characters for your password.`);
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/password/reset", { method: "POST", body: { password } });
      onSignedIn({ passwordSet: true });
    } catch (e) {
      // Ticket expired / used: start again from the code.
      if (e instanceof ApiError && e.status === 410) {
        setCodeOk(false);
        setChallenge(null);
        setCode("");
      }
      fail(e, "Couldn't save your new password.");
    }
  };

  const submitLabel = codeOk
    ? "Save new password"
    : challenge
    ? mode === "signup"
      ? "Verify & create account"
      : mode === "reset"
        ? "Verify code"
        : "Verify & sign in"
    : mode === "password"
      ? "Sign in"
      : mode === "signup"
        ? "Create account"
        : "Email me a code";
  const canSubmit = codeOk
    ? password.length >= MIN
    : challenge
      ? code.length === 6 && (!needsPassword || password.length >= MIN)
      : emailOk && (mode !== "password" || password.length > 0);

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit || busy) return;
        if (mode === "password") void signInWithPassword();
        else if (codeOk) void saveNewPassword();
        else if (challenge) void verify();
        else void send();
      }}
      className="flex flex-col gap-4"
    >
      {!lockedEmail && mode === "signup" ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-name`} className={label}>
            Name <span className="font-normal normal-case tracking-normal text-ink-2">(optional)</span>
          </label>
          <Input id={`${id}-name`} autoComplete="name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-email`} className={label}>
          Email
        </label>
        <Input
          id={`${id}-email`}
          type="email"
          inputMode="email"
          autoComplete={mode === "signup" ? "email" : "username"}
          maxLength={254}
          value={email}
          readOnly={!!lockedEmail || !!challenge}
          onChange={(e) => setEmail(e.target.value)}
          className="read-only:bg-soft"
        />
      </div>

      {mode === "reset" && !challenge && !codeOk ? (
        <p className="text-[12.5px] text-ink-2">Enter the email on your account. We&apos;ll send a 6-digit code to confirm it&apos;s you, then you choose a new password.</p>
      ) : null}
      {mode === "reset" && codeOk ? (
        <p role="status" className="text-[12.5px] font-semibold">✓ Code verified. Choose your new password — other devices will be signed out.</p>
      ) : null}

      {showPassword ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor={`${id}-password`} className={label}>
              {mode === "reset" ? "New password" : "Password"}
            </label>
            {mode === "password" ? (
              <button type="button" onClick={() => switchMode("reset")} className={`text-[12px] ${linkBtn}`}>
                Forgot password?
              </button>
            ) : null}
          </div>
          <PasswordInput id={`${id}-password`} value={password} onChange={setPassword} autoComplete={mode === "password" ? "current-password" : "new-password"} />
          {needsPassword || mode === "reset" ? <p className="text-[12px] text-ink-2">At least {MIN} characters. A short phrase is easy to remember and hard to guess.</p> : null}
        </div>
      ) : null}

      {mode === "signup" && !challenge ? (
        <div className="flex items-start gap-2.5">
          <Checkbox id={`${id}-terms`} checked={terms} onCheckedChange={(v) => setTerms(v === true)} className="mt-0.5" />
          <label htmlFor={`${id}-terms`} className="text-[13px] leading-[1.5]">
            I agree to the{" "}
            <Link href="/legal/terms" target="_blank" className="underline underline-offset-2">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/legal/privacy" target="_blank" className="underline underline-offset-2">
              Privacy Notice
            </Link>
            .
          </label>
        </div>
      ) : null}

      {challenge && !codeOk ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-code`} className={label}>
            6-digit code sent to {email.trim()}
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
          <p className="text-[12px] text-ink-2">Check your inbox (and spam folder). The code expires in 5 minutes.</p>
          {challenge.demoCode ? (
            <p className="border border-dashed border-ink-2 bg-white px-3 py-2 text-[12px]" role="status">
              Demo email (development only — no message is sent): your code is <b className="tabular">{challenge.demoCode}</b>
            </p>
          ) : null}
          <div className="flex gap-4 text-[12px]">
            <button type="button" disabled={cooldown > 0 || busy} onClick={() => void send()} className={linkBtn}>
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
            </button>
            {!lockedEmail ? (
              <button type="button" onClick={() => setChallenge(null)} className={linkBtn}>
                Change email
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {human.slot}
      {error ? (
        <p role="alert" className="text-[13px] font-semibold text-accent">
          {error}
        </p>
      ) : null}

      <Button type="submit" loading={busy} disabled={!canSubmit} className="w-full">
        {submitLabel}
      </Button>

      {!lockedEmail && !compact ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
          {mode !== "password" ? (
            <button type="button" onClick={() => switchMode("password")} className={linkBtn}>
              Sign in with password
            </button>
          ) : null}
          {mode !== "code" ? (
            <button type="button" onClick={() => switchMode("code")} className={linkBtn}>
              Email me a sign-in code
            </button>
          ) : null}
          {mode !== "signup" ? (
            <button type="button" onClick={() => switchMode("signup")} className={linkBtn}>
              New here? Create an account
            </button>
          ) : null}
        </div>
      ) : null}

      {mode === "code" ? (
        <p className="text-[12px] leading-[1.5] text-ink-2">
          New here? The code creates your account. By continuing you agree to our{" "}
          <Link href="/legal/terms" target="_blank" className="underline underline-offset-2">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/legal/privacy" target="_blank" className="underline underline-offset-2">
            Privacy Notice
          </Link>
          .
        </p>
      ) : null}
      <p className="text-[12px] leading-[1.5] text-ink-2">We never ask for your code or password on a call — don&apos;t share them with anyone.</p>
    </form>
  );
}
