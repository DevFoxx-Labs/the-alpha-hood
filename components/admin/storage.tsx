"use client";

import { Alert02Icon, CheckmarkCircle02Icon, CloudIcon, Database01Icon, HardDriveIcon, SentIcon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { useState } from "react";
import type { BackendView, StorageChoice, StoragePayload } from "@/lib/storage/service";
import { cn } from "@/lib/utils";
import { notify } from "./admin-shell";
import { BADGE, call, StepUpDialog, when } from "./provider-kit";
import { AButton, AIcon, AInput, ALabel, EmptyState, PageHeader } from "./ui";

/**
 * Admin → Storage (owner only), like the reference panel: pick where new uploads go — the database, a folder on this
 * server, Amazon S3 or Cloudflare R2 — with a connection test per backend. Keys are write-only. Old photos stay where
 * they were stored and keep working; the photo URLs never change.
 */
const PAGE = "/admin/storage";
const WHY = "Where product photos are stored changes with this.";

const META: Record<StorageChoice, { label: string; icon: IconSvgElement; help: string }> = {
  database: { label: "Database", icon: Database01Icon, help: "Photos are stored inside the database (the default). Simple, but makes the database and its backups larger." },
  local: { label: "Server folder", icon: HardDriveIcon, help: "Photos are written to a folder on this server. Only for a server with a permanent disk, and only with backups of that folder." },
  s3: { label: "Amazon S3", icon: CloudIcon, help: "A private S3 bucket. Create an IAM user with access to that one bucket only (s3:PutObject, s3:GetObject, s3:DeleteObject)." },
  r2: { label: "Cloudflare R2", icon: CloudIcon, help: "A private R2 bucket. Create an R2 API token with Object Read & Write on that one bucket only." },
};

const FIELDS: Record<"s3" | "r2", { key: string; label: string; secret?: boolean; placeholder?: string }[]> = {
  s3: [
    { key: "accessKeyId", label: "Access key ID", secret: true, placeholder: "AKIA…" },
    { key: "secretAccessKey", label: "Secret access key", secret: true },
    { key: "region", label: "Region", placeholder: "ap-south-1" },
    { key: "bucket", label: "Bucket", placeholder: "alpha-hood-media" },
  ],
  r2: [
    { key: "accountId", label: "Account ID" },
    { key: "accessKeyId", label: "Access key ID", secret: true },
    { key: "secretAccessKey", label: "Secret access key", secret: true },
    { key: "bucket", label: "Bucket", placeholder: "alpha-hood-media" },
  ],
};

function BackendCard({ b, onPayload, onMakeActive }: { b: BackendView; onPayload: (p: StoragePayload) => void; onMakeActive: () => void }) {
  const kind = b.kind;
  const fields = kind === "local" ? [] : FIELDS[kind];
  const [draft, setDraft] = useState<Record<string, string>>(() => ({ ...b.fields }));
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const meta = META[kind];
  const dirty = fields.some((f) => (draft[f.key] ?? "") !== (b.fields[f.key] ?? ""));

  const save = async () => {
    setBusy("save");
    setErrors({});
    const r = await call<{ payload: StoragePayload; summary: string }>(`/api/admin/storage/${kind}`, "PUT", { ...draft, ...(b.active ? { code } : {}) }, PAGE);
    setBusy(null);
    if (!r.ok) {
      setErrors(r.fields);
      return notify("error", r.message);
    }
    notify("success", `${r.data.summary} Run the connection test next.`);
    setDraft((d) => ({ ...d, accessKeyId: "", secretAccessKey: "" }));
    setCode("");
    onPayload(r.data.payload);
  };
  const test = async () => {
    setBusy("test");
    const r = await call<{ ok: boolean; message: string; payload: StoragePayload }>(`/api/admin/storage/${kind}/test`, "POST", {}, PAGE);
    setBusy(null);
    if (!r.ok) return notify("error", r.message);
    notify(r.data.ok ? "success" : "error", r.data.message);
    onPayload(r.data.payload);
  };

  return (
    <section className={cn("rounded-xl border bg-card p-4 sm:p-5", b.active ? "border-emerald-300 dark:border-emerald-800" : "border-border")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <AIcon icon={meta.icon} className="text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">{meta.label}</h2>
            {b.active ? <span className={cn(BADGE, "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400")}>Takes new uploads</span> : null}
            {!b.readable ? (
              <span className={cn(BADGE, "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400")}>Keys unreadable — enter again</span>
            ) : !b.configured ? (
              <span className={cn(BADGE, "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400")}>Not set up</span>
            ) : b.verified ? (
              <span className={cn(BADGE, "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400")}>Tested</span>
            ) : (
              <span className={cn(BADGE, "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400")}>Not tested</span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{meta.help}</p>
          {b.lastTest ? (
            <p className={cn("mt-1.5 text-xs", b.lastTest.ok ? "text-muted-foreground" : "text-destructive")}>
              {when(b.lastTest.at)} — {b.lastTest.message}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <AButton size="sm" variant="outline" onClick={() => void test()} loading={busy === "test"} disabled={!b.configured || busy !== null}>
            <AIcon icon={SentIcon} className="h-3.5 w-3.5" /> Test connection
          </AButton>
          {!b.active ? (
            <AButton size="sm" onClick={onMakeActive} disabled={!b.verified}>
              Use for new uploads
            </AButton>
          ) : null}
        </div>
      </div>

      {fields.length ? (
        <form
          className="mt-4 space-y-4 border-t border-border pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((f) => {
              const id = `${kind}-${f.key}`;
              const locked = b.everActive && !f.secret;
              return (
                <div key={f.key} className="space-y-1.5">
                  <ALabel htmlFor={id}>{f.label}</ALabel>
                  <AInput
                    id={id}
                    type={f.secret ? "password" : "text"}
                    value={draft[f.key] ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                    placeholder={f.secret ? (f.key === "accessKeyId" && b.keyHint ? `${b.keyHint} — leave blank to keep` : f.key === "secretAccessKey" && b.secretSet ? "•••••••• — leave blank to keep" : "Paste the value") : f.placeholder}
                    readOnly={locked}
                    className={cn("font-mono", locked && "opacity-70")}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  {errors[f.key] ? <p className="text-xs text-destructive">{errors[f.key]}</p> : locked ? <p className="text-xs text-muted-foreground">Locked: photos are stored here.</p> : null}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-end justify-end gap-3">
            {b.active ? (
              <div className="space-y-1.5">
                <ALabel htmlFor={`${kind}-code`} className="text-xs">
                  Authenticator code (active storage)
                </ALabel>
                <AInput id={`${kind}-code`} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="6 digits" className="w-32 font-mono tracking-widest" />
              </div>
            ) : null}
            <AButton type="submit" loading={busy === "save"} disabled={busy !== null || (!dirty && !draft.accessKeyId && !draft.secretAccessKey) || (b.active && code.length !== 6)}>
              Save keys
            </AButton>
          </div>
        </form>
      ) : null}
    </section>
  );
}

export function StorageScreen({ initial }: { initial: StoragePayload | null }) {
  const [payload, setPayload] = useState(initial);
  const [switching, setSwitching] = useState<StorageChoice | null>(null);

  if (!payload) {
    return (
      <div className="space-y-5">
        <PageHeader title="Storage" description="Where uploaded photos are stored." />
        <EmptyState title="Only the owner can manage storage" description="Ask a store owner if something here needs changing." />
      </div>
    );
  }
  const local = payload.backends.find((b) => b.kind === "local")!;

  return (
    <div className="space-y-5">
      <PageHeader title="Storage" description="Where product photos are stored. Switching only affects new uploads; photos already stored keep working from where they are." />

      <div className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
        <AIcon icon={CheckmarkCircle02Icon} className="mt-0.5" />
        <p>New uploads go to: <b>{META[payload.active].label}</b>.</p>
        {payload.active !== "database" ? (
          <button type="button" onClick={() => setSwitching("database")} className="ml-auto shrink-0 text-xs font-medium underline underline-offset-2">
            Switch back to the database
          </button>
        ) : null}
      </div>

      {payload.ephemeralDisk ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
          <AIcon icon={Alert02Icon} className="mt-0.5" />
          <p>This host does not keep its disk between deploys. Do not use the server folder here — photos would be lost. Use S3 or R2.</p>
        </div>
      ) : null}

      <BackendCard key={`local-${local.lastTest?.at ?? ""}`} b={local} onPayload={setPayload} onMakeActive={() => setSwitching("local")} />
      <p className="-mt-3 px-1 text-xs text-muted-foreground">
        Server folder: <span className="font-mono">{payload.localDir}</span> (set by <span className="font-mono">STORAGE_LOCAL_DIR</span> on the host; outside the public web folder, files are served only through the store).
      </p>
      {payload.backends
        .filter((b) => b.kind !== "local")
        .map((b) => (
          <BackendCard key={`${b.kind}-${b.keyHint ?? ""}-${b.fields.bucket ?? ""}`} b={b} onPayload={setPayload} onMakeActive={() => setSwitching(b.kind)} />
        ))}

      <p className="text-xs text-muted-foreground">
        Keys are encrypted before they are stored and are never sent back to this page. Buckets stay private: photos are always served through the store at the same address, cached by browsers and the CDN.
      </p>

      <StepUpDialog
        open={!!switching}
        onClose={() => setSwitching(null)}
        title={switching ? `Store new uploads in ${META[switching].label}?` : ""}
        description="Photos already stored stay where they are and keep working."
        confirmLabel="Switch"
        why={WHY}
        onConfirm={async (code) => {
          if (!switching) return false;
          const r = await call<{ payload: StoragePayload; summary: string }>("/api/admin/storage/active", "POST", { choice: switching, code }, PAGE);
          if (!r.ok) {
            notify("error", r.message);
            return false;
          }
          setPayload(r.data.payload);
          notify("success", r.data.summary);
          return true;
        }}
      />
    </div>
  );
}
