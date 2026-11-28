import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MOCK_HOMEPAGE } from "@/lib/cms/mock-home";
import type { HomeBlock } from "@/lib/cms/types";
import { MOCK_PRODUCTS } from "@/lib/commerce/mock/data";
import type { Product } from "@/lib/commerce/types";
import { cueOn, LTD_CUES, tallyAt } from "./limited-cues";
import { clawPath, dropTapeWords, LimitedFinale, stampLines } from "./limited-finale";

type Block = Extract<HomeBlock, { type: "limited_edition" }>;
const base = MOCK_HOMEPAGE.find((b): b is Block => b.type === "limited_edition")!;
/** A real demo product with its stock replaced. */
const product = (stock: number[]): Product => ({ ...MOCK_PRODUCTS[0], sizes: stock.map((s, i) => ({ ...MOCK_PRODUCTS[0].sizes[0], label: String(i), stock: s })) });
const render = (b: Partial<Block> = {}, products: Product[] = []) => renderToStaticMarkup(createElement(LimitedFinale, { block: { ...base, ...b }, products }));
const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
const ltdCss = css.slice(css.indexOf("@keyframes ltd-line1"), css.indexOf("/*\n * Hero tapes"));

describe("Limited-edition finale — brand motion (no sparkles)", () => {
  it("no firecracker sparkles; claws, shadow, shock lines, stamp and the drop tape instead", () => {
    const html = render();
    expect(html).not.toContain("burst-spark");
    for (const c of ["ltd-claw", "ltd-shadow", "ltd-shock-l", "ltd-shock-r", "ltd-stamp", "ltd-squash", "ltd-shake", "mq-tape-back"]) expect(html, c).toContain(c);
  });

  it("claw marks: four curved, torn gashes (needle tips, bowed, ragged top edge), same shape on server and client", () => {
    const html = render();
    expect((html.match(/clip-path:polygon\(/g) ?? []).length).toBe(4);
    const p = clawPath(1);
    expect(clawPath(1)).toBe(p);
    expect(p).not.toMatch(/NaN|Infinity/);
    const pts = p.slice(8, -1).split(",").map((s) => s.trim().split(" ").map(parseFloat));
    const top = pts.slice(0, 19);
    expect(top[0]).toEqual([0, 70]); // tip where the claw goes in
    expect(top[18]).toEqual([100, 70]); // tail
    expect(Math.min(...top.map(([, y]) => y))).toBeLessThan(30); // bows upward, not a straight bar
    for (const [x, y] of pts) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(100);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(100);
    }
    expect(clawPath(2)).not.toBe(p); // each gash tears differently
  });

  it("claims come only from the block: no size → no 'Only N', no signature → no 'Signed' / 'Hand-signed'", () => {
    expect(stampLines({ editionSize: 100, signatureImage: null })).toEqual(["Authentic", "Only 100", "Alpha Hood"]);
    expect(stampLines({ editionSize: null, signatureImage: "/api/media/sig.png" })).toEqual(["Authentic", "Limited", "Signed"]);
    const words = (b: Partial<Block>, left: number | null) => dropTapeWords({ editionSize: null, signatureImage: null, ...b }, left).map((w) => w.label);
    expect(words({}, null)).toEqual(["Limited edition", "When it's gone, it's gone"]);
    expect(words({ editionSize: 100, signatureImage: "/api/media/s.png" }, 37)).toEqual(["Limited edition", "37 left", "Only 100 made", "Hand-signed", "When it's gone, it's gone"]);
    expect(render({ signatureImage: null })).not.toContain("signature");
  });

  it("the signature renders only when uploaded, with alt text, inside the write-on wipe", () => {
    const html = render({ signatureImage: "/api/media/sig.png" });
    expect(html).toContain('alt="The ambassador&#x27;s signature"');
    expect(html).toContain("ltd-sign-wipe");
  });

  it("pieces left: the server renders the real stock (sr-only too); the tally lands on it; sold out never counts", () => {
    const html = render({}, [product([20, 17])]);
    expect(html).toContain('<span class="sr-only">37 left</span>');
    expect(html).toMatch(/aria-hidden="true" class="tabular-nums">37 left/);
    expect(render({}, [product([0])])).toContain("Sold out");
    expect(tallyAt(100, 37, 0)).toBe(100);
    expect(tallyAt(100, 37, 1)).toBe(37);
    expect(tallyAt(100, 37, 5)).toBe(37);
    for (let t = 0; t <= 1; t += 0.05) {
      const n = tallyAt(100, 37, t);
      expect(n).toBeGreaterThanOrEqual(37);
      expect(n).toBeLessThanOrEqual(100);
    }
  });

  it("cues: on only once the marker is above the screen; in order land → slam → tally inside the pinned range", () => {
    expect(cueOn(false, -10)).toBe(true);
    expect(cueOn(true, 0)).toBe(false);
    expect(cueOn(false, 900)).toBe(false);
    expect(LTD_CUES.land).toBeLessThan(LTD_CUES.slam);
    expect(LTD_CUES.slam).toBeLessThan(LTD_CUES.tally);
    expect(LTD_CUES.tally).toBeLessThan(160);
  });

  it("motion only with scroll timelines and no reduced motion; waiting states only while cues run; transform/opacity only", () => {
    const gated = css.slice(css.indexOf(".ltd { height: 260vh; }"), css.indexOf("/*\n * Hero tapes"));
    expect(css.slice(css.indexOf(".amb { view-timeline-name"), css.indexOf(".ltd { height: 260vh; }"))).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*@supports \(animation-timeline: view\(\)\)/);
    for (const rule of gated.match(/\.ltd\[data-cues\][^{]*\{[^}]*\}/g) ?? []) expect(rule).toMatch(/\{ (transform|opacity):/);
    expect((gated.match(/\.ltd\[data-cues\]/g) ?? []).length).toBe(4);
    for (const k of ltdCss.match(/@keyframes ltd-[\s\S]*?\n(?=@keyframes|\/\*|\.)/g) ?? []) expect(k).not.toMatch(/\b(left|top|margin|width|height|filter|clip-path):/);
  });
});
