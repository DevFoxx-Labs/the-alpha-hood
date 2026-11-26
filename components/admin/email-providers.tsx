"use client";

import { Add01Icon, Alert02Icon, CheckmarkCircle02Icon, Delete02Icon, Mail01Icon, PencilEdit01Icon, SentIcon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import type { EmailProvidersPayload, EmailProviderView } from "@/lib/providers/email-service";
import { cn } from "@/lib/utils";
import { notify } from "./admin-shell";
import { BADGE, call, CodeField, StepUpDialog, when } from "./provider-kit";
import { AButton, AIcon, AInput, ALabel, ASelect, Confirm, EmptyState, FormDialog, PageHeader } from "./ui";

/**
 * Admin → Email providers (owner only), same model as the reference panel: add SMTP providers (presets pre-fill the
 * host / port / encryption), send a test email, make exactly one live. The password is write-only and the username
 * is masked. The list arrives with the page (server-rendered).
 */
const PAGE = "/admin/email-providers";
const WHY = "This provider sends every store email, including staff password-reset codes.";

interface Draft {
  preset: string;
  name: string;
  host: string;
  port: string;
  encryption: string;
  username: string;
  password: string;
  fromAddress: string;
  fromName: string;
  replyTo: string;
  code: string;
  testTo: string;
}

const draftFrom = (p: EmailProviderView | null): Draft => ({
  preset: p ? "custom" : "zoho",
  name: p?.name ?? "",
  host: p?.host ?? "smtp.zoho.in",
  port: String(p?.port ?? 465),
  encryption: p?.encryption ?? "ssl",
  username: "",
  password: "",
  fromAddress: p?.fromAddress ?? "",
  fromName: p?.fromName ?? "The Alpha Hood",
  replyTo: p?.replyTo ?? "",
  code: "",
  testTo: "",
});

function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <ALabel htmlFor={id}>{label}</ALabel>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function ProviderForm({ payload, editing, onClose, onSaved }: { payload: EmailProvidersPayload; editing: EmailProviderView | null; onClose: () => void; onSaved: (p: EmailProviderView) => void }) {
  const [d, setD] = useState<Draft>(() => draftFrom(editing));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const preset = payload.catalog.presets.find((p) => p.key === d.preset);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));

  async function submit() {
    if (saving) return;
    setSaving(true);
    setErrors({});
    const body = {
      name: d.name,
      host: d.host,
      port: Number(d.port),
      encryption: d.encryption,
      username: d.username,
      password: d.password,
      fromAddress: d.fromAddress,
      fromName: d.fromName,
      replyTo: d.replyTo,
      ...(editing?.active ? { code: d.code, testTo: d.testTo } : {}),
    };
    const r = editing ? await call<{ provider: EmailProviderView }>(`/api/admin/email-providers/${editing.id}`, "PATCH", body, PAGE) : await call<{ provider: EmailProviderView }>("/api/admin/email-providers", "POST", body, PAGE);
    setSaving(false);
    if (!r.ok) {
      setErrors(r.fields);
      notify("error", r.message);
      return;
    }
    notify("success", editing ? `${r.data.provider.name} saved.` : `${r.data.provider.name} added. Send a test email to verify it.`);
    onSaved(r.data.provider);
    onClose();
  }

  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title={editing ? `Edit ${editing.name}` : "Add an email provider"} description={preset?.help} submitLabel={saving ? "Saving…" : editing ? "Save changes" : "Add provider"} onSubmit={() => void submit()}>
      {!editing ? (
        <Field id="ep-preset" label="Provider">
          <ASelect
            label="Provider"
            className="w-full"
            value={d.preset}
            onValueChange={(key) => {
              const p = payload.catalog.presets.find((x) => x.key === key)!;
              set({ preset: key, host: p.host, port: String(p.port), encryption: p.encryption, username: p.username ?? d.username, name: d.name || (key === "custom" ? "" : p.label) });
            }}
            options={payload.catalog.presets.map((p) => ({ value: p.key, label: p.label }))}
          />
        </Field>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="ep-name" label="Name" error={errors.name}>
          <AInput id="ep-name" value={d.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} placeholder="e.g. Zoho — support mailbox" />
        </Field>
        <Field id="ep-host" label="SMTP host" error={errors.host}>
          <AInput id="ep-host" value={d.host} onChange={(e) => set({ host: e.target.value })} maxLength={253} placeholder="smtp.example.com" className="font-mono" autoComplete="off" spellCheck={false} />
        </Field>
        <Field id="ep-port" label="Port" error={errors.port}>
          <ASelect label="Port" className="w-full" value={d.port} onValueChange={(v) => set({ port: v })} options={payload.catalog.ports.map((p) => ({ value: String(p), label: String(p) }))} />
        </Field>
        <Field id="ep-enc" label="Encryption" error={errors.encryption}>
          <ASelect label="Encryption" className="w-full" value={d.encryption} onValueChange={(v) => set({ encryption: v })} options={payload.catalog.encryptions} />
        </Field>
        <Field id="ep-user" label="Username" error={errors.username}>
          <AInput id="ep-user" value={d.username} onChange={(e) => set({ username: e.target.value })} placeholder={editing?.usernameHint ? `${editing.usernameHint} — leave blank to keep` : "Usually the mailbox address"} autoComplete="off" spellCheck={false} />
        </Field>
        <Field id="ep-pass" label="Password" error={errors.password}>
          <AInput id="ep-pass" type="password" value={d.password} onChange={(e) => set({ password: e.target.value })} placeholder={editing?.passwordSet ? "•••••••• — leave blank to keep" : "Password, app password or API key"} autoComplete="new-password" />
        </Field>
        <Field id="ep-from" label="From address" error={errors.fromAddress}>
          <AInput id="ep-from" type="email" value={d.fromAddress} onChange={(e) => set({ fromAddress: e.target.value })} placeholder="orders@yourdomain.in" />
        </Field>
        <Field id="ep-from-name" label="From name" error={errors.fromName}>
          <AInput id="ep-from-name" value={d.fromName} onChange={(e) => set({ fromName: e.target.value })} maxLength={120} />
        </Field>
        <Field id="ep-reply" label="Reply-to (optional)" error={errors.replyTo}>
          <AInput id="ep-reply" type="email" value={d.replyTo} onChange={(e) => set({ replyTo: e.target.value })} placeholder="support@yourdomain.in" />
        </Field>
      </div>
      {editing?.active ? (
        <div className="space-y-4 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
          <p className="text-sm text-amber-800 dark:text-amber-300">This provider is live. If you change its host, port, login or from address, a test email must go through before anything is saved.</p>
          <Field id="ep-test-to" label="Send the test email to (blank = your own address)" error={errors.to}>
            <AInput id="ep-test-to" type="email" value={d.testTo} onChange={(e) => set({ testTo: e.target.value })} className="sm:w-72" />
          </Field>
          <CodeField id="ep-code" value={d.code} onChange={(v) => set({ code: v })} why={WHY} />
        </div>
      ) : null}
    </FormDialog>
  );
}

function TestDialog({ provider, onClose, onDone }: { provider: EmailProviderView | null; onClose: () => void; onDone: (p: EmailProviderView) => void }) {
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <FormDialog
      open={!!provider}
      onOpenChange={(o) => !o && onClose()}
      title={`Send a test email${provider ? ` with ${provider.name}` : ""}`}
      description="Sends one short email through the provider. Leave the address blank to send it to yourself."
      submitLabel={busy ? "Sending…" : "Send test email"}
      onSubmit={() => {
        if (!provider || busy) return;
        setBusy(true);
        void call<{ ok: boolean; message: string; provider: EmailProviderView }>(`/api/admin/email-providers/${provider.id}/test`, "POST", to ? { to } : {}, PAGE).then((r) => {
          setBusy(false);
          if (!r.ok) return notify("error", r.message);
          notify(r.data.ok ? "success" : "error", r.data.message);
          onDone(r.data.provider);
          if (r.data.ok) onClose();
        });
      }}
    >
      <Field id="test-to" label="Email address">
        <AInput id="test-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="Your own address" className="sm:w-72" />
      </Field>
    </FormDialog>
  );
}

export function EmailProvidersScreen({ initial }: { initial: EmailProvidersPayload | null }) {
  const [providers, setProviders] = useState<EmailProviderView[]>(initial?.providers ?? []);
  const [form, setForm] = useState<{ editing: EmailProviderView | null } | null>(null);
  const [testing, setTesting] = useState<EmailProviderView | null>(null);
  const [switching, setSwitching] = useState<{ provider: EmailProviderView; action: "activate" | "deactivate" } | null>(null);

  if (!initial) {
    return (
      <div className="space-y-5">
        <PageHeader title="Email providers" description="Who sends store emails." />
        <EmptyState title="Only the owner can manage email providers" description="Ask a store owner if something here needs changing." />
      </div>
    );
  }

  const put = (p: EmailProviderView) =>
    setProviders((all) => {
      const next = all.some((x) => x.id === p.id) ? all.map((x) => (x.id === p.id ? p : p.active ? { ...x, active: false } : x)) : [...all, p];
      return [...next].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
    });
  const live = providers.find((p) => p.active);
  const fallback = initial.fallback === "environment" ? "the server's own email settings (.env)" : initial.fallback === "demo" ? "the demo sender (codes shown on screen, development only)" : "nothing — no email can be sent";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Email providers"
        description="Who sends store emails (staff password-reset codes and alerts today). Add an SMTP provider, send a test email, then make it live."
        action={
          <AButton onClick={() => setForm({ editing: null })} disabled={providers.length >= initial.limits.maxProviders}>
            <AIcon icon={Add01Icon} /> Add provider
          </AButton>
        }
      />

      <div className={cn("flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm", live ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300" : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300")}>
        <AIcon icon={live ? CheckmarkCircle02Icon : Alert02Icon} className="mt-0.5" />
        <p>{live ? `Live: ${live.name} (${live.host}), sending as ${live.fromAddress}.` : `No provider is live. Emails use ${fallback}.`}</p>
      </div>

      {providers.length === 0 ? (
        <EmptyState title="No email providers yet" description="Add your mail provider's SMTP settings to start sending store emails." />
      ) : (
        <ul className="space-y-3">
          {providers.map((p) => (
            <li key={p.id} className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <AIcon icon={Mail01Icon} className="text-muted-foreground" />
                    <h2 className="text-sm font-semibold text-foreground">{p.name}</h2>
                    {p.active ? <span className={cn(BADGE, "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400")}>Live</span> : null}
                    {!p.readable ? (
                      <span className={cn(BADGE, "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400")}>Password unreadable — enter again</span>
                    ) : p.verified ? (
                      <span className={cn(BADGE, "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400")}>Tested</span>
                    ) : (
                      <span className={cn(BADGE, "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400")}>Not tested</span>
                    )}
                  </div>
                  <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
                    <div className="flex gap-1.5">
                      <dt>Server:</dt>
                      <dd className="font-mono">
                        {p.host}:{p.port} ({p.encryption === "ssl" ? "SSL/TLS" : "STARTTLS"})
                      </dd>
                    </div>
                    <div className="flex gap-1.5">
                      <dt>Login:</dt>
                      <dd className="font-mono">{p.usernameHint ?? "not set"}</dd>
                    </div>
                    <div className="flex gap-1.5">
                      <dt>From:</dt>
                      <dd className="truncate">
                        {p.fromName} &lt;{p.fromAddress}&gt;
                      </dd>
                    </div>
                  </dl>
                  {p.lastTest ? (
                    <p className={cn("mt-2 text-xs", p.lastTest.ok ? "text-muted-foreground" : "text-destructive")}>
                      {when(p.lastTest.at)} — {p.lastTest.message}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <AButton size="sm" variant="outline" onClick={() => setTesting(p)} disabled={!p.readable}>
                    <AIcon icon={SentIcon} className="h-3.5 w-3.5" /> Test
                  </AButton>
                  <AButton size="sm" variant="outline" onClick={() => setForm({ editing: p })}>
                    <AIcon icon={PencilEdit01Icon} className="h-3.5 w-3.5" /> Edit
                  </AButton>
                  {p.active ? (
                    <AButton size="sm" variant="outline" onClick={() => setSwitching({ provider: p, action: "deactivate" })}>
                      Deactivate
                    </AButton>
                  ) : (
                    <>
                      <AButton size="sm" onClick={() => setSwitching({ provider: p, action: "activate" })} disabled={!p.verified}>
                        Make live
                      </AButton>
                      <Confirm
                        trigger={
                          <AButton size="sm" variant="ghost" aria-label={`Delete ${p.name}`}>
                            <AIcon icon={Delete02Icon} className="h-3.5 w-3.5" />
                          </AButton>
                        }
                        title={`Delete ${p.name}?`}
                        description="Its SMTP login is removed. This can't be undone."
                        confirmLabel="Delete"
                        destructive
                        onConfirm={async () => {
                          const r = await call<{ ok: true }>(`/api/admin/email-providers/${p.id}`, "DELETE", {}, PAGE);
                          if (!r.ok) return notify("error", r.message);
                          setProviders((all) => all.filter((x) => x.id !== p.id));
                          notify("success", `${p.name} deleted.`);
                        }}
                      />
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        Logins are encrypted before they are stored and the password is never sent back to this page. Mail always goes over TLS with the certificate checked, and the host must be a public address.
      </p>

      {form ? <ProviderForm key={form.editing?.id ?? "new"} payload={initial} editing={form.editing} onClose={() => setForm(null)} onSaved={put} /> : null}
      <TestDialog key={testing?.id ?? "none"} provider={testing} onClose={() => setTesting(null)} onDone={put} />
      <StepUpDialog
        open={!!switching}
        onClose={() => setSwitching(null)}
        title={switching?.action === "activate" ? `Make ${switching.provider.name} live?` : `Deactivate ${switching?.provider.name ?? ""}?`}
        description={switching?.action === "activate" ? "Every store email will go through this provider from now on." : `Emails will then use ${fallback}.`}
        confirmLabel={switching?.action === "activate" ? "Make live" : "Deactivate"}
        why={WHY}
        onConfirm={async (code) => {
          if (!switching) return false;
          const r = await call<{ provider: EmailProviderView; summary: string }>(`/api/admin/email-providers/${switching.provider.id}/${switching.action}`, "POST", { code }, PAGE);
          if (!r.ok) {
            notify("error", r.message);
            return false;
          }
          put(r.data.provider);
          notify("success", r.data.summary);
          return true;
        }}
      />
    </div>
  );
}
