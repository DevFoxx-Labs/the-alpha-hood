"use client";

import { CheckmarkCircle02Icon, Shield01Icon } from "@hugeicons/core-free-icons";
import { Switch as SwitchPrimitive } from "radix-ui";
import { useState } from "react";
import type { NotificationsPayload } from "@/lib/notify/switches-service";
import { notify } from "./admin-shell";
import { AButton, AIcon } from "./ui";

/**
 * Admin → Settings → Notifications (AstroGaon's "Notifications & Reminders"): per message, an SMS and an email
 * switch, grouped; plus the always-on list. A switch can only stop a channel — what the customer agreed to
 * (marketing, WhatsApp updates) still decides on top. Switching off also stops messages already queued.
 */
type Channels = Record<string, Partial<Record<"sms" | "email", boolean>>>;
const toMap = (p: NotificationsPayload): Channels => Object.fromEntries(p.events.map((e) => [e.key, { ...e.channels }]));

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
      <span className="text-muted-foreground">{label}</span>
      <SwitchPrimitive.Root
        checked={checked}
        onCheckedChange={onChange}
        className="inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-slate-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:bg-brand dark:bg-slate-600"
      >
        <SwitchPrimitive.Thumb className="block h-3.5 w-3.5 translate-x-[3px] rounded-full bg-white transition-transform data-[state=checked]:translate-x-[19px]" />
      </SwitchPrimitive.Root>
    </label>
  );
}

export function NotificationSettings({ initial, onDirty }: { initial: NotificationsPayload; onDirty: (d: boolean) => void }) {
  const [payload, setPayload] = useState(initial);
  const [draft, setDraft] = useState<Channels>(() => toMap(initial));
  const [saving, setSaving] = useState(false);
  const base = toMap(payload);
  const isDirty = (d: Channels) => payload.events.some((e) => Object.keys(e.channels).some((ch) => d[e.key]?.[ch as "sms"] !== base[e.key]?.[ch as "sms"]));
  const dirty = isDirty(draft);

  const toggle = (event: string, ch: "sms" | "email", v: boolean) => {
    const next = { ...draft, [event]: { ...draft[event], [ch]: v } };
    setDraft(next);
    onDirty(isDirty(next));
  };

  async function save() {
    if (saving || !dirty) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings/notifications", { method: "PUT", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channels: draft }) });
      const data = (await res.json().catch(() => null)) as { changed?: string[]; payload?: NotificationsPayload; error?: { message?: string } } | null;
      if (!res.ok || !data?.payload) return notify("error", data?.error?.message ?? "Couldn't save. Try again.");
      setPayload(data.payload);
      setDraft(toMap(data.payload));
      onDirty(false);
      notify("success", data.changed?.length ? `Notifications saved — ${data.changed.length} switch${data.changed.length === 1 ? "" : "es"} changed. In use now.` : "Nothing changed.");
    } catch {
      notify("error", "Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div>
        <h2 className="text-base font-semibold text-foreground">Notifications</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          SMS and email switches for every message customers get. Switching a channel off stops it at once — including messages already waiting to be sent. Customers&apos; own choices (marketing, WhatsApp) still apply on top.
        </p>
      </div>

      {payload.groups.map((g) => {
        const events = payload.events.filter((e) => e.group === g.id);
        if (!events.length) return null;
        return (
          <section key={g.id} className="rounded-xl border border-border p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand">{g.label}</h3>
            <div className="divide-y divide-border">
              {events.map((e) => (
                <div key={e.key} className="flex flex-col justify-between gap-3 py-3 first:pt-1 last:pb-1 md:flex-row md:items-center">
                  <div className="max-w-md">
                    <p className="text-sm font-medium text-foreground">{e.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{e.description}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-5">
                    {"sms" in e.channels ? <Toggle label="SMS" checked={draft[e.key]?.sms ?? false} onChange={(v) => toggle(e.key, "sms", v)} /> : <span className="w-[68px] text-xs text-muted-foreground/60">No SMS</span>}
                    {"email" in e.channels ? <Toggle label="Email" checked={draft[e.key]?.email ?? false} onChange={(v) => toggle(e.key, "email", v)} /> : null}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      <section className="rounded-xl border border-dashed border-border bg-muted/20 p-4">
        <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <AIcon icon={Shield01Icon} className="h-4 w-4 text-emerald-500" /> Always sent
        </p>
        <p className="mb-3 text-xs text-muted-foreground">Switching these off would lock people out or hide a security problem.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {payload.alwaysOn.map((a) => (
            <div key={a.label} className="flex items-start gap-2 rounded-lg border border-border bg-background/50 p-2.5">
              <AIcon icon={CheckmarkCircle02Icon} className="mt-0.5 text-emerald-500" />
              <div>
                <p className="text-xs font-medium text-foreground">{a.label}</p>
                <p className="text-[11px] text-muted-foreground">{a.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <p className="text-xs text-muted-foreground">
        SMS needs a live SMS provider and a DLT template for that message (Admin → SMS providers); email needs a live email provider (Admin → Email providers). Settings → Security decides whether email goes only to verified addresses.
      </p>

      <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
        {dirty && !saving ? <span className="mr-auto text-xs text-muted-foreground">Unsaved changes</span> : null}
        <AButton type="submit" loading={saving} disabled={!dirty}>
          Save changes
        </AButton>
      </div>
    </form>
  );
}
