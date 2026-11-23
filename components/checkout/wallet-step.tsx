"use client";

import { Cancel01Icon, GiftIcon } from "@hugeicons/core-free-icons";
import { useId, useState } from "react";
import { CheckoutStep } from "@/components/store/checkout-blocks";
import { Icon } from "@/components/ui/icon";
import { Switch } from "@/components/ui/switch";
import { formatINR, type Paise } from "@/lib/format";

export interface WalletChoice {
  coins: number;
  useStoreCredit: boolean;
  giftCardCode: string | null;
}

export interface WalletInfo {
  coinsAvailable: number;
  coinsMax: number;
  storeCredit: Paise;
  giftCard: { last4: string; balance: Paise; expiresAt: string } | null;
}

export interface QuoteTenders {
  coins: number;
  giftCard: { last4: string; amount: Paise } | null;
  storeCredit: Paise;
  total: Paise;
}

/**
 * CHK-05 / PROMO-06 wallet: Hood Coins, store credit and a gift card. The shopper only makes choices — every amount
 * shown here comes from the server quote (balances, caps, what each pays). Nothing is taken until the order is placed.
 */
export function WalletStep({
  choice,
  onChange,
  wallet,
  tenders,
  error,
  disabled,
}: {
  choice: WalletChoice;
  onChange: (c: WalletChoice) => void;
  wallet: WalletInfo | null;
  tenders: QuoteTenders | null;
  error: string | null;
  disabled: boolean;
}) {
  const id = useId();
  const [code, setCode] = useState("");
  const hasCoins = !!wallet && wallet.coinsMax > 0;
  const hasCredit = !!wallet && wallet.storeCredit > 0;

  return (
    <CheckoutStep number={3} title="Coins, credit & gift cards" aside="Optional">
      <div className="space-y-3">
        {hasCoins ? (
          <div className="flex items-center justify-between gap-3 border border-line px-3.5 py-3">
            <div>
              <p id={`${id}-coins`} className="text-[13.5px] font-semibold">
                Use Hood Coins
              </p>
              <p className="text-[12px] text-ink-2">
                {wallet!.coinsAvailable} available · up to {wallet!.coinsMax} on this order (₹1 each)
                {tenders?.coins ? ` · using ${tenders.coins}` : ""}
              </p>
            </div>
            <Switch aria-labelledby={`${id}-coins`} disabled={disabled} checked={choice.coins > 0} onCheckedChange={(on) => onChange({ ...choice, coins: on ? wallet!.coinsMax : 0 })} />
          </div>
        ) : null}

        {hasCredit ? (
          <div className="flex items-center justify-between gap-3 border border-line px-3.5 py-3">
            <div>
              <p id={`${id}-credit`} className="text-[13.5px] font-semibold">
                Use store credit
              </p>
              <p className="text-[12px] text-ink-2">
                {formatINR(wallet!.storeCredit)} available{tenders?.storeCredit ? ` · using ${formatINR(tenders.storeCredit)}` : ""}
              </p>
            </div>
            <Switch aria-labelledby={`${id}-credit`} disabled={disabled} checked={choice.useStoreCredit} onCheckedChange={(on) => onChange({ ...choice, useStoreCredit: on })} />
          </div>
        ) : null}

        {choice.giftCardCode && tenders?.giftCard ? (
          <div className="flex items-center gap-2 border border-dashed border-black bg-soft px-3 py-2.5 text-[13px]">
            <Icon icon={GiftIcon} size={17} />
            <span className="flex-1">
              Gift card ••••{tenders.giftCard.last4} · <b className="tabular">−{formatINR(tenders.giftCard.amount)}</b>
              {wallet?.giftCard ? <span className="block text-[11.5px] text-ink-2">Balance after this order: {formatINR(wallet.giftCard.balance - tenders.giftCard.amount)}</span> : null}
            </span>
            <button type="button" aria-label="Remove gift card" onClick={() => onChange({ ...choice, giftCardCode: null })} className="grid size-8 place-items-center">
              <Icon icon={Cancel01Icon} size={15} />
            </button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const c = code.replace(/[\s-]/g, "").toUpperCase();
              if (c) onChange({ ...choice, giftCardCode: c });
            }}
            className="flex border border-[#cfcfcf] focus-within:border-black"
          >
            <label htmlFor={`${id}-gc`} className="sr-only">
              Gift card code
            </label>
            <input
              id={`${id}-gc`}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 24))}
              placeholder="Gift card code"
              autoComplete="off"
              disabled={disabled}
              aria-invalid={!!error || undefined}
              aria-describedby={error ? `${id}-err` : undefined}
              className="h-11 min-w-0 flex-1 bg-transparent px-3.5 text-[13px] uppercase tracking-[0.06em] outline-none placeholder:normal-case placeholder:tracking-normal"
            />
            <button type="submit" disabled={disabled || code.trim().length < 16} className="px-4 text-[11.5px] font-bold uppercase tracking-[0.12em] disabled:opacity-40">
              Apply
            </button>
          </form>
        )}
        {error ? (
          <p id={`${id}-err`} role="alert" className="text-[12px] text-accent">
            {error}
          </p>
        ) : null}
        {!hasCoins && !hasCredit ? <p className="text-[12px] text-ink-2">Hood Coins and store credit show here once you have them.</p> : null}
      </div>
    </CheckoutStep>
  );
}
