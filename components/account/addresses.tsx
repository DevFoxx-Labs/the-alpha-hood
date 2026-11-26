"use client";

import { Location01Icon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { AddressForm } from "@/components/address/address-form";
import { api, ApiError } from "@/components/checkout/api";
import { showMessageToast } from "@/components/store/toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { Address } from "@/lib/checkout/address-types";
import { useMe } from "./account-frame";

/** ACC-02 address book: add, edit, set default, remove — the customer's own and people they order for. */
const MAX = 10;

function AddressCard({ a, onEdit, onChanged }: { a: Address; onEdit: () => void; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      await onChanged();
      showMessageToast(ok);
    } catch (e) {
      showMessageToast(e instanceof ApiError ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="flex flex-col justify-between gap-3 border border-line p-4" aria-busy={busy || undefined}>
      <div>
        <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold">
          {a.name}
          <span className="bg-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]">{a.type}</span>
          {a.forSomeoneElse ? <span className="border border-line px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]">For someone else</span> : null}
          {a.isDefault ? <span className="bg-black px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-white">Default</span> : null}
        </p>
        <p className="mt-1 break-words text-[13px] leading-relaxed text-ink-2">
          {a.line1}
          {a.line2 ? `, ${a.line2}` : ""}
          {a.landmark ? ` (${a.landmark})` : ""}
          <br />
          {a.city}, {a.state} {a.pincode}
          <br />
          Mobile {a.phone.replace(/^\+91/, "+91 ")}
          {a.alternatePhone ? ` · Alt. ${a.alternatePhone.replace(/^\+91/, "+91 ")}` : ""}
        </p>
        {a.instructions ? <p className="mt-1 text-[12px] italic text-ink-2">“{a.instructions}”</p> : null}
        {a.location ? (
          <p className="mt-1.5 flex items-center gap-1 text-[12px] font-semibold">
            <Icon icon={Location01Icon} size={14} /> Pinned on the map
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={onEdit}>
          Edit
        </Button>
        {!a.isDefault ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => api(`/api/account/addresses/${a.id}/default`, { method: "POST", body: {} }), "Default address updated")}>
            Make default
          </Button>
        ) : null}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="outline" disabled={busy}>
              Remove
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>Remove this address?</AlertDialogTitle>
            <AlertDialogDescription>Orders already placed keep their delivery address.</AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep</AlertDialogCancel>
              <AlertDialogAction onClick={() => void run(() => api(`/api/account/addresses/${a.id}`, { method: "DELETE", body: {} }), "Address removed")}>Remove</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </li>
  );
}

export function AddressesView() {
  const { me, reload } = useMe();
  const [editing, setEditing] = useState<{ address: Address | null } | null>(null);
  const list = [...me.customer.addresses].sort((x, y) => Number(!!y.isDefault) - Number(!!x.isDefault));
  const self = { name: me.customer.name ?? "", phone: me.customer.phone };

  if (editing) {
    return (
      <section className="border border-line p-4 sm:p-5">
        <h2 className="mb-4 text-[13px] font-bold uppercase tracking-[0.12em]">{editing.address ? "Edit address" : "Add a new address"}</h2>
        <AddressForm
          key={editing.address?.id ?? "new"}
          initial={editing.address}
          self={self}
          endpoint={editing.address ? { method: "PATCH", url: `/api/account/addresses/${editing.address.id}` } : { method: "POST", url: "/api/account/addresses" }}
          onSaved={async () => {
            await reload();
            setEditing(null);
            showMessageToast(editing.address ? "Address updated" : "Address saved");
          }}
          onCancel={() => setEditing(null)}
        />
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-ink-2">
          {list.length} of {MAX} saved. Add your own, or someone you order for.
        </p>
        <Button size="sm" onClick={() => setEditing({ address: null })} disabled={list.length >= MAX}>
          Add a new address
        </Button>
      </div>
      {list.length === 0 ? (
        <div className="flex flex-col items-start gap-3 border border-line p-5">
          <p className="text-[14px]">No saved addresses yet.</p>
          <Button size="sm" variant="outline" onClick={() => setEditing({ address: null })}>
            Add your first address
          </Button>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {list.map((a) => (
            <AddressCard key={a.id} a={a} onEdit={() => setEditing({ address: a })} onChanged={reload} />
          ))}
        </ul>
      )}
    </div>
  );
}
