"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { api, ApiError } from "@/components/checkout/api";
import { showMessageToast } from "@/components/store/toast";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useMe } from "./account-frame";
import { dateLabel } from "./labels";

interface Prefs {
  marketing_email: boolean;
  marketing_whatsapp: boolean;
  history: { purpose: string; status: string; method: string; source: string; notice_version: string; created_at: string }[];
}

const box = "border border-line p-5";
const h2 = "mb-3 text-[13px] font-bold uppercase tracking-[0.12em]";

/** ACC-02 profile + notification preferences (consents) + DPDP rights: download data, delete account. */
export function SettingsView() {
  const id = useId();
  const router = useRouter();
  const { me, reload } = useMe();
  const [name, setName] = useState(me.customer.name ?? "");
  const [email, setEmail] = useState(me.customer.email ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    api<Prefs>("/api/account/preferences").then(setPrefs).catch(() => setPrefs(null));
  }, []);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await api("/api/account/me", { method: "PATCH", body: { name, email } });
      await reload();
      showMessageToast("Profile saved");
    } catch (err) {
      showMessageToast(err instanceof ApiError ? err.message : "Couldn't save.");
    } finally {
      setSavingProfile(false);
    }
  };

  const toggle = async (purpose: "marketing_email" | "marketing_whatsapp", on: boolean) => {
    try {
      setPrefs(await api<Prefs>("/api/account/preferences", { method: "POST", body: { [purpose]: on } }));
    } catch (err) {
      showMessageToast(err instanceof ApiError ? err.message : "Couldn't update.");
    }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api("/api/account/delete", { method: "POST", body: { confirm } });
      router.push("/");
      router.refresh();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Couldn't delete your account.");
      setDeleting(false);
    }
  };

  const signOutEverywhere = async () => {
    await api("/api/session/logout", { method: "POST", body: { everywhere: true } }).catch(() => null);
    router.push("/");
    router.refresh();
  };

  return (
    <div className="space-y-5">
      <section className={box}>
        <h2 className={h2}>Profile</h2>
        <form onSubmit={saveProfile} className="grid max-w-[520px] gap-3">
          <p className="text-[13px] text-ink-2">Mobile {me.customer.phone} (verified — used to sign in)</p>
          <label htmlFor={`${id}-name`} className="text-[12px] font-bold uppercase tracking-[0.06em]">
            Name
          </label>
          <Input id={`${id}-name`} autoComplete="name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          <label htmlFor={`${id}-email`} className="text-[12px] font-bold uppercase tracking-[0.06em]">
            Email <span className="font-normal normal-case tracking-normal text-ink-2">(invoices and order updates)</span>
          </label>
          <Input id={`${id}-email`} type="email" autoComplete="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" loading={savingProfile} className="mt-1 justify-self-start">
            Save
          </Button>
        </form>
      </section>

      <section className={box}>
        <h2 className={h2}>Notifications</h2>
        <p className="mb-3 text-[13px] text-ink-2">Order and delivery updates are always sent by SMS and email. Offers are only sent if you switch them on.</p>
        {prefs ? (
          <ul className="divide-y divide-line border-y border-line">
            {([
              ["marketing_whatsapp", "Offers on WhatsApp", "New drops, sales and offers on WhatsApp."],
              ["marketing_email", "Offers by email", me.customer.email ? "New drops, sales and offers by email." : "Add an email above to turn this on."],
            ] as const).map(([key, title, text]) => (
              <li key={key} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p id={`${id}-${key}`} className="text-[14px] font-semibold">
                    {title}
                  </p>
                  <p className="text-[12.5px] text-ink-2">{text}</p>
                </div>
                <Switch aria-labelledby={`${id}-${key}`} checked={prefs[key]} disabled={key === "marketing_email" && !me.customer.email && !prefs[key]} onCheckedChange={(on) => toggle(key, on)} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-ink-2">Loading…</p>
        )}
        {prefs?.history.length ? (
          <details className="mt-3 text-[12.5px]">
            <summary className="cursor-pointer font-semibold">Consent history</summary>
            <ul className="mt-2 space-y-1 text-ink-2">
              {[...prefs.history].reverse().map((h, i) => (
                <li key={i}>
                  {dateLabel(h.created_at, true)} · {h.purpose.replace("_", " ")} · <b>{h.status}</b> · {h.notice_version.replaceAll(";", ", ")}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      <section className={box}>
        <h2 className={h2}>Privacy &amp; your data</h2>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <a href="/api/account/export" download>
              Download my data
            </a>
          </Button>
          <Button variant="outline" size="sm" onClick={signOutEverywhere}>
            Sign out on all devices
          </Button>
          <Button asChild variant="link" size="sm">
            <Link href="/privacy">Your rights &amp; grievance officer</Link>
          </Button>
        </div>
      </section>

      <section className={box}>
        <h2 className={h2}>Delete account</h2>
        <p className="text-[13px] text-ink-2">
          We erase your profile, email, saved addresses and preferences, and sign you out everywhere. Order and invoice records
          are kept as tax law requires. Unused store credit is lost. This can&apos;t be undone.
        </p>
        <AlertDialog onOpenChange={(o) => !o && (setConfirm(""), setDeleteError(null))}>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className="mt-3 border-accent text-accent hover:bg-accent-tint">
              Delete my account
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              Type <b>DELETE</b> to confirm. Orders in progress must be delivered first.
            </AlertDialogDescription>
            <Input aria-label="Type DELETE to confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-3" autoComplete="off" />
            {deleteError ? (
              <p role="alert" className="mt-2 text-[13px] text-accent">
                {deleteError}
              </p>
            ) : null}
            <AlertDialogFooter>
              <AlertDialogCancel>Keep account</AlertDialogCancel>
              <Button onClick={deleteAccount} loading={deleting} disabled={confirm !== "DELETE"} className="bg-accent border-accent hover:bg-accent">
                Delete
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>
    </div>
  );
}
