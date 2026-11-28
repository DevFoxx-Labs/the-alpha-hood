import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MOCK_DROP_HOMEPAGE, MOCK_HOMEPAGE } from "@/lib/cms/mock-home";
import type { HomeBlock } from "@/lib/cms/types";
import type { Product } from "@/lib/commerce/types";
import { spotlightLinks, type ResolvedHomeBlock } from "@/lib/storefront";
import { BrandMarquee, fillHalf, frontWords } from "./brand-marquee";
import { editionLeft } from "./signature-pieces";

type Props = Parameters<typeof BrandMarquee>[0];
const render = (p: Partial<Props> = {}) => renderToStaticMarkup(createElement(BrandMarquee, { front: ["Hoodies", "Knits"], back: ["Limited"], ...p }));
const marqueeOf = (page: HomeBlock[]) => page.find((b): b is Extract<HomeBlock, { type: "marquee" }> => b.type === "marquee")!;
const root = process.cwd();
const css = readFileSync(join(root, "app/globals.css"), "utf8");

describe("BrandMarquee — crossed word tapes under the hero", () => {
  it("two tapes crossing (−2° front, +2° back), opposite directions, two identical halves each", () => {
    const html = render();
    expect(html).toContain("-rotate-5 md:-rotate-3 xl:-rotate-2");
    expect(html).toContain(" rotate-5 md:rotate-3 xl:rotate-2");
    expect(html).toContain("motion-safe:animate-marquee ");
    expect(html).toContain("motion-safe:animate-marquee-back");
    expect(html).toContain("mq-push-l");
    expect(html).toContain("mq-push-r");
    // fillHalf repeats the words; each half is rendered twice → an even count of every word.
    expect((html.match(/>Hoodies</g) ?? []).length % 2).toBe(0);
    expect(css).toMatch(/--animate-marquee-back: marquee \d+s linear infinite reverse/);
  });

  it("decorative for assistive tech: aria-hidden, links can't be tabbed to and don't prefetch", () => {
    const html = render({ links: [{ label: "Hoodies", href: "/men/hoodies" }] });
    expect(html).toMatch(/^<div aria-hidden="true"/);
    const anchors = html.match(/<a [^>]*>/g) ?? [];
    expect(anchors.length).toBeGreaterThan(0);
    for (const a of anchors) expect(a).toContain('tabindex="-1"');
  });

  it("alternates solid and outline words; the separators are the small logo-mark files (≤ 4 KB)", () => {
    const html = render();
    expect(html).toContain("[-webkit-text-stroke:1.25px_var(--color-ink)]");
    // Drawn by CSS after each word: one element per word, no <img> per separator (lean DOM).
    expect(html).not.toContain("<img src=\"/brand");
    expect(html).toContain("mq-word");
    expect(css).toMatch(/\.mq-word::after \{[^}]*mark_color@72\.webp/);
    expect(css).toMatch(/\.mq-tape-back \.mq-word::after \{[^}]*mark_white@72\.webp/);
    for (const f of ["mark_color@72.webp", "mark_white@72.webp"]) expect(statSync(join(root, "public/brand/logo", f)).size).toBeLessThan(4096);
  });

  it("mascot only on desktop: phones get a 1×1 placeholder, the real image is a ≥1024 px <source>", () => {
    const html = render();
    expect(html).toMatch(/<source media="\(min-width: 1024px\)"/);
    expect(html).toMatch(/<img[^>]*src="data:image\/gif/);
    expect(html).toContain("hidden h-[250px]");
    expect(render({ mascot: false })).not.toContain("<picture");
  });

  it("stock: count after the first word, red chip at 10 or fewer, 'Sold out' at 0, nothing when unknown", () => {
    expect(frontWords(["The signed drop", "Numbered"], [{ label: "The Hoodie", href: "#spotlight-hoodie" }], 37).map((w) => w.label)).toEqual(["The signed drop", "37 left", "The Hoodie", "Numbered"]);
    expect(frontWords(["A"], [], 37)[1].urgent).toBe(false);
    expect(frontWords(["A"], [], 8)[1]).toEqual({ label: "8 left", urgent: true });
    expect(frontWords(["A"], [], 0)[1]).toEqual({ label: "Sold out", urgent: true });
    expect(frontWords(["A"], [], null)).toEqual([{ label: "A" }]);
    expect(render({ left: 4 })).toContain("bg-accent");
  });

  it("each half is wide enough for a 2560 px screen plus the scroll push (no gap in the loop)", () => {
    const half = fillHalf([{ label: "Knits" }]);
    expect(half.reduce((n, w) => n + w.label.length * 15 + 100, 0)).toBeGreaterThanOrEqual(3200);
    expect(fillHalf([])).toEqual([]);
  });

  it("holds still for reduced motion; scroll effects only with scroll timelines; transform only", () => {
    const block = css.slice(css.indexOf(".mq { view-timeline-name"), css.indexOf("/* Search inputs"));
    expect(block).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{\s*@supports \(animation-timeline: view\(\)\)/);
    for (const k of block.match(/@keyframes mq-[\s\S]*?\} \}/g) ?? []) expect(k).not.toMatch(/\b(left|top|margin|width|height):/);
    expect(render()).toContain("motion-safe:");
  });

  it("fixed height (no layout shift) and gaps that match the hero above and the section below", () => {
    expect(render()).toContain("h-[calc(64px+9.5vw)] ");
    expect(render()).toContain("md:h-[calc(72px+6.5vw)] xl:h-[calc(80px+4.6vw)]");
    expect(render({ below: "light" })).toContain("to-background");
    expect(render({ below: "dark" })).toContain("to-black");
    expect(marqueeOf(MOCK_HOMEPAGE).below).toBe("light");
    expect(marqueeOf(MOCK_DROP_HOMEPAGE).below).toBe("dark");
  });

  it("right under the hero in both layouts; store links categories, drop links its pieces; Anton-safe words", () => {
    for (const page of [MOCK_HOMEPAGE, MOCK_DROP_HOMEPAGE]) {
      expect(page[1].type).toBe("marquee");
      const m = marqueeOf(page);
      for (const w of [...m.front, ...m.back]) expect(w).toMatch(/^[A-Za-z0-9 '’\-&,.]+$/);
    }
    expect(marqueeOf(MOCK_HOMEPAGE).links).toBe("categories");
    expect(marqueeOf(MOCK_DROP_HOMEPAGE).links).toBe("drop");
  });
});

describe("spotlightLinks / editionLeft — the drop tape matches the page", () => {
  const product = (stock: number[]) => ({ sizes: stock.map((s, i) => ({ label: String(i), stock: s })) }) as unknown as Product;
  const spot = (id: string, title: string, products: Product[]) =>
    ({ block: { id, type: "product_spotlight", title }, products, initial: 0 }) as unknown as ResolvedHomeBlock;

  it("links only spotlights that render (a spotlight without a product is skipped), to their section id", () => {
    expect(spotlightLinks([spot("spotlight-1", "The Hoodie", [product([1])]), spot("spotlight-2", "The Tee", [])])).toEqual([{ label: "The Hoodie", href: "#spotlight-1" }]);
  });

  it("pieces left = real stock; hidden when above the edition size or no products", () => {
    expect(editionLeft([product([3, 2]), product([1, -4])], 100)).toBe(6);
    expect(editionLeft([product([300])], 100)).toBeNull();
    expect(editionLeft([product([300])], null)).toBe(300);
    expect(editionLeft([], 100)).toBeNull();
  });
});
