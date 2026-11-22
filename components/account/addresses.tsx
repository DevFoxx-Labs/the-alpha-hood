"use client";

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
import { useMe } from "./account-frame";

/** ACC-02 saved addresses (add at checkout; remove here). */
export function AddressesView() {
  const { me, reload } = useMe();
  const remove = async (id: string) => {
    try {
      await api(`/api/account/addresses/${id}`, { method: "DELETE", body: {} });
      await reload();
    } catch (e) {
      showMessageToast(e instanceof ApiError ? e.message : "Couldn't remove the address.");
    }
  };
  if (me.customer.addresses.length === 0) {
    return <p className="text-[14px] text-ink-2">No saved addresses yet. You can add one at checkout.</p>;
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {me.customer.addresses.map((a) => (
        <li key={a.id} className="flex flex-col justify-between gap-3 border border-line p-4">
          <div>
            <p className="flex items-center gap-2 text-[14px] font-semibold">
              {a.name}
              <span className="bg-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]">{a.type}</span>
            </p>
            <p className="mt-1 break-words text-[13px] leading-relaxed text-ink-2">
              {a.line1}
              {a.line2 ? `, ${a.line2}` : ""}
              {a.landmark ? ` (${a.landmark})` : ""}
              <br />
              {a.city}, {a.state} {a.pincode}
            </p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" className="self-start">
                Remove
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogTitle>Remove this address?</AlertDialogTitle>
              <AlertDialogDescription>Orders already placed keep their delivery address.</AlertDialogDescription>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep</AlertDialogCancel>
                <AlertDialogAction onClick={() => remove(a.id)}>Remove</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </li>
      ))}
    </ul>
  );
}
