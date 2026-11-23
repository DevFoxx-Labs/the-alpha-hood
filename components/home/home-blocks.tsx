import { ProductCard } from "@/components/store/product-card";
import { ArrowLink, CampaignBand, CategoryRailItem, CollectionTile, OfferTile, PromoBand } from "@/components/store/merch-tiles";
import { SectionHeader } from "@/components/store/section-header";
import { deviceClass } from "@/lib/cms/schedule";
import type { ResolvedHomeBlock } from "@/lib/storefront";
import { cn } from "@/lib/utils";
import { HeroCarousel } from "./hero-carousel";
import { ClubBand, ShopTheLook, UgcGrid } from "./m9-sections";
import { ProductGrid } from "./product-grid";
import { SeoBlock } from "./seo-block";
import { TrendingTabs } from "./trending-tabs";
import { TrustStrip } from "./trust-strip";

const gutter = "mx-auto max-w-[1440px] px-4 lg:px-10";
const section = "py-8 lg:py-16";

/** Renders CMS homepage blocks in CMS order (HOME-01…06, 08, 11, 12), honouring device targeting. */
export function HomeBlocks({ blocks }: { blocks: ResolvedHomeBlock[] }) {
  return blocks.map((resolved) => (
    <div key={resolved.block.id} className={deviceClass(resolved.block.devices)}>
      <Block resolved={resolved} />
    </div>
  ));
}

function Block({ resolved }: { resolved: ResolvedHomeBlock }) {
  const { block } = resolved;
  switch (block.type) {
    case "hero":
      return <HeroCarousel slides={block.slides} />;

    case "category_rail": {
      const categories = "categories" in resolved ? resolved.categories : [];
      if (categories.length === 0) return null;
      return (
        <section aria-labelledby={`${block.id}-h`} className={cn(gutter, section)}>
          <div id={`${block.id}-h`}>
            <SectionHeader lead={block.lead} title={block.title} underline />
          </div>
          <div className="scrollbar-none -mx-4 mt-6 flex gap-4 overflow-x-auto px-4 lg:mx-0 lg:mt-10 lg:grid lg:grid-cols-6 lg:gap-6 lg:overflow-visible lg:px-0">
            {categories.map((c) => (
              <CategoryRailItem key={c.handle} category={c} />
            ))}
          </div>
          <div className="mt-6 lg:mt-8">
            <ArrowLink href={block.viewAllHref}>Shop all</ArrowLink>
          </div>
        </section>
      );
    }

    case "promo_band":
      return <PromoBand left={block.left} right={block.right} highlight={block.highlight} href={block.href} image={block.image} />;

    case "campaign_band":
      return <CampaignBand kicker={block.kicker} headline={block.headline} text={block.text} cta={block.cta} image={block.image} />;

    case "collection_tiles":
      return (
        <section aria-label="Collections" className="scrollbar-none flex snap-x snap-mandatory gap-1 overflow-x-auto lg:grid lg:grid-cols-3 lg:overflow-visible">
          {block.tiles.map((t) => (
            <CollectionTile key={t.href} {...t} className="w-[78%] shrink-0 snap-start lg:w-auto" />
          ))}
        </section>
      );

    case "offer_tiles":
      return (
        <section aria-label="Offers" className={cn(gutter, "pt-8 lg:pt-16")}>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-[18px]">
            {block.tiles.map((t) => (
              <OfferTile key={t.href} lines={t.lines} price={t.price} href={t.href} image={{ art: t.art, colour: t.colour }} dark={t.dark} />
            ))}
          </div>
        </section>
      );

    case "product_tabs":
      return (
        <section className={cn(gutter, section, "px-2.5 lg:px-10")}>
          <TrendingTabs title={block.title} viewAllHref={block.viewAllHref} tabs={"tabs" in resolved ? resolved.tabs : []} />
        </section>
      );

    case "product_grid": {
      const products = "products" in resolved ? resolved.products : [];
      if (products.length === 0) return null;
      return (
        <section className={cn(gutter, section, "px-2.5 lg:px-10")}>
          <SectionHeader lead={block.lead} title={block.title} underline viewAllHref={block.viewAllHref} />
          <ProductGrid className="mt-6 lg:mt-8">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </ProductGrid>
        </section>
      );
    }

    case "shop_the_look": {
      if (!("look" in resolved) || !resolved.look) return null;
      return <ShopTheLook look={resolved.look} products={resolved.products} lead={block.lead} title={block.title} />;
    }

    case "club_band":
      return <ClubBand title={block.title} text={block.text} cta={block.cta} />;

    case "ugc_grid":
      return <UgcGrid title={block.title} text={block.text} />;

    case "trust_strip":
      return (
        <section aria-label="Why shop with us" className={cn(gutter, "py-4 lg:py-8")}>
          <TrustStrip />
        </section>
      );

    case "seo":
      return (
        <section className={cn(gutter, "pb-10 pt-6 lg:pb-14 lg:pt-8")}>
          <SeoBlock heading={block.heading} groups={block.groups} text={block.text} />
        </section>
      );
  }
}
