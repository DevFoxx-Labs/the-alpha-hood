"use client";

import { Notification03Icon } from "@hugeicons/core-free-icons";
import { Switch as SwitchPrimitive } from "radix-ui";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { adminApi, notify } from "./admin-shell";
import { AIcon, Confirm } from "./ui";

/**
 * "Show as sold out" (lib/catalog/hold.ts) for one style: a switch for every colour at once, one per colour, and the
 * "Notify me" sign-ups per size. Used by Admin → Products (style editor) and Admin → Homepage (each drop spotlight).
 * The switch saves at once through its own endpoint; switching off asks first, because it sends the waiting alerts.
 */
/** Same shape as `Demand` in lib/catalog/hold.ts (server code isn't imported into the browser bundle). */
export interface Demand {
  waiting: number;
  bySize: Record<string, number>;
  notified: number;
}

export interface HoldColour {
  id: string;
  colour: string;
  status: string;
  soldOutHold: boolean;
  demand: Demand | null;
}

function HoldSwitch({ checked, label, disabled, onChange }: { checked: boolean; label: string; disabled?: boolean; onChange?: (v: boolean) => void }) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
      aria-label={label}
      className="inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-slate-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-amber-500 dark:bg-slate-600 dark:data-[state=checked]:bg-amber-500"
    >
      <SwitchPrimitive.Thumb className="block h-3.5 w-3.5 translate-x-[3px] rounded-full bg-white transition-transform data-[state=checked]:translate-x-[19px]" />
    </SwitchPrimitive.Root>
  );
}

const sizeLine = (d: Demand | null) =>
  d && d.waiting
    ? Object.entries(d.bySize)
        .map(([s, n]) => `${s} ${n}`)
        .join(" · ")
    : "";

export function SoldOutHold({ styleId, colours, canEdit, blockedReason, onChanged, compact = false }: { styleId: string; colours: HoldColour[]; canEdit: boolean; /** Why the switch can't be used right now (e.g. unsaved edits). */ blockedReason?: string; onChanged: () => void; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const live = colours.filter((c) => c.status === "active");
  const shown = live.length ? live : colours;
  const allOn = shown.length > 0 && shown.every((c) => c.soldOutHold);
  const someOn = shown.some((c) => c.soldOutHold);
  const waiting = colours.reduce((n, c) => n + (c.demand?.waiting ?? 0), 0);
  const notified = colours.reduce((n, c) => n + (c.demand?.notified ?? 0), 0);
  const disabled = !canEdit || busy || !!blockedReason;

  async function send(on: boolean, ids?: string[]) {
    setBusy(true);
    try {
      const r = await adminApi<{ on: boolean; changed: string[]; notified: number }>(`/api/admin/styles/${styleId}/sold-out`, { method: "POST", body: { on, ...(ids ? { ids } : {}) } });
      notify(
        "success",
        on
          ? "Shown as sold out — customers can only tap Notify me. Stock is kept."
          : r.notified
            ? `Back on sale — ${r.notified} waiting customer${r.notified === 1 ? "" : "s"} notified`
            : "Back on sale — the store shows the real stock",
      );
      onChanged();
    } catch (e) {
      notify("error", e instanceof Error ? e.message : "Couldn't switch it.");
    } finally {
      setBusy(false);
    }
  }

  /** A switch that turns on at once and asks before turning off (it sends the waiting alerts). */
  const toggle = (checked: boolean, label: string, waitingHere: number, ids?: string[]) =>
    checked && !disabled ? (
      <Confirm
        trigger={
          <span className="inline-flex">
            <HoldSwitch checked label={label} />
          </span>
        }
        title="Put it on sale?"
        description={
          waitingHere
            ? `The store shows the real stock again and ${waitingHere} waiting customer${waitingHere === 1 ? "" : "s"} get a "back in stock" message now (only for sizes that are in stock). This can't be taken back.`
            : "The store shows the real stock again and people can buy it."
        }
        confirmLabel="Put on sale"
        onConfirm={() => send(false, ids)}
      />
    ) : (
      <HoldSwitch checked={checked} label={label} disabled={disabled} onChange={(v) => v && void send(true, ids)} />
    );

  return (
    <div className={cn("space-y-2 rounded-lg border p-3", someOn ? "border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/20" : "border-border")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            Show as sold out{someOn && !allOn ? <span className="ml-1 text-xs font-normal text-muted-foreground">(some colours)</span> : null}
          </p>
          <p className="text-xs text-muted-foreground">
            {someOn
              ? "On: the store shows every size as sold out and nobody can buy it — customers can only tap Notify me. Your real stock is kept."
              : "Show it as sold out while you keep the stock, to count how many customers want it before you sell."}
          </p>
        </div>
        {toggle(allOn, "Show as sold out — every colour", waiting)}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <AIcon icon={Notification03Icon} className="h-3.5 w-3.5" />
          {waiting} waiting
        </span>
        {notified ? <span className="text-muted-foreground">{notified} already notified</span> : null}
        {colours.some((c) => c.demand === null) ? <span className="text-muted-foreground">Sign-ups couldn&apos;t be loaded.</span> : null}
      </div>

      {!compact || colours.length > 1 ? (
        <ul className="divide-y divide-border border-t border-border">
          {colours.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-1.5 text-xs">
              <span className="min-w-0">
                <span className="font-medium">{c.colour}</span>
                {c.status !== "active" ? <span className="ml-1 text-muted-foreground">({c.status})</span> : null}
                <span className="ml-2 text-muted-foreground">
                  {c.demand?.waiting ?? 0} waiting{sizeLine(c.demand) ? ` (${sizeLine(c.demand)})` : ""}
                </span>
              </span>
              {colours.length > 1 ? toggle(c.soldOutHold, `Show ${c.colour} as sold out`, c.demand?.waiting ?? 0, [c.id]) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {blockedReason && canEdit ? <p className="text-[11px] text-amber-700 dark:text-amber-400">{blockedReason}</p> : null}
      {!canEdit ? <p className="text-[11px] text-muted-foreground">Only staff who can edit products can switch this.</p> : null}
    </div>
  );
}
