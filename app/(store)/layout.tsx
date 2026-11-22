import { Logo } from "@/components/store/logo";
import { MenuDrawer } from "@/components/store/menu-drawer";
import { MiniCart } from "@/components/store/mini-cart";
import { MobileTabBar } from "@/components/store/mobile-tab-bar";
import { SiteFooter } from "@/components/store/site-footer";
import { SiteHeader } from "@/components/store/site-header";
import { getShell } from "@/lib/storefront";

/**
 * Store shell: announcement bar + header (GLB-01/02), menu drawer (GLB-03), mini-cart (GLB-06), footer
 * (GLB-05) and the mobile tab bar (GLB-04). Without a configured CMS/commerce backend it degrades to a
 * minimal shell so legal and privacy pages always work.
 */
export default async function StoreLayout({ children }: LayoutProps<"/">) {
  const shell = await getShell();

  const skip = (
    <a
      href="#main"
      className="sr-only z-[70] bg-black px-4 py-3 text-[12px] font-bold uppercase tracking-[0.1em] text-white focus:not-sr-only focus:fixed focus:left-2 focus:top-2"
    >
      Skip to content
    </a>
  );

  if (!shell) {
    return (
      <>
        {skip}
        <header className="grid h-14 place-items-center border-b border-line bg-white lg:h-16">
          <Logo />
        </header>
        <main id="main">{children}</main>
        <SiteFooter content={null} />
      </>
    );
  }

  return (
    <>
      {skip}
      <SiteHeader announcements={shell.announcements} links={shell.headerLinks} trendingSearches={shell.trendingSearches} />
      <MenuDrawer menu={shell.menu} />
      <MiniCart sizesByProduct={shell.sizesByProduct} upsell={shell.upsell} />
      <main id="main">{children}</main>
      <SiteFooter content={shell.footer} />
      <MobileTabBar />
    </>
  );
}
