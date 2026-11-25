"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useId, useState } from "react";
import { ViewIcon, ViewOffSlashIcon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { AButton, AInput, ALabel } from "./ui";

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  const data = (await res.json().catch(() => null)) as ({ error?: { message?: string } } & T) | null;
  if (!res.ok) throw new Error(data?.error?.message ?? "Something went wrong.");
  return data as T;
}

/**
 * Staff sign-in backdrop: the storefront photo fills the page (dimmed for contrast) and the card is frosted
 * glass, so the store shows through it.
 */
function AuthCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-neutral-950 px-4 py-10">
      <Image src="/admin/login-store.webp" alt="" aria-hidden fill preload sizes="100vw" className="-z-20 object-cover" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-black/45 via-black/30 to-black/60" />
      <div className="w-full max-w-sm rounded-xl border border-white/40 bg-white/45 p-6 shadow-2xl backdrop-blur-md dark:border-white/10 dark:bg-neutral-950/45">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo/primary-horizontal_color_tm.svg" alt="The Alpha Hood" width={126} height={40} className="h-10 w-auto dark:hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo/primary-horizontal_color-on-dark_tm.svg" alt="The Alpha Hood" width={126} height={40} className="hidden h-10 w-auto dark:block" />
          <span className="ml-auto text-xs font-bold tracking-widest text-foreground/70">ADMIN</span>
        </div>
        <h1 className="mt-2 text-xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-foreground/75">{description}</p>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

function Field({ id, label, help, ...props }: React.ComponentProps<"input"> & { id: string; label: string; help?: string }) {
  return (
    <div className="space-y-1.5">
      <ALabel htmlFor={id}>{label}</ALabel>
      <AInput id={id} {...props} />
      {help ? <p className="text-xs text-foreground/70">{help}</p> : null}
    </div>
  );
}

/** Password input with a show / hide toggle (the toggle never submits the form). `aside` sits right of the label. */
function PasswordField({ id, label, help, aside, ...props }: Omit<React.ComponentProps<"input">, "type"> & { id: string; label: string; help?: string; aside?: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <ALabel htmlFor={id}>{label}</ALabel>
        {aside}
      </div>
      <div className="relative">
        <AInput id={id} type={visible ? "text" : "password"} className="pr-10" {...props} />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          aria-controls={id}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-foreground/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
        >
          <Icon icon={visible ? ViewOffSlashIcon : ViewIcon} size={18} />
        </button>
      </div>
      {help ? <p className="text-xs text-foreground/70">{help}</p> : null}
    </div>
  );
}

/** Admin sign-in: password → (first time) set up authenticator → 6-digit code. MFA is never optional. */
export function AdminLogin() {
  const id = useId();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [ticket, setTicket] = useState<string | null>(null);
  const [enrol, setEnrol] = useState<{ secret: string; uri: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupNeeded, setSetupNeeded] = useState(false);

  useEffect(() => {
    fetch("/api/admin/setup", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { needed: false }))
      .then((d: { needed: boolean }) => setSetupNeeded(d.needed))
      .catch(() => undefined);
  }, []);

  const next = params.get("next");
  const target = next && next.startsWith("/admin") && !next.startsWith("//") ? next : "/admin";

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ ticket: string; step: "totp" | "enrol" }>("/api/admin/login", { email, password });
      setTicket(r.ticket);
      setPassword("");
      if (r.step === "enrol") setEnrol(await post<{ secret: string; uri: string }>("/api/admin/totp/enrol", { ticket: r.ticket }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't sign in.");
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post("/api/admin/totp/verify", { ticket, code });
      router.replace(target);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't verify.");
      setBusy(false);
    }
  };

  if (ticket) {
    return (
      <AuthCard
        title={enrol ? "Set up two-step verification" : "Enter your code"}
        description={enrol ? "Required for every staff account. Use Google Authenticator, Microsoft Authenticator, 1Password or any TOTP app." : "Open your authenticator app and enter the 6-digit code."}
      >
        <form onSubmit={submitCode} className="space-y-4">
          {enrol ? (
            <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3">
              <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
                <li>Open your authenticator app and choose “Scan a QR code”.</li>
                <li>Scan the code below, then enter the 6-digit code it shows.</li>
              </ol>
              {/* Drawn in the browser from the enrolment response; the secret never goes to a third-party QR service. */}
              <div className="mx-auto w-fit rounded-md bg-white p-3">
                <QRCodeSVG value={enrol.uri} size={176} level="M" marginSize={0} title="Authenticator setup QR code" />
              </div>
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground underline underline-offset-2">Can&apos;t scan? Enter the key instead</summary>
                <p className="mt-2 text-muted-foreground">Setup key (type “time-based”, 6 digits, 30 seconds):</p>
                <p className="mt-1 select-all break-all font-mono text-sm tracking-wider">{enrol.secret.replace(/(.{4})/g, "$1 ").trim()}</p>
                <a href={enrol.uri} className="mt-2 inline-block underline underline-offset-2">
                  Open in an authenticator app on this device
                </a>
              </details>
            </div>
          ) : null}
          <Field id={`${id}-code`} label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} autoFocus onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
          {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
          <div className="flex items-center justify-between gap-3">
            <button type="button" className="text-xs text-foreground/70 underline" onClick={() => (setTicket(null), setEnrol(null), setCode(""))}>
              Start again
            </button>
            <AButton type="submit" loading={busy} disabled={code.length !== 6}>
              Verify and sign in
            </AButton>
          </div>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Sign in" description="Staff only. Every sign-in needs your password and an authenticator code.">
      <form onSubmit={submitPassword} className="space-y-4">
        {params.get("reset") === "1" ? (
          <p role="status" className="rounded-md border border-emerald-600/30 bg-emerald-50/80 px-3 py-2 text-xs text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-100">
            Password updated. Sign in with your new password and your authenticator code.
          </p>
        ) : null}
        <Field id={`${id}-email`} label="Work email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        <PasswordField
          id={`${id}-pw`}
          label="Password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aside={
            <Link href="/admin/forgot" className="text-xs font-medium underline underline-offset-2">
              Forgot password?
            </Link>
          }
        />
        {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
        <div className="flex justify-end">
          <AButton type="submit" loading={busy} disabled={!email || !password}>
            Continue
          </AButton>
        </div>
        {setupNeeded ? (
          <p className="text-center text-xs text-muted-foreground">
            No staff yet?{" "}
            <Link href="/admin/setup" className="underline underline-offset-2">
              Create the owner account
            </Link>
          </p>
        ) : null}
      </form>
    </AuthCard>
  );
}

/** First owner (only while no staff exist; production also needs the setup token). */
export function AdminSetup() {
  const id = useId();
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", token: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post("/api/admin/setup", { name: form.name, email: form.email, password: form.password, ...(form.token ? { token: form.token } : {}) });
      router.replace("/admin/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the owner.");
      setBusy(false);
    }
  };
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <AuthCard title="Create the owner account" description="One-time setup. You'll set up two-step verification when you first sign in.">
      <form onSubmit={submit} className="space-y-4">
        <Field id={`${id}-n`} label="Your name" autoComplete="name" value={form.name} onChange={set("name")} />
        <Field id={`${id}-e`} label="Work email" type="email" autoComplete="username" value={form.email} onChange={set("email")} />
        <PasswordField id={`${id}-p`} label="Password" autoComplete="new-password" value={form.password} onChange={set("password")} help="At least 12 characters. A passphrase works well." />
        <Field id={`${id}-t`} label="Setup token (production only)" autoComplete="off" value={form.token} onChange={set("token")} />
        {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
        <div className="flex justify-end">
          <AButton type="submit" loading={busy}>
            Create owner
          </AButton>
        </div>
      </form>
    </AuthCard>
  );
}

/**
 * One-time link from an owner: a staff invite ("join", set your first password) or a password-reset link
 * ("reset", set a new one). Both post to the same endpoint; the server decides from the token what it is.
 */
export function AcceptInvite({ mode = "join" }: { mode?: "join" | "reset" }) {
  const id = useId();
  const router = useRouter();
  const { token } = useParams<{ token: string }>();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reset = mode === "reset";
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post("/api/admin/invite/accept", { token, password });
      router.replace(reset ? "/admin/login?reset=1" : "/admin/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : reset ? "Couldn't reset the password." : "Couldn't accept the invite.");
      setBusy(false);
    }
  };
  return (
    <AuthCard
      title={reset ? "Set a new password" : "Join the team"}
      description={
        reset
          ? "Choose a new password. You'll still need your authenticator code to sign in, and you'll be signed out everywhere else."
          : "Choose your password. You'll set up two-step verification at your first sign-in."
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <PasswordField id={`${id}-p`} label={reset ? "New password" : "Password"} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} help="At least 12 characters." />
        {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
        <div className="flex justify-end">
          <AButton type="submit" loading={busy} disabled={password.length < 12}>
            {reset ? "Save new password" : "Set password"}
          </AButton>
        </div>
      </form>
    </AuthCard>
  );
}

/**
 * "Forgot password?" — self-service for every staff member, owners included:
 * email → 6-digit code by email → code + new password → back to sign-in (the authenticator code is still needed).
 * The server answers the same for unknown emails, so this screen never says whether an address is staff.
 */
export function AdminForgotPassword() {
  const id = useId();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [challenge, setChallenge] = useState<{ id: string; demoCode?: string } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const sendCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ challengeId: string; demoCode?: string }>("/api/admin/password/forgot", { email });
      setChallenge({ id: r.challengeId, demoCode: r.demoCode });
      setCode("");
      setCooldown(30);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the code.");
    } finally {
      setBusy(false);
    }
  };

  const reset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challenge) return;
    setBusy(true);
    setError(null);
    try {
      await post("/api/admin/password/reset", { email, challengeId: challenge.id, code, password });
      router.replace("/admin/login?reset=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reset the password.");
      setBusy(false);
    }
  };

  if (!challenge) {
    return (
      <AuthCard title="Forgot your password?" description="Enter your work email. If it belongs to a staff account, we'll email you a 6-digit code.">
        <form onSubmit={sendCode} className="space-y-4">
          <Field id={`${id}-email`} label="Work email" type="email" autoComplete="username" value={email} autoFocus onChange={(e) => setEmail(e.target.value)} />
          {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
          <div className="flex items-center justify-between gap-3">
            <Link href="/admin/login" className="text-xs text-foreground/70 underline underline-offset-2">
              Back to sign in
            </Link>
            <AButton type="submit" loading={busy} disabled={!email}>
              Send code
            </AButton>
          </div>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Check your email" description={`If ${email} is a staff account, a 6-digit code is on its way. It works once and expires in 5 minutes.`}>
      <form onSubmit={reset} className="space-y-4">
        {challenge.demoCode ? (
          <p role="status" className="rounded-md border border-dashed border-foreground/40 bg-background/70 px-3 py-2 text-xs">
            Demo email (development only — nothing was sent): your code is <b className="font-mono">{challenge.demoCode}</b>
          </p>
        ) : null}
        <Field
          id={`${id}-code`}
          label="6-digit code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          autoFocus
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        />
        <PasswordField id={`${id}-pw`} label="New password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} help="At least 12 characters. You'll still need your authenticator code to sign in." />
        {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
        <div className="flex items-center justify-between gap-3">
          <button type="button" disabled={cooldown > 0 || busy} onClick={() => void sendCode()} className="text-xs text-foreground/70 underline underline-offset-2 disabled:no-underline disabled:opacity-60">
            {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
          </button>
          <AButton type="submit" loading={busy} disabled={code.length !== 6 || password.length < 12}>
            Save new password
          </AButton>
        </div>
        <p className="text-xs text-foreground/70">
          No email? Check spam, or ask an owner for a reset link from <span className="font-medium">Staff</span>. Lost your authenticator too? An owner
          can also use <span className="font-medium">Reset 2-step</span>.
        </p>
        <button type="button" className="text-xs text-foreground/70 underline underline-offset-2" onClick={() => (setChallenge(null), setError(null))}>
          Use a different email
        </button>
      </form>
    </AuthCard>
  );
}
