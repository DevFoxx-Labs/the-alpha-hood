"use client";

import {
  Alert02Icon,
  Analytics01Icon,
  ArrowRight01Icon,
  ArrowTurnBackwardIcon,
  CheckmarkCircle02Icon,
  CreditCardIcon,
  Database01Icon,
  FileScriptIcon,
  JusticeScale01Icon,
  Search01Icon,
  SecurityCheckIcon,
  Settings01Icon,
  ShoppingCart01Icon,
  ViewIcon,
  ViewOffIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { Switch as SwitchPrimitive } from "radix-ui";
import { useId, useState } from "react";
import type { FieldState, GroupState, SettingsPayload } from "@/lib/settings/service";
import { cn } from "@/lib/utils";
import { notify } from "./admin-shell";
import { AButton, AIcon, AInput, ALabel, ASelect, ATextarea, EmptyState, PageHeader } from "./ui";

/**
 * Admin → Settings (owner only). Same layout as the reference panel: a section list on the left, one card with
 * the active section's form on the right, each section saved on its own.
 * The payload arrives with the page (server-rendered), so there is no loading state and no fetch on open.
 * A secret is never present in the payload: the form can replace one, not read it.
 */
const ICONS: Record<string, IconSvgElement> = {
  general: Settings01Icon,
  legal: JusticeScale01Icon,
  checkout: ShoppingCart01Icon,
  payments: CreditCardIcon,
  tracking: Analytics01Icon,
  seo: Search01Icon,
};
const UNSET = "__unset";

const BADGE = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium";

function SourceBadge({ field }: { field: FieldState }) {
  if (!field.isSet) {
    return <span className={cn(BADGE, field.required ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400")}>Not set</span>;
  }
  return field.source === "database" ? (
    <span className={cn(BADGE, "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400")}>
      <AIcon icon={Database01Icon} className="h-3 w-3" /> Saved here
    </span>
  ) : (
    <span className={cn(BADGE, "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400")}>
      <AIcon icon={FileScriptIcon} className="h-3 w-3" /> .env
    </span>
  );
}

function Notice({ tone, children }: { tone: "amber" | "red"; children: React.ReactNode }) {
  return (
    <div
      role={tone === "red" ? "alert" : "note"}
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm",
        tone === "amber"
          ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300"
          : "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300",
      )}
    >
      <AIcon icon={Alert02Icon} className="mt-0.5" />
      <div>{children}</div>
    </div>
  );
}

function ToggleRow({ field, checked, onChange }: { field: FieldState; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3 hover:bg-muted/40">
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
        <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
          {field.label}
          <SourceBadge field={field} />
        </span>
        {field.help ? <span className="mt-0.5 block text-xs text-muted-foreground">{field.help}</span> : null}
      </label>
      <SwitchPrimitive.Root
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        className="inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-slate-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:bg-brand dark:bg-slate-600"
      >
        <SwitchPrimitive.Thumb className="block h-3.5 w-3.5 translate-x-[3px] rounded-full bg-white transition-transform data-[state=checked]:translate-x-[19px]" />
      </SwitchPrimitive.Root>
    </div>
  );
}

function SecretInput({ field, value, onChange, id }: { field: FieldState; value: string; onChange: (v: string) => void; id: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <AInput
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.isSet ? "•••••••• — leave blank to keep" : "Paste the value"}
        className="pr-10 font-mono"
        autoComplete="off"
        spellCheck={false}
      />
      <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide what you typed" : "Show what you typed"} className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <AIcon icon={show ? ViewOffIcon : ViewIcon} />
      </button>
    </div>
  );
}

function TextField({
  field,
  value,
  cleared,
  error,
  onChange,
  onToggleClear,
}: {
  field: FieldState;
  value: string;
  cleared: boolean;
  error?: string;
  onChange: (v: string) => void;
  onToggleClear: () => void;
}) {
  const id = useId();
  const fallback = field.envFallback ? `the .env value (${field.key})` : "not set";
  let control: React.ReactNode;
  if (cleared) {
    control = (
      <div className="flex items-center justify-between gap-2 rounded-md border border-dashed border-amber-400 bg-amber-50 px-3 py-1.5 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
        <span>Will be removed on save — back to {fallback}.</span>
        <AButton type="button" variant="ghost" size="sm" onClick={onToggleClear}>
          <AIcon icon={ArrowTurnBackwardIcon} className="h-3.5 w-3.5" /> Undo
        </AButton>
      </div>
    );
  } else if (field.secret) {
    control = <SecretInput id={id} field={field} value={value} onChange={onChange} />;
  } else if (field.type === "select") {
    control = (
      <ASelect
        label={field.label}
        className="w-full"
        value={value || UNSET}
        onValueChange={(v) => onChange(v === UNSET ? "" : v)}
        options={[{ value: UNSET, label: "Not set" }, ...(field.options ?? [])]}
      />
    );
  } else if (field.type === "text") {
    control = <ATextarea id={id} rows={3} value={value} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder ?? undefined} aria-invalid={!!error} />;
  } else {
    control = (
      <AInput
        id={id}
        type={field.type === "email" ? "email" : field.type === "url" ? "url" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder ?? undefined}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={!!error}
      />
    );
  }
  return (
    <div className={cn("space-y-1.5", field.type === "text" && "sm:col-span-2")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ALabel htmlFor={id}>
          {field.label}
          {field.required ? <span className="ml-1 text-red-500">*</span> : null}
        </ALabel>
        <SourceBadge field={field} />
      </div>
      {control}
      {field.secret && field.hint && !cleared ? (
        <p className="font-mono text-[11px] text-muted-foreground">
          In use: {field.hint}
          {field.source === "database" ? (
            <button type="button" onClick={onToggleClear} className="ml-2 font-sans underline hover:text-foreground">
              remove
            </button>
          ) : null}
        </p>
      ) : null}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : field.help ? (
        <p className="text-xs text-muted-foreground">{field.help}</p>
      ) : null}
    </div>
  );
}

type Draft = Record<string, string | boolean>;
const initialDraft = (group: GroupState): Draft => Object.fromEntries(group.fields.map((f) => [f.key, f.type === "bool" ? f.value === "true" : f.secret ? "" : (f.value ?? "")]));

function GroupForm({ group, onSaved, onDirty }: { group: GroupState; onSaved: (g: GroupState) => void; onDirty: (dirty: boolean) => void }) {
  const [draft, setDraft] = useState<Draft>(() => initialDraft(group));
  const [clear, setClear] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const base = initialDraft(group);
  const dirty = clear.length > 0 || group.fields.some((f) => draft[f.key] !== base[f.key]);

  const set = (key: string, value: string | boolean) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    onDirty(clear.length > 0 || group.fields.some((f) => next[f.key] !== base[f.key]));
  };
  const toggleClear = (key: string) => {
    const next = clear.includes(key) ? clear.filter((k) => k !== key) : [...clear, key];
    setClear(next);
    onDirty(next.length > 0 || group.fields.some((f) => draft[f.key] !== base[f.key]));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving || !dirty) return;
    // Only what changed is sent. Emptying a value that was saved here removes it (back to the environment).
    const fields: Draft = {};
    const toClear = [...clear];
    for (const f of group.fields) {
      if (toClear.includes(f.key) || draft[f.key] === base[f.key]) continue;
      if (draft[f.key] === "" && !f.secret) {
        if (f.source === "database") toClear.push(f.key);
        continue;
      }
      fields[f.key] = draft[f.key];
    }
    setSaving(true);
    setErrors({});
    try {
      const res = await fetch(`/api/admin/settings/${group.id}`, {
        method: "PUT",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields, clear: toClear, ...(group.stepUp ? { code } : {}) }),
      });
      const data = (await res.json().catch(() => null)) as { changed?: string[]; group?: GroupState; error?: { code?: string; message?: string; fields?: Record<string, string> } } | null;
      if (res.status === 401 && data?.error?.code === "unauthenticated") {
        // Session ended: a full reload is deliberate, it drops every in-memory admin state.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign(`/admin/login?next=${encodeURIComponent("/admin/settings")}`);
        return;
      }
      if (!res.ok || !data?.group) {
        setErrors(data?.error?.fields ?? {});
        notify("error", data?.error?.message ?? "Couldn't save. Try again.");
        return;
      }
      const labels = (data.changed ?? []).map((k) => group.fields.find((f) => f.key === k)?.label ?? k);
      notify("success", labels.length ? `${group.label} saved — ${labels.join(", ")}. In use now.` : `Nothing changed in ${group.label}.`);
      onSaved(data.group);
      setDraft(initialDraft(data.group));
      setClear([]);
      setCode("");
      onDirty(false);
    } catch {
      notify("error", "Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  const toggles = group.fields.filter((f) => f.type === "bool");
  const inputs = group.fields.filter((f) => f.type !== "bool");

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-foreground">{group.label}</h2>
          {group.fields.some((f) => f.required) ? (
            group.missingRequired.length === 0 ? (
              <span className={cn(BADGE, "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400")}>
                <AIcon icon={CheckmarkCircle02Icon} className="h-3 w-3" /> Configured
              </span>
            ) : (
              <span title={group.missingRequired.join(", ")} className={cn(BADGE, "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400")}>
                {group.missingRequired.length === 1 ? `Missing: ${group.missingRequired[0]}` : `${group.missingRequired.length} required fields missing`}
              </span>
            )
          ) : null}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{group.description}</p>
      </div>

      {group.warning ? <Notice tone="amber">{group.warning}</Notice> : null}

      {toggles.length ? (
        <div className="space-y-3">
          {toggles.map((f) => (
            <ToggleRow key={f.key} field={f} checked={draft[f.key] === true} onChange={(v) => set(f.key, v)} />
          ))}
        </div>
      ) : null}

      {inputs.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {inputs.map((f) => (
            <TextField key={f.key} field={f} value={String(draft[f.key] ?? "")} cleared={clear.includes(f.key)} error={errors[f.key]} onChange={(v) => set(f.key, v)} onToggleClear={() => toggleClear(f.key)} />
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-end justify-end gap-3 border-t border-border pt-4">
        {dirty && !saving ? <span className="mr-auto self-center text-xs text-muted-foreground">Unsaved changes</span> : null}
        {group.stepUp ? (
          <div className="space-y-1.5">
            <ALabel htmlFor={`code-${group.id}`} className="flex items-center gap-1.5 text-xs">
              <AIcon icon={SecurityCheckIcon} className="h-3.5 w-3.5" /> Authenticator code
            </ALabel>
            <AInput
              id={`code-${group.id}`}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6 digits"
              className="w-32 font-mono tracking-widest"
            />
          </div>
        ) : null}
        <AButton type="submit" loading={saving} disabled={!dirty || (group.stepUp && code.length !== 6)}>
          Save changes
        </AButton>
      </div>
    </form>
  );
}

export function SettingsScreen({ initial, initialSection }: { initial: SettingsPayload | null; initialSection?: string }) {
  const [groups, setGroups] = useState<GroupState[]>(initial?.groups ?? []);
  const [active, setActive] = useState(() => (initial?.groups.some((g) => g.id === initialSection) ? initialSection! : (initial?.groups[0]?.id ?? "")));
  const [dirty, setDirty] = useState<Record<string, boolean>>({});

  if (!initial) {
    return (
      <div className="space-y-5">
        <PageHeader title="Settings" description="Store details, kill switches and integration keys." />
        <EmptyState title="Only the owner can open settings" description="Ask a store owner if something here needs changing." />
      </div>
    );
  }

  const pick = (id: string) => {
    setActive(id);
    // Shareable and refresh-safe without a server round trip.
    window.history.replaceState(null, "", id === groups[0]?.id ? "/admin/settings" : `/admin/settings?section=${id}`);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Settings" description="Store details, kill switches and integration keys. Saved here, they take effect at once — no .env edit, no redeploy." />

      {initial.unreadable.length ? (
        <Notice tone="red">
          Some saved values can&apos;t be decrypted and are not in use: <span className="font-mono text-xs">{initial.unreadable.join(", ")}</span>. The encryption key (SECRET_BOX_KEY) has probably changed — restore
          it, or save these values again.
        </Notice>
      ) : null}

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Settings sections" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:block lg:space-y-1 lg:overflow-visible lg:p-0">
          {groups.map((g) => {
            const isActive = g.id === active;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => pick(g.id)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex h-9 shrink-0 items-center justify-between gap-2 whitespace-nowrap rounded-md px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:w-full",
                  isActive ? "bg-brand/10 font-medium text-brand" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <span className="flex items-center gap-2">
                  <AIcon icon={ICONS[g.id] ?? Settings01Icon} />
                  {g.label}
                  {dirty[g.id] ? <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-label="Unsaved changes" /> : null}
                </span>
                {isActive ? <AIcon icon={ArrowRight01Icon} className="hidden h-3.5 w-3.5 lg:block" /> : null}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-6">
          {/* Every section stays mounted (hidden) so switching sections never drops what was typed. */}
          {groups.map((g) => (
            <div key={g.id} hidden={g.id !== active}>
              <GroupForm
                group={g}
                onSaved={(next) => setGroups((all) => all.map((x) => (x.id === next.id ? next : x)))}
                onDirty={(d) => setDirty((all) => (all[g.id] === d ? all : { ...all, [g.id]: d }))}
              />
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Every value is encrypted before it is stored, and secrets are never sent back to this page. The database connection and the encryption key stay in the server environment. Other servers pick up a change within a
        minute.
      </p>
    </div>
  );
}
