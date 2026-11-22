import { DeliveryTruck01Icon, Money03Icon, ReturnRequestIcon, SecurityCheckIcon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { STORE_CONFIG } from "@/lib/config/store";
import { formatINR } from "@/lib/format";

/**
 * HOME-11 trust strip. Built from STORE_CONFIG so it can only state what the store is configured to do —
 * no claim here may be untrue (PRD HOME-11, consumer law). Values are demo until the owner confirms them.
 */
export function TrustStrip() {
  const items = [
    {
      icon: DeliveryTruck01Icon,
      title: "Free shipping",
      text: `On orders above ${formatINR(STORE_CONFIG.freeShippingThreshold)}`,
    },
    { icon: Money03Icon, title: "Cash on delivery", text: "On eligible pincodes" },
    {
      icon: ReturnRequestIcon,
      title: `${STORE_CONFIG.returnWindowDays}-day returns`,
      text: "Easy exchanges & refunds",
    },
    { icon: SecurityCheckIcon, title: "Secure payments", text: "UPI, cards, netbanking, wallets" },
  ];
  return (
    <ul className="grid grid-cols-2 border-y border-line lg:grid-cols-4">
      {items.map((item, i) => (
        <li
          key={item.title}
          className={
            "flex items-center gap-3 px-3 py-5 lg:gap-4 lg:px-8 lg:py-7 " +
            (i % 2 === 0 ? "border-r border-line " : "") +
            (i < 2 ? "border-b border-line lg:border-b-0 " : "") +
            (i === 1 ? "lg:border-r" : "")
          }
        >
          <Icon icon={item.icon} size={28} strokeWidth={1.4} className="shrink-0" />
          <div>
            <p className="text-[11.5px] font-bold uppercase tracking-[0.08em] lg:text-[12.5px]">{item.title}</p>
            <p className="mt-0.5 text-[12px] text-ink-2 lg:text-[13px]">{item.text}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
