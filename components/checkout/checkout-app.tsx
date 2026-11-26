"use client";

import { track } from "@/lib/analytics/client";
import { itemFromLine } from "@/lib/analytics/events";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { priceRows } from "@/components/bag/price-rows";
import { CheckoutStep, PaymentMethods, type PaymentChoice } from "@/components/store/checkout-blocks";
import { type QuoteTenders, type WalletChoice, type WalletInfo, WalletStep } from "./wallet-step";
import { OrderSummary } from "@/components/store/order-summary";
import { useStoreUI } from "@/components/store/store-ui-provider";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import type { PublicCartView } from "@/lib/cart/service";
import type { Address } from "@/lib/checkout/address-types";
import { COD_FEE, type PriceBreakdown } from "@/lib/pricing/price-cart";
import { formatINR } from "@/lib/format";
import { PREPAID_OFFER } from "@/lib/promotions/automatic";
import type { DeliveryPromise } from "@/lib/shipping";
import { cn } from "@/lib/utils";
import { AddressStep } from "./address-step";
import { api, ApiError, goToPayment } from "./api";
import { ContactStep } from "./contact-step";

interface State {
  enabled: boolean;
  codEnabled: boolean;
  customer: { phone: string; name?: string | null; email: string | null; addresses: Address[] } | null;
  cart: PublicCartView;
}

interface Quote {
  cart: PublicCartView;
  pricing: PriceBreakdown;
  speed: "standard" | "express";
  promise: DeliveryPromise | null;
  cod: { allowed: boolean; reasons: string[] } | null;
  /** CHK-05 wallet: what the tenders pay and what is left to pay (server computed). */
  tenders: QuoteTenders;
  payable: number;
  wallet: WalletInfo;
}

/**
 * CHK-01 one-page checkout: Contact → Address → Payment, then confirmation. The browser only sends choices;
 * every amount on screen comes from /api/checkout/quote, and placing an order sends the total the shopper saw
 * (`expectedTotal`) plus an Idempotency-Key so a double click or retry can never create two orders.
 */
export function CheckoutApp() {
  const router = useRouter();
  const { refreshCart } = useStoreUI();
  const [state, setState] = useState<State | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [speed, setSpeed] = useState<"standard" | "express">("standard");
  const [payment, setPayment] = useState<PaymentChoice>("upi");
  const [upiApp, setUpiApp] = useState("gpay");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const idemKey = useRef<string | null>(null);
  const [wallet, setWallet] = useState<WalletChoice>({ coins: 0, useStoreCredit: false, giftCardCode: null });
  const [walletError, setWalletError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await api<State>("/api/checkout/state");
      setState(s);
      setLoadError(false);
      if (s.customer?.addresses.length) setAddressId((cur) => cur ?? (s.customer!.addresses.find((x) => x.isDefault) ?? s.customer!.addresses.at(-1)!).id);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    api<State>("/api/checkout/state")
      .then((s) => {
        if (cancelled) return;
        setState(s);
        if (s.customer?.addresses.length) setAddressId((cur) => cur ?? (s.customer!.addresses.find((x) => x.isDefault) ?? s.customer!.addresses.at(-1)!).id);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-quote on every choice (server prices; nothing computed here).
  useEffect(() => {
    if (!state?.customer) return;
    let cancelled = false;
    api<Quote>("/api/checkout/quote", { method: "POST", body: { addressId: addressId ?? undefined, speed, payment, tenders: wallet } })
      .then((q) => {
        if (cancelled) return;
        setQuote(q);
        setWalletError(null);
        if (q.speed !== speed) setSpeed(q.speed);
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof ApiError && (e.code === "invalid_gift_card" || (e.code === "rate_limited" && wallet.giftCardCode))) {
          setWalletError(e.message);
          setWallet((w) => ({ ...w, giftCardCode: null }));
          return;
        }
        setError(e instanceof ApiError ? e.message : "Couldn't update your total.");
      });
    return () => {
      cancelled = true;
    };
  }, [state, addressId, speed, payment, wallet]);

  // ANL-01 checkout funnel. Values come from the server cart / quote; consent is checked inside track().
  const began = useRef(false);
  useEffect(() => {
    if (!state?.enabled || began.current || state.cart.lines.length === 0) return;
    began.current = true;
    track("begin_checkout", { value: state.cart.pricing.total, items: state.cart.lines.map(itemFromLine), coupon: state.cart.couponCode });
  }, [state]);
  const shippedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!quote || !addressId || shippedFor.current === addressId) return;
    shippedFor.current = addressId;
    track("add_shipping_info", { value: quote.pricing.total, items: quote.cart.lines.map(itemFromLine), tier: speed });
  }, [quote, addressId, speed]);
  const choosePayment = (p: PaymentChoice) => {
    setPayment(p);
    if (p === "cod") track("cod_selected", {});
  };

  if (loadError) {
    return (
      <Centered>
        <p className="text-[14px]">We couldn&apos;t load checkout.</p>
        <Button onClick={load}>Try again</Button>
      </Centered>
    );
  }
  if (!state) return <CheckoutSkeleton />;
  if (!state.enabled) {
    return (
      <Centered>
        <h1 className="font-display text-[32px] uppercase">Checkout is paused</h1>
        <p className="text-[14px] text-ink-2">We&apos;re fixing something. Your bag is saved — please try again shortly.</p>
        <Button asChild variant="outline">
          <Link href="/bag">Back to bag</Link>
        </Button>
      </Centered>
    );
  }

  const cart = quote?.cart ?? state.cart;
  const lines = cart.lines;
  if (lines.length === 0) {
    return (
      <Centered>
        <h1 className="font-display text-[32px] uppercase">Your bag is empty</h1>
        <Button asChild>
          <Link href="/collections/new-in">Shop new in</Link>
        </Button>
      </Centered>
    );
  }

  const pricing = quote?.pricing ?? cart.pricing;
  const blocked = cart.hasIssues;
  const codFeeLabel = formatINR(COD_FEE);
  // COD eligibility comes from the server quote (CHK-07); before an address is chosen it's "not yet known".
  const codOption = !state.codEnabled
    ? { allowed: false, reasons: ["Cash on delivery is unavailable right now."], feeLabel: codFeeLabel }
    : quote?.cod
      ? { ...quote.cod, feeLabel: codFeeLabel }
      : { allowed: false, reasons: ["Choose a delivery address to see if cash on delivery is available."], feeLabel: codFeeLabel };

  const place = async () => {
    if (!quote || !addressId) return;
    setPlacing(true);
    setError(null);
    idemKey.current ??= crypto.randomUUID();
    track("add_payment_info", { value: quote.pricing.total, items: quote.cart.lines.map(itemFromLine), paymentType: payment });
    try {
      const r = await api<{ orderNumber: string; status: string; redirectUrl: string }>("/api/checkout/place", {
        method: "POST",
        headers: { "Idempotency-Key": idemKey.current },
        body: { addressId, speed, payment, expectedTotal: quote.payable, tenders: wallet, ...(payment === "upi" ? { upiApp } : {}) },
      });
      void refreshCart();
      goToPayment(r.redirectUrl, router.push);
    } catch (e) {
      idemKey.current = null; // a refused attempt didn't create an order — the next click is a new attempt
      if (e instanceof ApiError && (e.code === "total_changed" || e.code === "cart_changed" || e.code === "coupon_invalid")) {
        await load();
      }
      setError(e instanceof ApiError ? e.message : "Couldn't place your order. Please try again.");
      setPlacing(false);
    }
  };

  const payLabel = !quote
    ? "Pay securely"
    : quote.payable === 0
      ? "Place order · paid with your wallet"
      : payment === "cod"
        ? `Place order · ${formatINR(quote.payable)}`
        : `Pay ${formatINR(quote.payable)} securely`;
  const tenderRows = quote?.tenders.total
    ? [
        ...(quote.tenders.giftCard ? [{ label: `Gift card ••••${quote.tenders.giftCard.last4}`, amount: quote.tenders.giftCard.amount, discount: true }] : []),
        ...(quote.tenders.storeCredit ? [{ label: "Store credit", amount: quote.tenders.storeCredit, discount: true }] : []),
        ...(quote.tenders.coins ? [{ label: `Hood Coins (${quote.tenders.coins})`, amount: quote.tenders.coins * 100, discount: true }] : []),
      ]
    : [];
  const toPay = quote?.payable ?? pricing.total;
  const disabledReason = !state.customer
    ? "Verify your phone number to continue."
    : !addressId
      ? "Add a delivery address to continue."
      : quote?.promise && !quote.promise.serviceable
        ? "We don't deliver to this address yet."
        : blocked
          ? "Some items in your bag changed — review your bag first."
          : null;

  const summary = (
    <OrderSummary
      lines={lines.filter((l) => l.status !== "unavailable")}
      rows={[...priceRows(pricing), ...(tenderRows.length ? [{ label: "Order total (incl. GST)", amount: pricing.total }, ...tenderRows] : [])]}
      toPay={toPay}
      saving={pricing.savings}
      coupon={pricing.coupon?.ok ? { code: pricing.coupon.code, amount: pricing.couponDiscount } : undefined}
    />
  );

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-5 lg:px-10 lg:py-10">
      <h1 className="sr-only">Checkout</h1>

      {/* Mobile: collapsible summary bar */}
      <div className="mb-4 lg:hidden">
        <button
          type="button"
          aria-expanded={summaryOpen}
          aria-controls="mobile-summary"
          onClick={() => setSummaryOpen((o) => !o)}
          className="flex w-full items-center justify-between border border-line bg-white px-4 py-3 text-[13px] font-semibold"
        >
          <span className="flex items-center gap-1.5">
            {summaryOpen ? "Hide" : "Show"} order summary
            <Icon icon={ArrowDown01Icon} size={14} className={cn("transition-transform", summaryOpen && "rotate-180")} />
          </span>
          <span className="tabular">{formatINR(toPay)}</span>
        </button>
        <div id="mobile-summary" hidden={!summaryOpen} className="mt-2">
          {summary}
        </div>
      </div>

      {blocked ? (
        <p role="alert" className="mb-4 border border-accent bg-accent-tint px-4 py-3 text-[13px]">
          Some items in your bag changed.{" "}
          <Link href="/bag" className="font-semibold underline underline-offset-2">
            Review your bag
          </Link>
        </p>
      ) : null}

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_440px] lg:gap-10">
        <div className="space-y-5">
          <ContactStep customer={state.customer} onVerified={load} />
          <AddressStep
            self={{ name: state.customer?.name ?? "", phone: state.customer?.phone ?? "" }}
            addresses={state.customer?.addresses ?? []}
            selected={addressId}
            onSelect={setAddressId}
            onSaved={async (a) => {
              setAddressId(a.id);
              await load();
            }}
            promise={quote?.promise ?? null}
            speed={speed}
            onSpeed={setSpeed}
            shippingFee={pricing.shipping}
            disabled={!state.customer}
          />
          <WalletStep
            choice={wallet}
            onChange={setWallet}
            wallet={quote?.wallet ?? null}
            tenders={quote?.tenders ?? null}
            error={walletError}
            disabled={!state.customer || placing}
          />
          <CheckoutStep number={4} title="Payment" aside="All transactions are encrypted">
            <PaymentMethods
              value={payment}
              onChange={choosePayment}
              upiApp={upiApp}
              onUpiApp={setUpiApp}
              prepaidOffer={`Extra ${PREPAID_OFFER.percent}% off`}
              cod={codOption}
              payLabel={payLabel}
              onPay={place}
              busy={placing}
              disabledReason={disabledReason ?? (!quote ? "Updating your total…" : null)}
            />
            {error ? (
              <p role="alert" className="mt-3 text-[13px] font-semibold text-accent">
                {error}
              </p>
            ) : null}
          </CheckoutStep>
        </div>
        <div className="hidden lg:sticky lg:top-6 lg:block">{summary}</div>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex max-w-[520px] flex-col items-center gap-4 px-4 py-20 text-center">{children}</div>;
}

function CheckoutSkeleton() {
  return (
    <div className="mx-auto grid max-w-[1280px] gap-5 px-4 py-10 lg:grid-cols-[1fr_440px] lg:px-10" aria-busy="true">
      <div className="space-y-5">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
      <Skeleton className="hidden h-96 w-full lg:block" />
    </div>
  );
}
