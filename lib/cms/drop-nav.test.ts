import { describe, expect, it } from "vitest";
import { MOCK_PRODUCTS } from "@/lib/commerce/mock/data";
import { dropNavigation } from "./drop-nav";
import { MENU } from "./mock";
import { mockFooter } from "./mock-home";

describe("exclusive drop navigation (header, menu drawer, footer Shop column)", () => {
  const hoodie = MOCK_PRODUCTS.find((p) => p.category === "hoodies")!;
  const tee = MOCK_PRODUCTS.find((p) => p.category === "t-shirts")!;
  const nav = dropNavigation(
    [
      { title: "The Hoodie", product: hoodie },
      { title: "The Mascot Tee", product: tee },
    ],
    { menu: MENU, footer: mockFooter({}) },
  );
  const allHrefs = [...nav.headerLinks, ...nav.menu.tabs.flatMap((t) => [...t.items, ...t.promos]), ...nav.footer.columns[0].links].map((l) => l.href);

  it("header: only the drop's pieces (to their product pages) + Alpha Club — no New in / Bestsellers / Sale", () => {
    expect(nav.headerLinks).toEqual([
      { label: "The Hoodie", href: `/products/${hoodie.handle}` },
      { label: "The Mascot Tee", href: `/products/${tee.handle}` },
      { label: "Alpha Club", href: "/alpha-club" },
    ]);
  });

  it("menu drawer: one 'The drop' tab with the pieces, size guide, club, tracking; the old shop / collections tabs are gone", () => {
    expect(nav.menu.tabs.map((t) => t.id)).toEqual(["drop"]);
    expect(nav.menu.tabs[0].items.map((i) => i.label)).toEqual(["The Hoodie", "The Mascot Tee", "Size guide", "Alpha Club", "Track order"]);
    expect(nav.menu.tabs[0].promos).toHaveLength(2);
    for (const gone of ["/collections/new-in", "/collections/bestsellers", "/collections/sale", "/men/jeans", "/collections/winter-drop"]) expect(allHrefs, gone).not.toContain(gone);
  });

  it("footer: the Shop column lists the pieces; Help and Company columns stay", () => {
    const base = mockFooter({});
    expect(nav.footer.columns[0].title).toBe(base.columns[0].title);
    expect(nav.footer.columns[0].links.map((l) => l.label)).toEqual(["The Hoodie", "The Mascot Tee", "Size guide"]);
    expect(nav.footer.columns.slice(1)).toEqual(base.columns.slice(1));
  });

  it("with fewer than two pieces the drawer still gets two promo tiles", () => {
    const one = dropNavigation([{ title: "The Hoodie", product: hoodie }], { menu: MENU, footer: mockFooter({}) });
    expect(one.menu.tabs[0].promos).toHaveLength(2);
    expect(one.menu.tabs[0].promos[1].href).toBe("/");
  });
});
