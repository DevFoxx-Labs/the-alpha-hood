"use client";

import { Alert02Icon, CheckmarkCircle02Icon, SentIcon, TruckDeliveryIcon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import type { ShippingPayload } from "@/lib/shipping/service";
import { cn } from "@/lib/utils";
import { notify } from "./admin-shell";
import { BADGE, call, CodeField, StepUpDialog, when } from "./provider-kit";
import { AButton, AIcon, AInput, ALabel, Card, ErrorState, PageHeader } from "./ui";

/**
 * Admin → Shipping (owner only): the Shiprocket API user that answers every "Check your pincode" on the product page
 * and the delivery date / COD at checkout. Save → Test (signs in and checks a real pincode) → Make live. The password
 * is write-only. Changing the live account needs an authenticator code and is tested before it is saved.
 */
const PAGE = "/admin/shipping";
const WHY = "Every delivery check on the store goes through this account.";

export function ShippingScreen() {
  const [p, setP] = useState<ShippingPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ email: "", password: "", pickupPincode: "", weightKg: "0.5" });
  const [code, setCode] = useState("");
  const [testPin, setTestPin] = useState("110001");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [confirm, setConfirm] = useState<"shiprocket" | "off" | null>(null);

  const apply = (next: ShippingPayload) => {
    setP(next);
    setDraft((d) => ({ email: "", password: "", pickupPincode: next.fields.pickupPincode ?? d.pickupPincode, weightKg: next.fields.weightKg !== null ? String(next.fields.weightKg) : d.weightKg }));
  };
  // Load (and reload after "Try again"). Plain fetch: the call() helper always sends a JSON body, which GET can't carry.
  useEffect(() => {
    if (p || error) return;
    fetch("/api/admin/shipping", { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as (ShippingPayload & { error?: { message?: string } }) | null;
        if (!res.ok || !data) setError(data?.error?.message ?? "Couldn't load.");
        else apply(data);
      })
      .catch(() => setError("Couldn't reach the server."));
  }, [p, error]);

  if (error) return <ErrorState message={error} onRetry={() => setError(null)} />;
  if (!p) return <div className="h-64 animate-pulse rounded-xl bg-muted" aria-busy="true" />;

  const save = async () => {
    setBusy("save");
    setErrors({});
    const r = await call<{ payload: ShippingPayload; summary: string }>("/api/admin/shipping", "PUT", { ...draft, weightKg: Number(draft.weightKg), ...(p.active ? { code } : {}) }, PAGE);
    setBusy(null);
    if (!r.ok) {
      setErrors(r.fields);
      return notify("error", r.message);
    }
    setCode("");
    apply(r.data.payload);
    notify("success", p.active ? "Saved and tested — delivery checks keep working" : "Saved. Now run a test.");
  };
  const test = async () => {
    setBusy("test");
    const r = await call<{ ok: boolean; message: string; payload: ShippingPayload }>("/api/admin/shipping/test", "POST", { pincode: testPin }, PAGE);
    setBusy(null);
    if (!r.ok) return notify("error", r.message);
    apply(r.data.payload);
    notify(r.data.ok ? "success" : "error", r.data.message);
  };
  const activate = async (choice: "shiprocket" | "off", stepCode: string) => {
    const r = await call<{ payload: ShippingPayload; summary: string }>("/api/admin/shipping/active", "POST", { choice, code: stepCode }, PAGE);
    if (!r.ok) {
      notify("error", r.message);
      return false;
    }
    apply(r.data.payload);
    notify("success", r.data.summary);
    return true;
  };

  const field = (key: keyof typeof draft, label: string, props: React.ComponentProps<"input">, help?: string) => (
    <div className="space-y-1.5">
      <ALabel htmlFor={`sh-${key}`}>{label}</ALabel>
      <AInput id={`sh-${key}`} value={draft[key]} onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))} aria-invalid={!!errors[key] || undefined} {...props} />
      {errors[key] ? <p className="text-xs text-destructive">{errors[key]}</p> : help ? <p className="text-xs text-muted-foreground">{help}</p> : null}
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHeader title="Shipping" description="Shiprocket answers “Check your pincode” on product pages and the delivery date and COD at checkout. Save, test, then make it live." />

      <Card title="Now answering delivery checks">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <AIcon icon={TruckDeliveryIcon} />
          {p.mode === "shiprocket" ? (
            <span className={cn(BADGE, "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400")}>Shiprocket (live)</span>
          ) : p.mode === "demo" ? (
            <span className={cn(BADGE, "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400")}>Demo rules (development only)</span>
          ) : (
            <span className={cn(BADGE, "bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400")}>Nothing — the store says “couldn&apos;t check delivery”</span>
          )}
          <span className="text-muted-foreground">
            Town &amp; state names: {p.directory.loaded ? <>India Post directory loaded ({p.directory.sample})</> : <>from Shiprocket only — the India Post directory isn&apos;t loaded (see the guide below)</>}
          </span>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Shiprocket API user" className="lg:col-span-2">
          <div className="mb-3 flex flex-wrap gap-2">
            {!p.readable ? (
              <span className={cn(BADGE, "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400")}>Password unreadable — enter it again</span>
            ) : !p.configured ? (
              <span className={cn(BADGE, "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400")}>Not set up</span>
            ) : p.verified ? (
              <span className={cn(BADGE, "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400")}>
                <AIcon icon={CheckmarkCircle02Icon} className="h-3 w-3" /> Tested
              </span>
            ) : (
              <span className={cn(BADGE, "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400")}>
                <AIcon icon={Alert02Icon} className="h-3 w-3" /> Not tested
              </span>
            )}
          </div>
          <form
            noValidate
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            {field("email", "API user email", { type: "email", autoComplete: "off", placeholder: p.fields.email ?? "api-user@yourbusiness.in" }, p.fields.email ? `Saved: ${p.fields.email}. Leave blank to keep it.` : "The API user's email — not your Shiprocket login.")}
            {field("password", "API user password", { type: "password", autoComplete: "new-password", placeholder: p.passwordSet ? "•••••••• (saved)" : "" }, p.passwordSet ? "Saved and hidden. Leave blank to keep it." : undefined)}
            {field("pickupPincode", "Pickup pincode", { inputMode: "numeric", maxLength: 6, placeholder: "411045" }, "Pincode of your pickup address in Shiprocket → Settings → Pickup addresses.")}
            {field("weightKg", "Parcel weight (kg)", { inputMode: "decimal", placeholder: "0.5" }, "Typical packed weight of one order (a tee ≈ 0.3–0.5 kg).")}
            {p.active ? (
              <div className="sm:col-span-2">
                <CodeField id="sh-code" value={code} onChange={setCode} why={WHY} />
              </div>
            ) : null}
            <div className="sm:col-span-2">
              <AButton type="submit" disabled={busy !== null}>
                {busy === "save" ? "Saving…" : p.active ? "Test & save" : "Save"}
              </AButton>
            </div>
          </form>
        </Card>

        <Card title="Test and go live">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <ALabel htmlFor="sh-test">Test with pincode</ALabel>
              <div className="flex gap-2">
                <AInput id="sh-test" value={testPin} inputMode="numeric" maxLength={6} onChange={(e) => setTestPin(e.target.value.replace(/\D/g, "").slice(0, 6))} className="w-32" />
                <AButton variant="outline" disabled={busy !== null || !p.configured} onClick={() => void test()}>
                  <AIcon icon={SentIcon} /> {busy === "test" ? "Testing…" : "Test"}
                </AButton>
              </div>
              <p className="text-xs text-muted-foreground">Signs in with the saved API user and checks delivery to this pincode.</p>
            </div>
            {p.lastTest ? (
              <p className={cn("rounded-md px-3 py-2 text-xs", p.lastTest.ok ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300" : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300")}>
                {when(p.lastTest.at)} — {p.lastTest.message}
              </p>
            ) : null}
            {p.active ? (
              <AButton variant="outline" onClick={() => setConfirm("off")}>
                Switch Shiprocket off
              </AButton>
            ) : (
              <AButton disabled={!p.verified} onClick={() => setConfirm("shiprocket")}>
                Make Shiprocket live
              </AButton>
            )}
          </div>
        </Card>
      </div>

      <Card title="How to get the API user (one time, in Shiprocket)">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm">
          <li>Sign up free at shiprocket.in (“Sign Up Free” → “I am Seller”), verify your mobile, complete KYC and add your pickup address.</li>
          <li>
            In the Shiprocket panel: <b>Settings → API → Configure → Create API User</b>. Use an email that is <b>different from your Shiprocket login</b>, set a password, “Generate API Credential”.
          </li>
          <li>Enter that email and password here with your pickup address&apos;s pincode, Save, Test, then Make live.</li>
          <li>Town / state names for every pincode: download the “All India Pincode Directory” CSV from data.gov.in and run <code className="rounded bg-muted px-1">pnpm geo:import-pincodes &lt;file.csv&gt;</code> on the server.</li>
        </ol>
      </Card>

      <StepUpDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === "off" ? "Switch Shiprocket off?" : "Make Shiprocket live?"}
        description={confirm === "off" ? "Delivery checks stop using Shiprocket at once (in production the store then says it couldn't check delivery)." : "Every pincode check and checkout delivery date will come from Shiprocket from now on."}
        confirmLabel={confirm === "off" ? "Switch off" : "Make live"}
        why={WHY}
        onConfirm={(c) => (confirm ? activate(confirm, c) : Promise.resolve(false))}
      />
    </div>
  );
}
