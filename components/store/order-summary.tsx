import { Cancel01Icon, DeliveryTruck01Icon, RefreshIcon, Shield01Icon, Ticket01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { Switch } from "@/components/ui/switch";
import type { CartLine } from "@/lib/commerce/types";
import { STORE_CONFIG } from "@/lib/config/store";
import { formatINR, type Paise } from "@/lib/format";
import { cn } from "@/lib/utils";
import { GarmentArt } from "./garment-art";

/**
 * CHK-05 / DESIGN.md §3 OrderSummary: sticky card — items (72×92 thumbs), dashed red coupon chip,
 * Hood Coins toggle, breakdown rows (discounts green), "To pay" with a 1 px black rule, green savings
 * box, trust row. Presentational: every amount is computed on the server in M5 and passed in.
 */
export interface SummaryRow {
  label: string;
  amount: Paise;
  /** Discounts render in green with a minus sign. */
  discount?: boolean;
  /** Free shipping etc. */
  freeLabel?: string;
}

export function OrderSummary({
  lines,
  rows,
  toPay,
  saving,
  coupon,
  coins,
  className,
}: {
  lines: CartLine[];
  rows: SummaryRow[];
  toPay: Paise;
  saving: Paise;
  coupon?: { code: string; amount: Paise; onRemove?: () => void };
  coins?: { count: number; amount: Paise };
  className?: string;
}) {
  return (
    <aside aria-label="Order summary" className={cn("border border-line bg-white", className)}>
      <header className="flex items-center justify-between border-b border-line px-5 py-5 lg:px-8">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] lg:text-[14px]">Order summary</h2>
        <span className="text-[13px]">{lines.length} items</span>
      </header>
      <ul>
        {lines.map((l) => (
          <li key={l.id} className="grid grid-cols-[72px_1fr_auto] gap-3.5 border-b border-line px-5 py-3.5 lg:px-8">
            <GarmentArt image={l.image} className="h-[92px]" />
            <div className="min-w-0">
              <p className="text-[13.5px] font-medium leading-snug">{l.title}</p>
              <p className="mt-1 text-[12px] text-muted">
                {l.colour} · Size {l.size} · Qty {l.quantity}
              </p>
            </div>
            <p className="tabular text-right">
              <span className="block text-[13.5px] font-bold">{formatINR(l.price * l.quantity)}</span>
              {l.mrp > l.price ? <s className="block text-[11.5px] text-muted">{formatINR(l.mrp * l.quantity)}</s> : null}
            </p>
          </li>
        ))}
      </ul>

      <div className="space-y-3 px-5 py-5 lg:px-8">
        {coupon ? (
          <p className="flex items-center gap-2 border border-dashed border-accent bg-coupon px-3 py-2.5 text-[13px] font-semibold text-accent">
            <Icon icon={Ticket01Icon} size={17} />
            <span className="flex-1">{coupon.code} applied</span>
            <span className="tabular text-ink">−{formatINR(coupon.amount)}</span>
            {coupon.onRemove ? (
              <button type="button" onClick={coupon.onRemove} aria-label={`Remove coupon ${coupon.code}`} className="grid size-6 place-items-center text-ink">
                <Icon icon={Cancel01Icon} size={14} />
              </button>
            ) : null}
          </p>
        ) : null}
        {coins ? (
          <label className="flex items-center justify-between border border-line px-3.5 py-3 text-[13px]">
            Use {coins.count} Hood Coins (−{formatINR(coins.amount)})
            <Switch defaultChecked aria-label="Use Hood Coins" />
          </label>
        ) : null}

        <dl className="tabular space-y-2 pt-3 text-[13.5px]">
          {rows.map((r) => (
            <div key={r.label} className="flex justify-between">
              <dt className="text-ink-2">{r.label}</dt>
              <dd className={cn((r.discount || r.freeLabel) && "text-green")}>
                {r.freeLabel ?? `${r.discount ? "− " : ""}${formatINR(r.amount)}`}
              </dd>
            </div>
          ))}
        </dl>
        <p className="tabular flex justify-between border-t border-black pt-3 text-[16px] font-bold">
          <span>To pay</span>
          <span>{formatINR(toPay)}</span>
        </p>
        {saving > 0 ? (
          <p className="bg-green-tint px-3 py-2.5 text-center text-[12.5px] font-semibold text-green">
            You&apos;re saving <span className="tabular">{formatINR(saving)}</span> on this order
          </p>
        ) : null}
      </div>

      <ul className="flex flex-wrap justify-around gap-2 border-t border-line px-4 py-3 text-[11.5px] text-ink-2">
        <li className="flex items-center gap-1.5">
          <Icon icon={RefreshIcon} size={15} />
          {STORE_CONFIG.returnWindowDays}-day returns
        </li>
        <li className="flex items-center gap-1.5">
          <Icon icon={Shield01Icon} size={15} />
          Secure payments
        </li>
        <li className="flex items-center gap-1.5">
          <Icon icon={DeliveryTruck01Icon} size={15} />
          Free size exchange
        </li>
      </ul>
    </aside>
  );
}
