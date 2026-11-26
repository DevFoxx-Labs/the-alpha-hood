"use client";

import { useState } from "react";
import { notify } from "./admin-shell";
import { AInput, ALabel, FormDialog } from "./ui";

/** Shared by the provider screens (SMS, email, storage): API call, authenticator-code field and dialog, badges. */
type ApiError = { error?: { code?: string; message?: string; fields?: Record<string, string> } };

export const BADGE = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium";
export const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

export async function call<T>(url: string, method: string, body: unknown, page: string): Promise<{ ok: true; data: T } | { ok: false; message: string; fields: Record<string, string> }> {
  try {
    const res = await fetch(url, { method, cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
    const data = (await res.json().catch(() => null)) as (T & ApiError) | null;
    if (res.status === 401 && data?.error?.code === "unauthenticated") {
      // Session ended: a full reload is deliberate, it drops every in-memory admin state.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/admin/login?next=${encodeURIComponent(page)}`);
    }
    if (!res.ok || !data) return { ok: false, message: data?.error?.message ?? "Something went wrong.", fields: data?.error?.fields ?? {} };
    return { ok: true, data };
  } catch {
    return { ok: false, message: "Couldn't reach the server. Check your connection and try again.", fields: {} };
  }
}

export function CodeField({ value, onChange, id, why }: { value: string; onChange: (v: string) => void; id: string; why: string }) {
  return (
    <div className="space-y-1.5">
      <ALabel htmlFor={id}>Authenticator code</ALabel>
      <AInput id={id} value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="6 digits" className="w-36 font-mono tracking-widest" />
      <p className="text-xs text-muted-foreground">A new code from your authenticator app. {why}</p>
    </div>
  );
}

export function StepUpDialog({ title, description, confirmLabel, why, open, onClose, onConfirm }: { title: string; description: string; confirmLabel: string; why: string; open: boolean; onClose: () => void; onConfirm: (code: string) => Promise<boolean> }) {
  const [code, setCode] = useState("");
  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setCode("");
          onClose();
        }
      }}
      title={title}
      description={description}
      submitLabel={confirmLabel}
      onSubmit={() => {
        if (code.length !== 6) return notify("error", "Enter the 6-digit code from your authenticator app.");
        void onConfirm(code).then((done) => {
          if (done) {
            setCode("");
            onClose();
          }
        });
      }}
    >
      <CodeField id="su-code" value={code} onChange={setCode} why={why} />
    </FormDialog>
  );
}
