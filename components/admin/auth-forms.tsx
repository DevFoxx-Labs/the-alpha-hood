"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useId, useState } from "react";
import { AButton, AInput, ALabel } from "./ui";

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  const data = (await res.json().catch(() => null)) as ({ error?: { message?: string } } & T) | null;
  if (!res.ok) throw new Error(data?.error?.message ?? "Something went wrong.");
  return data as T;
}

function AuthCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo/primary-horizontal_color.svg" alt="The Alpha Hood" width={119} height={40} className="h-10 w-auto dark:hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo/primary-horizontal_color-on-dark.svg" alt="The Alpha Hood" width={119} height={40} className="hidden h-10 w-auto dark:block" />
          <span className="ml-auto text-xs font-bold tracking-widest text-muted-foreground">ADMIN</span>
        </div>
        <h1 className="mt-2 text-xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
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
      {help ? <p className="text-xs text-muted-foreground">{help}</p> : null}
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
          <AButton type="submit" className="w-full" loading={busy} disabled={code.length !== 6}>
            Verify and sign in
          </AButton>
          <button type="button" className="w-full text-xs text-muted-foreground underline" onClick={() => (setTicket(null), setEnrol(null), setCode(""))}>
            Start again
          </button>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Sign in" description="Staff only. Every sign-in needs your password and an authenticator code.">
      <form onSubmit={submitPassword} className="space-y-4">
        <Field id={`${id}-email`} label="Work email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field id={`${id}-pw`} label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
        <AButton type="submit" className="w-full" loading={busy} disabled={!email || !password}>
          Continue
        </AButton>
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
        <Field id={`${id}-p`} label="Password" type="password" autoComplete="new-password" value={form.password} onChange={set("password")} help="At least 12 characters. A passphrase works well." />
        <Field id={`${id}-t`} label="Setup token (production only)" autoComplete="off" value={form.token} onChange={set("token")} />
        {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
        <AButton type="submit" className="w-full" loading={busy}>
          Create owner
        </AButton>
      </form>
    </AuthCard>
  );
}

/** Accept a one-time staff invite: set your own password. */
export function AcceptInvite() {
  const id = useId();
  const router = useRouter();
  const { token } = useParams<{ token: string }>();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post("/api/admin/invite/accept", { token, password });
      router.replace("/admin/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't accept the invite.");
      setBusy(false);
    }
  };
  return (
    <AuthCard title="Join the team" description="Choose your password. You'll set up two-step verification at your first sign-in.">
      <form onSubmit={submit} className="space-y-4">
        <Field id={`${id}-p`} label="Password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} help="At least 12 characters." />
        {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
        <AButton type="submit" className="w-full" loading={busy} disabled={password.length < 12}>
          Set password
        </AButton>
      </form>
    </AuthCard>
  );
}
