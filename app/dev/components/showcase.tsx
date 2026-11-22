"use client";

import { useState } from "react";
import { Badge, LowStockNote } from "@/components/store/badges";
import { CheckoutStep, DoneLine, PaymentMethods, type PaymentChoice } from "@/components/store/checkout-blocks";
import { ColourPicker } from "@/components/store/colour-picker";
import { CouponBox } from "@/components/store/coupon-box";
import { DeliveryCheck } from "@/components/store/delivery-check";
import {
  AppliedChips,
  CheckboxFilter,
  ColourFilter,
  FilterBarChip,
  FilterSection,
  PriceFilter,
  SizeFilter,
  SortMenu,
} from "@/components/store/filters";
import { FreeShippingBar } from "@/components/store/free-shipping-bar";
import { CategoryRailItem, CollectionTile, OfferTile, PromoBand, ArrowLink } from "@/components/store/merch-tiles";
import { MenuDrawer } from "@/components/store/menu-drawer";
import { MiniCart } from "@/components/store/mini-cart";
import { MobileTabBar } from "@/components/store/mobile-tab-bar";
import { OrderSummary } from "@/components/store/order-summary";
import { Price } from "@/components/store/price";
import { ProductCard } from "@/components/store/product-card";
import { ReviewCard, ReviewSummary } from "@/components/store/review-summary";
import { SectionHeader } from "@/components/store/section-header";
import { SiteHeader } from "@/components/store/site-header";
import { SizePicker } from "@/components/store/size-picker";
import { useStoreUI } from "@/components/store/store-ui-provider";
import { BagToast, showMessageToast } from "@/components/store/toast";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { RadioCard, RadioDot, RadioGroup } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AnnouncementMessage, MENU, NavLink } from "@/lib/cms/mock";
import type { CartLine, Category, Product } from "@/lib/commerce/types";
import { STORE_CONFIG } from "@/lib/config/store";
import { formatINR, rupees } from "@/lib/format";
import { cn } from "@/lib/utils";

const COLOURS = [
  ["black", "#0A0A0A", "bg-black"],
  ["ink", "#111111", "bg-ink"],
  ["ink-2", "#4A4A4A", "bg-ink-2"],
  ["muted", "#8A8A8A", "bg-muted"],
  ["line", "#E6E6E6", "bg-line"],
  ["line-2", "#F0F0F0", "bg-line-2"],
  ["white", "#FFFFFF", "bg-white"],
  ["soft", "#F4F4F2", "bg-soft"],
  ["soft-2", "#ECECEA", "bg-soft-2"],
  ["accent", "#E4002B", "bg-accent"],
  ["accent-tint", "#FDE8EC", "bg-accent-tint"],
  ["coupon", "#FBEDEA", "bg-coupon"],
  ["volt", "#F4E04D", "bg-volt"],
  ["green", "#1F8A4C", "bg-green"],
  ["green-tint", "#EDF7F0", "bg-green-tint"],
] as const;

const NAV = [
  "Tokens",
  "Header",
  "Buttons",
  "Badges",
  "Product card",
  "Pickers",
  "PDP blocks",
  "Home blocks",
  "Tabs",
  "Filters",
  "Reviews",
  "Checkout",
  "Feedback",
];

const slug = (s: string) => s.toLowerCase().replace(/\s+/g, "-");

function Block({ title, spec, children, className }: { title: string; spec?: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={slug(title)} className={cn("scroll-mt-28 border-t border-line px-4 py-10 lg:px-10 lg:py-16", className)}>
      <header className="mb-6 lg:mb-8">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">{spec ?? "DESIGN.md §3"}</p>
        <h2 className="type-section mt-1">{title}</h2>
      </header>
      {children}
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 mt-8 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-2 first:mt-0">{children}</p>;
}

export function ComponentShowcase({
  products,
  categories,
  announcements,
  headerLinks,
  menu,
}: {
  products: Product[];
  categories: Category[];
  announcements: AnnouncementMessage[];
  headerLinks: NavLink[];
  menu: typeof MENU;
}) {
  const { setCartOpen, addToBag } = useStoreUI();
  const byHandle = (needle: string) => products.find((p) => p.handle.includes(needle)) ?? products[0];
  const flannel = byHandle("flannel-check");
  const jeans = byHandle("baggy-jeans");
  const tee = byHandle("oversized-tee-jet");
  const soldOutTee = byHandle("graphic-print");
  const puffer = byHandle("puffer");

  const [size, setSize] = useState<string | undefined>("M");
  const [colour, setColour] = useState(flannel.colour.name);
  const [sort, setSort] = useState("popularity");
  const [sizes, setSizes] = useState<string[]>(["M"]);
  const [fits, setFits] = useState<string[]>(["Regular fit"]);
  const [colours, setColours] = useState<string[]>(["Black"]);
  const [loading, setLoading] = useState(false);

  const toggle = (list: string[], set: (v: string[]) => void) => (v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const chips = [...sizes.map((s) => `Size: ${s}`), ...fits, ...colours];

  const upsell = products.filter((p) => ["shades", "cap", "tee"].includes(p.images[0].art)).slice(0, 3);

  // Demo lines for the order summary (display only — real totals come from the server in M5).
  const demoLines: CartLine[] = [flannel, jeans, tee].map((p, i) => ({
    id: `demo_${i}`,
    productId: p.id,
    title: p.title,
    colour: p.colour.name,
    size: p.sizes[2]?.label ?? p.sizes[0].label,
    quantity: 1,
    price: p.price,
    mrp: p.mrp,
    image: p.images[0],
  }));
  const totalMrp = demoLines.reduce((n, l) => n + l.mrp, 0);
  const subtotal = demoLines.reduce((n, l) => n + l.price, 0);
  const coupon = rupees(440);
  const coinsAmt = rupees(120);
  const toPay = subtotal - coupon - coinsAmt;

  return (
    <div className="pb-24 lg:pb-0">
      <SiteHeader announcements={announcements} links={headerLinks} />
      <MenuDrawer menu={menu} />
      <MiniCart upsell={upsell} />

      <div className="border-b border-line bg-soft px-4 py-6 lg:px-10">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">Dev only · M0 + M1 · not indexed</p>
        <h1 className="mt-1 font-display text-[40px] uppercase leading-none lg:text-[64px]">Design system</h1>
        <p className="type-body mt-2 max-w-2xl">
          Every component from DESIGN.md §3 with demo data from the mock commerce adapter. Garment drawings are placeholders for
          real product photography.
        </p>
        <nav aria-label="Sections" className="scrollbar-none -mx-4 mt-4 flex gap-2 overflow-x-auto px-4">
          {NAV.map((n) => (
            <a key={n} href={`#${slug(n)}`} className="shrink-0 border border-line bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] hover:border-black">
              {n}
            </a>
          ))}
        </nav>
      </div>

      {/* ───────────── Tokens ───────────── */}
      <Block title="Tokens" spec="DESIGN.md §2">
        <Label>Colour</Label>
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">
          {COLOURS.map(([name, hex, cls]) => (
            <li key={name}>
              <div className={cn("h-14 border border-line", cls)} />
              <p className="mt-1.5 text-[12px] font-semibold">{name}</p>
              <p className="tabular text-[11px] text-muted">{hex}</p>
            </li>
          ))}
        </ul>

        <Label>Typography — Anton display / Inter UI</Label>
        <div className="space-y-6">
          <div className="bg-black p-5 lg:p-8">
            <p className="font-display text-[62px] uppercase leading-[0.86] tracking-[0.5px] text-volt lg:text-[148px]">Own the cold</p>
            <p className="mt-2 text-[11px] text-white/60">hero · 148/0.86 desktop · 62/0.86 mobile</p>
          </div>
          <SectionHeader lead="Shop by" title="Category" underline viewAllHref="#" />
          <p className="font-display text-[30px] uppercase leading-[0.9] lg:text-[54px] lg:leading-[0.88]">Tile title 54</p>
          <p className="font-display text-[40px] uppercase leading-[0.9] lg:text-[78px] lg:leading-[0.88]">
            Promo <span className="text-accent">40%</span>
          </p>
          <p className="text-[16px] leading-[1.35] lg:text-[21px] lg:leading-[1.3]">PDP title — Brushed Flannel Check Shirt — Slate Grey</p>
          <Price price={flannel.price} mrp={flannel.mrp} size="pdp" />
          <p className="type-body max-w-xl">
            Body — a soft brushed flannel in a muted slate check, cut in a relaxed regular fit with a spread collar, chest pocket and curved hem.
          </p>
          <p className="type-label">Label style · uppercase 0.12em</p>
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] lg:text-[11.5px]">Announcement style</p>
        </div>
      </Block>

      {/* ───────────── Header / drawers ───────────── */}
      <Block title="Header" spec="DESIGN.md §3 · AnnouncementBar · Header · MenuDrawer · MiniCart · MobileTabBar">
        <p className="type-body mb-4 max-w-2xl">
          The live header is pinned at the top of this page (scroll down to see it hide the announcement bar). Open the drawers from it
          or with these buttons. The mobile tab bar is fixed at the bottom below 1024 px.
        </p>
        <div className="flex flex-wrap gap-2">
          <MenuButton />
          <Button variant="outline" onClick={() => setCartOpen(true)}>
            Open mini-cart
          </Button>
          <Button variant="outline" onClick={() => addToBag(jeans, "32")}>
            Add jeans · 32 to bag
          </Button>
        </div>
        <Label>Free-shipping progress</Label>
        <div className="grid max-w-md gap-3">
          <FreeShippingBar subtotal={rupees(599)} threshold={STORE_CONFIG.freeShippingThreshold} />
          <FreeShippingBar subtotal={rupees(1299)} threshold={STORE_CONFIG.freeShippingThreshold} />
        </div>
      </Block>

      {/* ───────────── Buttons ───────────── */}
      <Block title="Buttons">
        <Label>Variants (48 px)</Label>
        <div className="flex flex-wrap items-center gap-3">
          <Button>Add to bag</Button>
          <Button variant="outline">Buy now</Button>
          <Button variant="link">View all</Button>
          <Button variant="ghost">Ghost</Button>
        </div>
        <div className="on-dark mt-3 flex flex-wrap items-center gap-3 bg-black p-4">
          <Button variant="on-dark">Shop the drop</Button>
          <Button variant="volt">Join now</Button>
        </div>
        <Label>Sizes · states</Label>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Small 36</Button>
          <Button>Medium 48</Button>
          <Button size="lg">Large 54</Button>
          <Button disabled>Disabled</Button>
          <Button
            loading={loading}
            onClick={() => {
              setLoading(true);
              window.setTimeout(() => setLoading(false), 1500);
            }}
          >
            Click to load
          </Button>
        </div>
        <Label>Full width on mobile forms</Label>
        <Button size="lg" className="w-full sm:w-auto">
          Pay {formatINR(toPay)} securely
        </Button>
      </Block>

      {/* ───────────── Badges ───────────── */}
      <Block title="Badges">
        <div className="flex flex-wrap items-center gap-3 bg-soft p-4">
          <Badge tone="white">New</Badge>
          <Badge tone="black">New</Badge>
          <Badge tone="red">Bestseller</Badge>
          <Badge tone="red">−30%</Badge>
          <Badge tone="grey">Sold out</Badge>
          <LowStockNote count={2} />
        </div>
      </Block>

      {/* ───────────── Product card ───────────── */}
      <Block title="Product card" spec="DESIGN.md §3 · PRD CARD-01 / CARD-02">
        <p className="type-body mb-5 max-w-2xl">
          Hover on desktop swaps to the 2nd image and shows quick-add sizes. The “+” opens the size picker sheet. Includes NEW,
          BESTSELLER, −30%, low-stock, sold-out and one-size cases.
        </p>
        <div className="-mx-[6px] grid grid-cols-2 gap-x-2 gap-y-4 lg:mx-0 lg:grid-cols-4 lg:gap-x-[18px] lg:gap-y-[30px]">
          {[tee, jeans, byHandle("corduroy"), byHandle("zip-hoodie"), flannel, puffer, soldOutTee, byHandle("aviator")].map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
        <Label>Loading skeleton</Label>
        <div className="grid grid-cols-2 gap-x-2 gap-y-4 lg:grid-cols-4 lg:gap-x-[18px]">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i}>
              <Skeleton className="aspect-[3/4]" />
              <Skeleton className="mt-2.5 h-3.5 w-4/5" />
              <Skeleton className="mt-1.5 h-3.5 w-1/2" />
            </div>
          ))}
        </div>
      </Block>

      {/* ───────────── Pickers ───────────── */}
      <Block title="Pickers" spec="DESIGN.md §3 · SizePicker · ColourPicker">
        <div className="grid gap-10 lg:grid-cols-2">
          <div className="space-y-8">
            <SizePicker sizes={flannel.sizes} value={size} onChange={setSize} onSizeGuide={() => showMessageToast("Size guide opens in M4")} />
            <div className="max-w-[390px]">
              <Label>Mobile (compact)</Label>
              <SizePicker sizes={flannel.sizes.slice(0, 6)} value={size} onChange={setSize} compact />
            </div>
          </div>
          <ColourPicker colours={flannel.colours} value={colour} onChange={setColour} art="check" />
        </div>
      </Block>

      {/* ───────────── PDP blocks ───────────── */}
      <Block title="PDP blocks" spec="DESIGN.md §3 · CouponBox · DeliveryCheck · Accordion">
        <div className="grid max-w-[520px] gap-6">
          <CouponBox code="ALPHA10" description="Demo: extra 10% off on your first order · use at checkout" />
          <DeliveryCheck
            onCheck={async (pin) =>
              pin.startsWith("0") ? null : { date: "Tue, 24 Nov", cod: true, codFee: "₹49", note: "7-day easy returns & size exchange" }
            }
          />
          <Accordion type="multiple" defaultValue={["desc"]}>
            <AccordionItem value="delivery">
              <AccordionTrigger>Delivery &amp; returns</AccordionTrigger>
              <AccordionContent>Standard delivery in 2–5 days. Easy 7-day returns and size exchanges (demo copy).</AccordionContent>
            </AccordionItem>
            <AccordionItem value="desc">
              <AccordionTrigger>Description &amp; fit</AccordionTrigger>
              <AccordionContent>
                A soft brushed flannel in a muted slate check, cut in a relaxed regular fit with a spread collar, chest pocket and
                curved hem. Layer it open over a tee or button it up for a smart-casual look.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="reviews">
              <AccordionTrigger>Reviews (46)</AccordionTrigger>
              <AccordionContent>Reviews render here (M4).</AccordionContent>
            </AccordionItem>
            <AccordionItem value="mfr">
              <AccordionTrigger>Manufacturer details</AccordionTrigger>
              <AccordionContent>Legal Metrology declarations (PDP-07) — filled from catalogue data in M4.</AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </Block>

      {/* ───────────── Home blocks ───────────── */}
      <Block title="Home blocks" spec="DESIGN.md §3 · SectionHeader · CategoryRail · PromoBand · CollectionTile · OfferTile">
        <SectionHeader lead="Shop by" title="Category" underline />
        <ul className="scrollbar-none -mx-4 mt-6 flex gap-3 overflow-x-auto px-4 lg:mx-0 lg:grid lg:grid-cols-6 lg:gap-4 lg:px-0">
          {categories.map((c) => (
            <li key={c.handle}>
              <CategoryRailItem category={c} />
            </li>
          ))}
        </ul>
        <div className="mt-4">
          <ArrowLink href="/men">Shop all</ArrowLink>
        </div>
      </Block>
      <div className="space-y-1">
        <PromoBand left={"Last call\non bestsellers"} right={"Up to 40%\noff"} highlight="40%" href="/collections/sale" />
        <div className="grid gap-1 md:grid-cols-3">
          <CollectionTile title={"Puffer\nseason"} tagline="Warmth with an attitude" href="#" fill="#8a8c90" look={{ top: "#5a1f2a", bottom: "#151515", skin: "#B98563" }} />
          <CollectionTile title={"Smart\ncasuals"} tagline="Monday to Friday, sorted" href="#" fill="#5a5a5a" look={{ top: "#151515", bottom: "#d8c9a8", skin: "#C9946B" }} />
          <CollectionTile title={"Knit\nclub"} tagline="Texture that talks" href="#" fill="#cfc6b4" look={{ top: "#efe9da", bottom: "#2d3f5a", skin: "#8a5a3c" }} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 px-4 py-8 lg:grid-cols-4 lg:gap-[18px] lg:px-10">
        <OfferTile lines={["Any 2", "bottoms"]} price="₹2,999" href="#" image={{ art: "trouser", colour: "#c8b99b" }} />
        <OfferTile lines={["Combo", "hoodies"]} price="2 for ₹2,499" href="#" image={{ art: "hoodie", colour: "#3a3a3c" }} dark />
        <OfferTile lines={["Sunglasses", "starting"]} price="₹999" href="#" image={{ art: "shades", colour: "#1b1b1b" }} />
        <OfferTile lines={["Any 3", "tees"]} price="₹1,999" href="#" image={{ art: "tee", colour: "#f4f2ec" }} />
      </div>
      <p className="px-4 pb-2 text-[11px] text-muted lg:px-10">Offer tiles show demo combo prices — publish only live offers.</p>

      {/* ───────────── Tabs ───────────── */}
      <Block title="Tabs" spec="DESIGN.md §3 · Tabs (category)">
        <SectionHeader title="Trending" viewAllHref="#" />
        <Tabs defaultValue="all" className="mt-4">
          <TabsList>
            {["All", "Shirts", "Jackets", "Jeans", "Sweaters", "Trousers", "T-shirts", "Hoodies", "Shoes"].map((t) => (
              <TabsTrigger key={t} value={t.toLowerCase()}>
                {t}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="all" className="pt-5 text-[13px] text-ink-2">
            All products — tab panels load without a page reload (HOME-06, M2).
          </TabsContent>
          <TabsContent value="shirts" className="pt-5 text-[13px] text-ink-2">
            Shirts panel.
          </TabsContent>
        </Tabs>
      </Block>

      {/* ───────────── Filters ───────────── */}
      <Block title="Filters" spec="DESIGN.md §3 · FilterSidebar · SortMenu">
        <div className="scrollbar-none -mx-4 mb-6 flex items-center gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
          <FilterBarChip label="Filters" active count={chips.length} />
          {["Size", "Fit", "Colour", "Price", "Fabric", "Sleeve"].map((f) => (
            <FilterBarChip key={f} label={f} />
          ))}
          <div className="ml-auto shrink-0 pl-4">
            <SortMenu value={sort} onChange={setSort} />
          </div>
        </div>
        <div className="max-w-[264px]">
          <AppliedChips
            chips={chips}
            onRemove={(c) => {
              setSizes(sizes.filter((s) => `Size: ${s}` !== c));
              setFits(fits.filter((f) => f !== c));
              setColours(colours.filter((x) => x !== c));
            }}
            onClear={() => {
              setSizes([]);
              setFits([]);
              setColours([]);
            }}
          />
          <FilterSection title="Size">
            <SizeFilter sizes={["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL"]} selected={sizes} onToggle={toggle(sizes, setSizes)} />
          </FilterSection>
          <FilterSection title="Fit">
            <CheckboxFilter
              options={[
                { label: "Regular fit", count: 112 },
                { label: "Slim fit", count: 64 },
                { label: "Oversized / boxy", count: 48 },
                { label: "Relaxed", count: 24 },
              ]}
              selected={fits}
              onToggle={toggle(fits, setFits)}
            />
          </FilterSection>
          <FilterSection title="Colour">
            <ColourFilter
              colours={[
                { name: "Black", hex: "#1b1b1b" },
                { name: "White", hex: "#ffffff" },
                { name: "Navy", hex: "#2b3a55" },
                { name: "Beige", hex: "#c8b99b" },
                { name: "Olive", hex: "#59603f" },
                { name: "Brown", hex: "#7a5230" },
                { name: "Grey", hex: "#8a8a8a" },
                { name: "Maroon", hex: "#5a1f2a" },
                { name: "Blue", hex: "#8fb3d1" },
                { name: "Cream", hex: "#e8e1cf" },
                { name: "Green", hex: "#2f4a3a" },
                { name: "Multi", hex: "multi" },
              ]}
              selected={colours}
              onToggle={toggle(colours, setColours)}
            />
          </FilterSection>
          <FilterSection title="Price">
            <PriceFilter min={499} max={2999} />
          </FilterSection>
          {["Fabric", "Sleeve", "Pattern", "Occasion", "Discount"].map((f) => (
            <FilterSection key={f} title={f} defaultOpen={false}>
              <p className="text-[12px] text-muted">Values come from catalogue attributes (M3).</p>
            </FilterSection>
          ))}
        </div>
      </Block>

      {/* ───────────── Reviews ───────────── */}
      <Block title="Reviews" spec="DESIGN.md §3 · ReviewSummary">
        <div className="grid gap-10 lg:grid-cols-[320px_1fr] lg:gap-16">
          <ReviewSummary average={4.6} count={128} distribution={[72, 18, 6, 2, 2]} fit={0.5} />
          <div>
            <ReviewCard
              rating={5}
              title="Sample review title"
              body="Sample review placeholder — replaced with real customer reviews. Shows text, size bought, fit feedback and customer photos."
              meta="Size M · Fit: true to size · 2 weeks ago"
              verified
              photos={[
                { art: "check", colour: "#5c6670", alt: "Customer photo 1" },
                { art: "shirt", colour: "#5c6670", alt: "Customer photo 2" },
              ]}
            />
            <ReviewCard
              rating={4}
              title="Second sample review"
              body="Sample review placeholder. Reviews can be filtered by rating, size and “with photos”."
              meta="Size L · Fit: slightly large · 1 month ago"
              verified
            />
          </div>
        </div>
      </Block>

      {/* ───────────── Checkout ───────────── */}
      <Block title="Checkout" spec="DESIGN.md §3 · Checkout blocks · OrderSummary" className="bg-checkout">
        <p className="mb-5 text-[12px] text-muted">Demo names and amounts — nothing here submits or charges.</p>
        <div className="grid items-start gap-5 lg:grid-cols-[1fr_440px] lg:gap-10">
          <div className="space-y-5">
            <CheckoutStep number={1} title="Contact" done action={<Button variant="link">Change</Button>}>
              <DoneLine>+91 98XXX XX210 · verified with OTP</DoneLine>
            </CheckoutStep>
            <CheckoutStep number={2} title="Delivery address">
              <RadioGroup defaultValue="home" className="grid-cols-1 sm:grid-cols-2" aria-label="Delivery address">
                {[
                  ["home", "Home", "Flat 12B, Sample Residency, Demo Road", "Pune, Maharashtra 411045"],
                  ["work", "Work", "4th Floor, Example Tech Park", "Pune, Maharashtra 411057"],
                ].map(([v, tag, l1, l2]) => (
                  <RadioCard key={v} value={v}>
                    <span className="flex items-start justify-between gap-3">
                      <span>
                        <span className="flex items-center gap-2 text-[14px] font-semibold">
                          Demo Customer
                          <span className="bg-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]">{tag}</span>
                        </span>
                        <span className="mt-1 block text-[13px] leading-relaxed text-ink-2">
                          {l1}
                          <br />
                          {l2}
                        </span>
                      </span>
                      <RadioDot />
                    </span>
                  </RadioCard>
                ))}
              </RadioGroup>
              <p className="mb-2.5 mt-6 text-[12px] font-bold uppercase tracking-[0.12em]">Delivery speed</p>
              <RadioGroup defaultValue="standard" className="grid-cols-1 sm:grid-cols-2" aria-label="Delivery speed">
                <RadioCard value="standard">
                  <span className="block text-[14px] font-semibold">Standard · FREE</span>
                  <span className="text-[13px] text-ink-2">Arrives Tue, 24 Nov</span>
                </RadioCard>
                <RadioCard value="express">
                  <span className="block text-[14px] font-semibold">Express · ₹99</span>
                  <span className="text-[13px] text-ink-2">Arrives tomorrow</span>
                </RadioCard>
              </RadioGroup>
            </CheckoutStep>
            <CheckoutStep number={3} title="Payment" aside="All transactions are encrypted">
              <DemoPayment payLabel={`Pay ${formatINR(toPay)} securely`} />
            </CheckoutStep>
          </div>
          <OrderSummary
            className="lg:sticky lg:top-28"
            lines={demoLines}
            coupon={{ code: "ALPHA10", amount: coupon }}
            coins={{ count: 120, amount: coinsAmt }}
            rows={[
              { label: "Total MRP", amount: totalMrp },
              { label: "Discount on MRP", amount: totalMrp - subtotal, discount: true },
              { label: "Coupon (ALPHA10)", amount: coupon, discount: true },
              { label: "Hood Coins", amount: coinsAmt, discount: true },
              { label: "Shipping", amount: 0, freeLabel: "FREE" },
            ]}
            toPay={toPay}
            saving={totalMrp - toPay}
          />
        </div>
      </Block>

      {/* ───────────── Feedback ───────────── */}
      <Block title="Feedback" spec="DESIGN.md §3 · Toast · Skeletons · Drawer">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => addToBag(flannel, "M")}>Add to bag (toast)</Button>
          <Button variant="outline" onClick={() => showMessageToast("Added to wishlist")}>
            Message toast
          </Button>
        </div>
        <Label>Toast (static preview)</Label>
        <div className="max-w-[420px]">
          <BagToast line={{ title: flannel.title, size: "M", image: flannel.images[0] }} onViewBag={() => setCartOpen(true)} />
        </div>
        <Label>Skeleton blocks</Label>
        <div className="grid max-w-md gap-2">
          <Skeleton className="h-10" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      </Block>

      <MobileTabBar active="/" />
    </div>
  );
}

function MenuButton() {
  const { setMenuOpen } = useStoreUI();
  return <Button onClick={() => setMenuOpen(true)}>Open menu drawer</Button>;
}

/** Showcase-only wrapper: local state, the pay button just shows a toast (nothing is charged). */
function DemoPayment({ payLabel }: { payLabel: string }) {
  const [method, setMethod] = useState<PaymentChoice>("upi");
  const [app, setApp] = useState("gpay");
  return (
    <PaymentMethods
      value={method}
      onChange={setMethod}
      upiApp={app}
      onUpiApp={setApp}
      prepaidOffer="Extra 5% off"
      cod={{ allowed: true, reasons: [], feeLabel: "₹49" }}
      payLabel={payLabel}
      onPay={() => showMessageToast("Demo only — nothing is charged on /dev/components")}
    />
  );
}
