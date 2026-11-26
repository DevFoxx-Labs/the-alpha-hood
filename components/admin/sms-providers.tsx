"use client";

import { Add01Icon, Alert02Icon, CheckmarkCircle02Icon, Delete02Icon, Message01Icon, PencilEdit01Icon, SentIcon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { BADGE, call, CodeField, StepUpDialog, when } from "./provider-kit";
import type { SmsProvidersPayload, SmsProviderView } from "@/lib/providers/sms-service";
import { cn } from "@/lib/utils";
import { notify } from "./admin-shell";
import { AButton, AIcon, AInput, ALabel, ASelect, Confirm, EmptyState, FormDialog, PageHeader } from "./ui";

/**
 * Admin → SMS providers (owner only). Same model as the reference panel: add providers, send a test SMS, and make
 * exactly one of them live. Keys are write-only — the page gets a masked hint, never the key.
 * The list arrives with the page (server-rendered); every action returns the updated row.
 */
type Driver = SmsProvidersPayload["catalog"]["drivers"][number];
const PAGE = "/admin/sms-providers";
const WHY = "This provider sends every sign-in code.";

interface Draft {
  name: string;
  driver: string;
  credentials: Record<string, string>;
  senderId: string;
  otpTemplate: string;
  templates: Record<string, string>;
  code: string;
  testTo: string;
}

const draftFrom = (p: SmsProviderView | null, first: string): Draft => ({
  name: p?.name ?? "",
  driver: p?.driver ?? first,
  credentials: {},
  senderId: p?.senderId ?? "",
  otpTemplate: p?.otpTemplate ?? "",
  templates: { ...(p?.templates as Record<string, string> | undefined) },
  code: "",
  testTo: "",
});

function ProviderForm({ payload, editing, open, onClose, onSaved }: { payload: SmsProvidersPayload; editing: SmsProviderView | null; open: boolean; onClose: () => void; onSaved: (p: SmsProviderView) => void }) {
  const [d, setD] = useState<Draft>(() => draftFrom(editing, payload.catalog.drivers[0].value));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const spec: Driver = payload.catalog.drivers.find((x) => x.value === d.driver) ?? payload.catalog.drivers[0];
  const sameDriver = editing?.driver === d.driver;
  const err = (key: string) => (errors[key] ? <p className="text-xs text-destructive">{errors[key]}</p> : null);

  async function submit() {
    if (saving) return;
    setSaving(true);
    setErrors({});
    const body = {
      name: d.name,
      driver: d.driver,
      credentials: d.credentials,
      ...(spec.sender ? { senderId: d.senderId } : {}),
      otpTemplate: d.otpTemplate,
      ...(spec.messageTemplates ? { templates: d.templates } : {}),
      ...(editing?.active ? { code: d.code, testTo: d.testTo } : {}),
    };
    const r = editing ? await call<{ provider: SmsProviderView }>(`/api/admin/sms-providers/${editing.id}`, "PATCH", body, PAGE) : await call<{ provider: SmsProviderView }>("/api/admin/sms-providers", "POST", body, PAGE);
    setSaving(false);
    if (!r.ok) {
      setErrors(r.fields);
      notify("error", r.message);
      return;
    }
    notify("success", editing ? `${r.data.provider.name} saved.` : `${r.data.provider.name} added. Send a test SMS to verify it.`);
    onSaved(r.data.provider);
    onClose();
  }

  return (
    <FormDialog open={open} onOpenChange={(o) => !o && onClose()} title={editing ? `Edit ${editing.name}` : "Add an SMS provider"} description={spec.help} submitLabel={saving ? "Saving…" : editing ? "Save changes" : "Add provider"} onSubmit={() => void submit()}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <ALabel htmlFor="sp-name">Name</ALabel>
          <AInput id="sp-name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} maxLength={80} placeholder="e.g. MSG91 production" />
          {err("name")}
        </div>
        <div className="space-y-1.5">
          <ALabel>Provider</ALabel>
          <ASelect label="Provider" className="w-full" value={d.driver} onValueChange={(v) => setD({ ...d, driver: v, credentials: {} })} options={payload.catalog.drivers.map((x) => ({ value: x.value, label: x.label }))} />
          {err("driver")}
        </div>
      </div>

      {spec.credentials.map((c) => (
        <div key={c.key} className="space-y-1.5">
          <ALabel htmlFor={`sp-${c.key}`}>{c.label}</ALabel>
          <AInput
            id={`sp-${c.key}`}
            type="password"
            value={d.credentials[c.key] ?? ""}
            onChange={(e) => setD({ ...d, credentials: { ...d.credentials, [c.key]: e.target.value } })}
            placeholder={sameDriver && editing?.credentialHints[c.key] ? `${editing.credentialHints[c.key]} — leave blank to keep` : "Paste the value"}
            className="font-mono"
            autoComplete="off"
            spellCheck={false}
          />
          {err(`credentials.${c.key}`)}
        </div>
      ))}

      <div className="grid gap-4 sm:grid-cols-2">
        {spec.sender ? (
          <div className="space-y-1.5">
            <ALabel htmlFor="sp-sender">{spec.sender.label}</ALabel>
            <AInput id="sp-sender" value={d.senderId} onChange={(e) => setD({ ...d, senderId: e.target.value.toUpperCase() })} maxLength={6} className="font-mono uppercase" />
            {err("senderId")}
          </div>
        ) : null}
        <div className="space-y-1.5">
          <ALabel htmlFor="sp-otp">{spec.otpTemplate.label}</ALabel>
          <AInput id="sp-otp" value={d.otpTemplate} onChange={(e) => setD({ ...d, otpTemplate: e.target.value })} maxLength={64} className="font-mono" />
          {errors.otpTemplate ? err("otpTemplate") : <p className="text-xs text-muted-foreground">{spec.otpTemplate.hint}</p>}
        </div>
      </div>

      {spec.messageTemplates ? (
        <details className="rounded-lg border border-border p-3" open={Object.keys(d.templates).length > 0}>
          <summary className="cursor-pointer text-sm font-medium text-foreground">Order message templates (optional)</summary>
          <p className="mt-2 text-xs text-muted-foreground">
            {spec.messageTemplates.hint} A message type left blank is not sent by SMS. Each DLT template must use exactly the variables shown, in that order.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {payload.catalog.templates.map((t) => (
              <div key={t.key} className="space-y-1">
                <ALabel htmlFor={`sp-t-${t.key}`} className="text-xs">
                  {t.label} <span className="font-mono font-normal text-muted-foreground">({t.variables.join(", ")})</span>
                </ALabel>
                <AInput id={`sp-t-${t.key}`} value={d.templates[t.key] ?? ""} onChange={(e) => setD({ ...d, templates: { ...d.templates, [t.key]: e.target.value } })} maxLength={64} className="h-8 font-mono text-xs" />
                {err(`templates.${t.key}`)}
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {editing?.active ? (
        <div className="space-y-4 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
          <p className="text-sm text-amber-800 dark:text-amber-300">This provider is live. If you change its keys, sender or OTP template, a test SMS must go through before anything is saved.</p>
          <div className="space-y-1.5">
            <ALabel htmlFor="sp-test-to">Send the test SMS to</ALabel>
            <AInput id="sp-test-to" value={d.testTo} onChange={(e) => setD({ ...d, testTo: e.target.value })} inputMode="tel" placeholder="10-digit mobile" className="w-48" />
            {err("to")}
          </div>
          <CodeField id="sp-code" value={d.code} onChange={(v) => setD({ ...d, code: v })} why={WHY} />
        </div>
      ) : null}
    </FormDialog>
  );
}

function TestDialog({ provider, onClose, onDone }: { provider: SmsProviderView | null; onClose: () => void; onDone: (p: SmsProviderView) => void }) {
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <FormDialog
      open={!!provider}
      onOpenChange={(o) => !o && onClose()}
      title={`Send a test SMS${provider ? ` with ${provider.name}` : ""}`}
      description="Sends one sign-in code message to this number through the provider. It uses one paid SMS."
      submitLabel={busy ? "Sending…" : "Send test SMS"}
      onSubmit={() => {
        if (!provider || busy) return;
        setBusy(true);
        void call<{ ok: boolean; message: string; provider: SmsProviderView }>(`/api/admin/sms-providers/${provider.id}/test`, "POST", { to }, PAGE).then((r) => {
          setBusy(false);
          if (!r.ok) return notify("error", r.message);
          notify(r.data.ok ? "success" : "error", r.data.message);
          onDone(r.data.provider);
          if (r.data.ok) onClose();
        });
      }}
    >
      <div className="space-y-1.5">
        <ALabel htmlFor="test-to">Mobile number</ALabel>
        <AInput id="test-to" value={to} onChange={(e) => setTo(e.target.value)} inputMode="tel" placeholder="10-digit Indian mobile" className="w-56" />
        <p className="text-xs text-muted-foreground">Use your own phone, then check the message arrived.</p>
      </div>
    </FormDialog>
  );
}

export function SmsProvidersScreen({ initial }: { initial: SmsProvidersPayload | null }) {
  const [providers, setProviders] = useState<SmsProviderView[]>(initial?.providers ?? []);
  const [form, setForm] = useState<{ editing: SmsProviderView | null } | null>(null);
  const [testing, setTesting] = useState<SmsProviderView | null>(null);
  const [switching, setSwitching] = useState<{ provider: SmsProviderView; action: "activate" | "deactivate" } | null>(null);

  if (!initial) {
    return (
      <div className="space-y-5">
        <PageHeader title="SMS providers" description="Who sends sign-in codes and order messages." />
        <EmptyState title="Only the owner can manage SMS providers" description="Ask a store owner if something here needs changing." />
      </div>
    );
  }

  const put = (p: SmsProviderView) =>
    setProviders((all) => {
      // Activating one switches the previous live one off.
      const next = all.some((x) => x.id === p.id) ? all.map((x) => (x.id === p.id ? p : p.active ? { ...x, active: false } : x)) : [...all, p];
      return [...next].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
    });
  const live = providers.find((p) => p.active);
  const fallback = initial.fallback === "environment" ? "the server's own SMS settings (.env)" : initial.fallback === "demo" ? "the demo sender (codes shown on screen, development only)" : "nothing — sign-in codes can't be sent";

  return (
    <div className="space-y-5">
      <PageHeader
        title="SMS providers"
        description="Who sends sign-in codes and order messages. Add a provider, send a test SMS, then make it live."
        action={
          <AButton onClick={() => setForm({ editing: null })} disabled={providers.length >= initial.limits.maxProviders}>
            <AIcon icon={Add01Icon} /> Add provider
          </AButton>
        }
      />

      <div className={cn("flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm", live ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300" : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300")}>
        <AIcon icon={live ? CheckmarkCircle02Icon : Alert02Icon} className="mt-0.5" />
        <p>{live ? `Live: ${live.name} (${live.driverLabel}). Every sign-in code goes through it.` : `No provider is live. Messages use ${fallback}.`}</p>
      </div>

      {providers.length === 0 ? (
        <EmptyState title="No SMS providers yet" description="Add your provider's keys and DLT template IDs to start sending sign-in codes." />
      ) : (
        <ul className="space-y-3">
          {providers.map((p) => (
            <li key={p.id} className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <AIcon icon={Message01Icon} className="text-muted-foreground" />
                    <h2 className="text-sm font-semibold text-foreground">{p.name}</h2>
                    <span className={cn(BADGE, "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400")}>{p.driverLabel}</span>
                    {p.active ? <span className={cn(BADGE, "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400")}>Live</span> : null}
                    {!p.readable ? (
                      <span className={cn(BADGE, "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400")}>Keys unreadable — enter again</span>
                    ) : p.verified ? (
                      <span className={cn(BADGE, "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400")}>Tested</span>
                    ) : (
                      <span className={cn(BADGE, "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400")}>Not tested</span>
                    )}
                  </div>
                  <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
                    {Object.entries(p.credentialHints).map(([k, v]) => (
                      <div key={k} className="flex gap-1.5">
                        <dt>{initial.catalog.drivers.find((x) => x.value === p.driver)?.credentials.find((c) => c.key === k)?.label ?? k}:</dt>
                        <dd className="font-mono">{v ?? "not set"}</dd>
                      </div>
                    ))}
                    {p.senderId ? (
                      <div className="flex gap-1.5">
                        <dt>Sender:</dt>
                        <dd className="font-mono">{p.senderId}</dd>
                      </div>
                    ) : null}
                    <div className="flex gap-1.5">
                      <dt>Order messages:</dt>
                      <dd>{Object.keys(p.templates).length ? `${Object.keys(p.templates).length} of ${initial.catalog.templates.length} templates set` : "sign-in codes only"}</dd>
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
                        description="Its keys and template IDs are removed. This can't be undone."
                        confirmLabel="Delete"
                        destructive
                        onConfirm={async () => {
                          const r = await call<{ ok: true }>(`/api/admin/sms-providers/${p.id}`, "DELETE", {}, PAGE);
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
        Keys are encrypted before they are stored and are never sent back to this page. India needs DLT: the sender ID and every template must be approved with your provider before messages are delivered.
      </p>

      {form ? <ProviderForm key={form.editing?.id ?? "new"} payload={initial} editing={form.editing} open onClose={() => setForm(null)} onSaved={put} /> : null}
      <TestDialog key={testing?.id ?? "none"} provider={testing} onClose={() => setTesting(null)} onDone={put} />
      <StepUpDialog
        open={!!switching}
        onClose={() => setSwitching(null)}
        title={switching?.action === "activate" ? `Make ${switching.provider.name} live?` : `Deactivate ${switching?.provider.name ?? ""}?`}
        description={switching?.action === "activate" ? "Every sign-in code and order SMS will go through this provider from now on." : `Messages will then use ${fallback}.`}
        confirmLabel={switching?.action === "activate" ? "Make live" : "Deactivate"}
        why={WHY}
        onConfirm={async (code) => {
          if (!switching) return false;
          const r = await call<{ provider: SmsProviderView; summary: string }>(`/api/admin/sms-providers/${switching.provider.id}/${switching.action}`, "POST", { code }, PAGE);
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
