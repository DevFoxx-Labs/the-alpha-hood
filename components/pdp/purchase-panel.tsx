"use client";

import { ExchangeNote, ProductAlerts, SizeAdvice } from "./pdp-extras";
import { CheckmarkCircle02Icon, DeliveryTruck01Icon, FavouriteIcon, ShoppingBag02Icon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/store/badges";
import { ColourPicker } from "@/components/store/colour-picker";
import { CouponBox } from "@/components/store/coupon-box";
import { DeliveryCheck } from "@/components/store/delivery-check";
import { GarmentArt } from "@/components/store/garment-art";
import { Price } from "@/components/store/price";
import { productState } from "@/components/store/product-card";
import { SizePicker } from "@/components/store/size-picker";
import { useStoreUI } from "@/components/store/store-ui-provider";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { track } from "@/lib/analytics/client";
import { itemFromProduct } from "@/lib/analytics/events";
import type { SizeChart } from "@/lib/catalog/size-charts";
import type { Product } from "@/lib/commerce/types";
import { formatINR, type Paise } from "@/lib/format";
import type { ReviewSummary } from "@/lib/reviews/types";
import { cn } from "@/lib/utils";
import { ProductGallery } from "./gallery";
import { ShareButton } from "./share-button";
import { SizeGuide } from "./size-guide";
import { formatDeliveryDate, useDelivery } from "./use-delivery";

export interface SellerInfo {
  marketedBy: string;
  address: string;
  supportEmail: string;
  supportPhone: string;
}

/**
 * PDP gallery + info column (PDP-01…03, 05…07). Client component because size, delivery and sticky bars
 * are interactive; all data comes from the server page. Price shown is display only — the bag (M5)
 * re-prices on the server.
 */
export function ProductDetail({
  product,
  reviewSummary,
  coupon,
  sizeChart,
  seller,
  freeShippingThreshold,
  returnWindowDays,
}: {
  product: Product;
  reviewSummary: ReviewSummary | null;
  coupon: { code: string; description: string; finalPrice: Paise } | null;
  sizeChart: SizeChart | null;
  seller: SellerInfo;
  freeShippingThreshold: Paise;
  returnWindowDays: number;
}) {
  const { addToBag, wishlist, toggleWishlist } = useStoreUI();
  const router = useRouter();
  const oneSize = product.sizes.length === 1;
  const [size, setSize] = useState<string | undefined>(oneSize && product.sizes[0].stock > 0 ? product.sizes[0].label : undefined);
  const [sizeError, setSizeError] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const { soldOut } = productState(product);
  const wished = wishlist.has(product.id);
  const sizesRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const [pastCta, setPastCta] = useState(false);
  const delivery = useDelivery();
  const freeShipping = product.price >= freeShippingThreshold;

  // ANL-01 view_item, once per product shown (consent is checked inside track()).
  useEffect(() => {
    track("view_item", { item: itemFromProduct(product) });
  }, [product]);

  useEffect(() => {
    const el = ctaRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setPastCta(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const requireSize = () => {
    if (size) return size;
    setSizeError(true);
    sizesRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    sizesRef.current?.querySelector<HTMLButtonElement>("button[aria-pressed]:not([aria-disabled])")?.focus({ preventScroll: true });
    return null;
  };

  const add = () => {
    const s = requireSize();
    if (s) addToBag(product, s);
  };
  // PDP-06 BUY NOW: add, then straight to checkout.
  const buyNow = async () => {
    const s = requireSize();
    if (!s) return;
    if (await addToBag(product, s)) router.push("/checkout");
  };

  const wishButton = (cls?: string) => (
    <button
      type="button"
      onClick={() => toggleWishlist(product.id, itemFromProduct(product))}
      aria-pressed={wished}
      aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
      className={cn("grid shrink-0 place-items-center border border-black bg-white", cls)}
    >
      <Icon icon={FavouriteIcon} size={20} className={cn(wished && "fill-accent text-accent")} />
    </button>
  );

  const fitNote = fitLine(product, reviewSummary);
  const p = delivery.promise;

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_480px] lg:gap-10 xl:grid-cols-[minmax(0,1fr)_520px]">
      <ProductGallery
        images={product.images}
        badge={product.badge ? <Badge tone={product.badge === "BESTSELLER" ? "red" : "white"}>{product.badge}</Badge> : null}
        overlay={
          <>
            {wishButton("size-10 rounded-full border-0 bg-white/90")}
            <ShareButton title={product.title} path={`/products/${product.handle}`} className="rounded-full bg-white/90" />
          </>
        }
      />

      <div className="px-4 pt-5 lg:sticky lg:top-24 lg:self-start lg:px-0 lg:pt-0">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-[17px] font-medium leading-[1.3] lg:text-[22px]">{product.title}</h1>
          <ShareButton title={product.title} path={`/products/${product.handle}`} className="-mr-2 -mt-1 hidden lg:grid" />
        </div>
        <Price price={product.price} mrp={product.mrp} size="pdp" className="mt-2" />
        <p className="mt-1 text-[11.5px] text-ink-2">MRP inclusive of all taxes</p>
        {product.rating ? (
          <a href="#reviews" className="mt-2.5 inline-flex items-center gap-2 text-[12px]">
            <span className="tabular bg-black px-1.5 py-0.5 text-[11px] font-bold text-white">{product.rating.average.toFixed(1)} ★</span>
            <span className="underline underline-offset-2">{product.rating.count} reviews</span>
          </a>
        ) : null}

        {coupon ? (
          <CouponBox
            code={coupon.code}
            description={`${coupon.description} · Get it for ${formatINR(coupon.finalPrice)} · Use at checkout`}
            className="mt-4"
          />
        ) : null}

        {product.colours.length > 1 ? (
          <ColourPicker colours={product.colours} value={product.colour.name} art={product.images[0].art} className="mt-5" />
        ) : null}

        <div ref={sizesRef} className="mt-5">
          {!oneSize ? (
            <SizePicker
              sizes={product.sizes}
              value={size}
              onChange={(s) => {
                setSize(s);
                setSizeError(false);
                track("size_selected", { productId: product.id, size: s });
              }}
              onSizeGuide={
                sizeChart
                  ? () => {
                      setGuideOpen(true);
                      track("size_guide_open", { productId: product.id });
                    }
                  : undefined
              }
            />
          ) : (
            <p className="text-[12px] font-bold uppercase tracking-[0.12em]">One size</p>
          )}
          {sizeError ? (
            <p role="alert" className="mt-2 text-[12px] font-semibold text-accent">
              Please select a size
            </p>
          ) : null}
          {fitNote ? <p className="mt-3 text-[12px] text-ink-2">{fitNote}</p> : null}
          {!oneSize ? (
            <SizeAdvice
              productId={product.id}
              onPick={(s) => {
                if (product.sizes.some((x) => x.label === s && x.stock > 0)) {
                  setSize(s);
                  setSizeError(false);
                }
              }}
            />
          ) : null}
          <ProductAlerts product={product} soldOutSizes={product.sizes.filter((s) => s.stock === 0).map((s) => s.label)} />
        </div>

        <p className="mt-4 flex items-center gap-2 bg-soft px-3.5 py-2.5 text-[12.5px]">
          <Icon icon={DeliveryTruck01Icon} size={18} className="shrink-0" />
          {p?.serviceable && p.standardBy ? (
            <span>
              {freeShipping ? "Free delivery" : "Delivery"} by <b>{formatDeliveryDate(p.standardBy)}</b> to {p.pincode}
            </span>
          ) : p && !p.serviceable ? (
            <span>We don&apos;t deliver to {p.pincode} yet</span>
          ) : (
            <a href="#delivery" className="underline underline-offset-2">
              {freeShipping ? "Free delivery" : "Delivery"} · check your pincode
            </a>
          )}
        </p>

        <div ref={ctaRef} className="mt-4 hidden flex-col gap-2.5 lg:flex">
          {soldOut ? (
            <Button size="lg" disabled className="w-full">
              Sold out
            </Button>
          ) : (
            <>
              <div className="flex gap-2.5">
                <Button size="lg" className="flex-1" onClick={add}>
                  <Icon icon={ShoppingBag02Icon} size={18} />
                  Add to bag
                </Button>
                {wishButton("size-[54px]")}
              </div>
              <Button size="lg" variant="outline" className="w-full" onClick={buyNow}>
                Buy now
              </Button>
              <ExchangeNote days={returnWindowDays} />
            </>
          )}
        </div>

        <Accordion type="multiple" defaultValue={["delivery", "description"]} className="mt-6 border-t border-line">
          <AccordionItem value="delivery" id="delivery" className="scroll-mt-24">
            <AccordionTrigger>Delivery &amp; returns</AccordionTrigger>
            <AccordionContent>
              <DeliveryCheck
                key={delivery.savedPincode}
                initialPincode={delivery.savedPincode}
                onCheck={async (pin) => {
                  const r = await delivery.check(pin);
                  if (!r || !r.serviceable || !r.standardBy) return null;
                  return {
                    date: formatDeliveryDate(r.standardBy),
                    cod: r.cod.available,
                    codFee: r.cod.available ? formatINR(r.cod.fee) : undefined,
                    note: r.express ? `Express by ${formatDeliveryDate(r.express.by)} for ${formatINR(r.express.fee)}` : undefined,
                  };
                }}
              />
              <ul className="mt-3 space-y-1.5 text-[12.5px] text-ink-2">
                <li className="flex items-center gap-1.5">
                  <Icon icon={CheckmarkCircle02Icon} size={15} className="text-green" />
                  {returnWindowDays}-day easy returns &amp; size exchange
                </li>
                <li>
                  <Link href="/legal/refund-cancellation" className="underline underline-offset-2">
                    Returns &amp; cancellation policy
                  </Link>
                </li>
              </ul>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="description">
            <AccordionTrigger>Description &amp; fit</AccordionTrigger>
            <AccordionContent>
              <p>{product.description}</p>
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-[12.5px]">
                {[...product.specs, { label: "SKU", value: product.sku }].map((s) => (
                  <div key={s.label}>
                    <dt className="text-muted">{s.label}</dt>
                    <dd className="font-medium">{s.value}</dd>
                  </div>
                ))}
              </dl>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="manufacturer">
            <AccordionTrigger>Manufacturer details</AccordionTrigger>
            <AccordionContent>
              <dl className="space-y-2.5 text-[12.5px]">
                {[
                  ["Marketed by", `${seller.marketedBy}, ${seller.address}`],
                  ["Manufactured by", product.legal.manufacturer],
                  ...(product.legal.packer ? [["Packed by", product.legal.packer]] : []),
                  ...(product.legal.importer ? [["Imported by", product.legal.importer]] : []),
                  ["Country of origin", product.legal.countryOfOrigin],
                  ["Net quantity", product.legal.netQuantity],
                  ["MRP", `${formatINR(product.mrp)} (inclusive of all taxes)`],
                  ["Customer care", `${seller.supportEmail} · ${seller.supportPhone}`],
                ].map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[130px_1fr] gap-3">
                    <dt className="text-muted">{k}</dt>
                    <dd className="break-words">{v}</dd>
                  </div>
                ))}
              </dl>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {sizeChart ? (
        <SizeGuide open={guideOpen} onOpenChange={setGuideOpen} chart={sizeChart} model={product.model} highlight={size} />
      ) : null}

      {/* Mobile fixed bar (PDP-06) */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-line bg-white p-2.5 pb-[max(10px,env(safe-area-inset-bottom))] lg:hidden">
        {wishButton("size-12")}
        {soldOut ? (
          <Button disabled className="flex-1">
            Sold out
          </Button>
        ) : (
          <Button className="flex-1" onClick={add}>
            {size ? `Add to bag · ${size}` : "Add to bag"}
          </Button>
        )}
      </div>
      <div className="h-20 lg:hidden" aria-hidden="true" />

      {/* Desktop sticky bar after scrolling past the CTA (PDP-06) */}
      <div
        aria-hidden={!pastCta}
        inert={!pastCta}
        className={cn(
          "fixed inset-x-0 bottom-0 z-30 hidden border-t border-line bg-white transition-transform duration-300 lg:block",
          pastCta ? "translate-y-0" : "translate-y-full",
        )}
      >
        <div className="mx-auto flex h-[72px] max-w-[1440px] items-center gap-4 px-10">
          <GarmentArt image={{ ...product.images[0], alt: "" }} className="h-14 w-11 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px]">{product.title}</p>
            <Price price={product.price} mrp={product.mrp} />
          </div>
          {!soldOut ? (
            <>
              <button
                type="button"
                onClick={() => sizesRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
                className="h-11 border border-black px-4 text-[12px] font-semibold"
              >
                {size ? `Size: ${size}` : "Select size"}
              </button>
              <Button className="h-11 w-[240px]" onClick={add}>
                Add to bag
              </Button>
            </>
          ) : (
            <Button disabled className="h-11 w-[240px]">
              Sold out
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function fitLine(product: Product, summary: ReviewSummary | null): string | null {
  const parts: string[] = [];
  if (summary && summary.count >= 5 && summary.fit !== null && summary.fit >= 0.4 && summary.fit <= 0.6) parts.push("Fits true to size.");
  if (product.model) parts.push(`Model is ${product.model.height} and wears ${product.model.size}.`);
  if (summary && summary.count >= 5 && summary.trueToSizePct !== null) {
    parts.push(`${summary.trueToSizePct}% of reviewers say it fits as expected.`);
  }
  return parts.length ? parts.join(" ") : null;
}
