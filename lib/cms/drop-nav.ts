import type { Product } from "@/lib/commerce/types";
import type { MenuTab, NavLink } from "./mock";
import type { FooterContent } from "./types";

/**
 * "Exclusive drop" layout navigation, built from the drop's own spotlights (Admin → Homepage → Product spotlights):
 * each piece's title links to its product page. So the header links, the menu drawer and the footer's Shop column only
 * ever offer what the drop sells — no New in / Bestsellers / Sale / 27 categories. Change a spotlight and the
 * navigation follows.
 */
export interface DropPiece {
  title: string;
  product: Product;
}

const FILLS = ["#151515", "#5a1f2a", "#1d2a44", "#2f4a3a"];

export function dropNavigation(pieces: DropPiece[], base: { menu: { tabs: MenuTab[]; footerTiles: { title: string; href: string; tone: "volt" | "black" }[] }; footer: FooterContent }) {
  const links: NavLink[] = pieces.map((p) => ({ label: p.title, href: `/products/${p.product.handle}` }));
  const headerLinks: NavLink[] = [...links, { label: "Alpha Club", href: "/alpha-club" }];

  // The drawer needs exactly two promo tiles: the first two pieces (or the drop page itself).
  const promoOf = (i: number) =>
    pieces[i]
      ? { title: pieces[i].title.replace(/^the\s+/i, "The\n"), href: links[i].href, fill: FILLS[i % FILLS.length], art: pieces[i].product.images[0]?.art }
      : { title: "The\nDrop", href: "/", fill: FILLS[i % FILLS.length] };
  const shopTab: MenuTab = {
    id: "drop",
    label: "The drop",
    promos: [promoOf(0), promoOf(1)],
    items: [
      ...links,
      { label: "Size guide", href: "/help/size-guide" },
      { label: "Alpha Club", href: "/alpha-club" },
      { label: "Track order", href: "/track-order" },
    ],
  };
  const menu = { tabs: [shopTab], footerTiles: base.menu.footerTiles };

  // Footer: the first column (Shop) lists the drop's pieces; Help / Company stay as they are.
  const [first, ...rest] = base.footer.columns;
  const footer: FooterContent = {
    ...base.footer,
    columns: first ? [{ title: first.title, links: [...links, { label: "Size guide", href: "/help/size-guide" }] }, ...rest] : base.footer.columns,
  };
  return { headerLinks, menu, footer };
}
