import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OutlineMarquee, type OutlineMarqueeProps } from "./outline-marquee";

const render = (props: OutlineMarqueeProps = {}) => renderToStaticMarkup(createElement(OutlineMarquee, props));
const rows = (html: string) => [...html.matchAll(/<div class="olm-row"([^>]*)>/g)].map((m) => m[1]);
const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

describe("OutlineMarquee — brand-video outline-text background", () => {
  it("is decorative: hidden from screen readers, and the repeated word is not in the page text", () => {
    const html = render();
    expect(html).toMatch(/^<div[^>]*aria-hidden="true"/);
    expect(html).toContain('data-text="ALPHA HOOD"');
    expect(html.replace(/<[^>]+>/g, "")).toBe(""); // drawn from CSS content: attr(data-text)
  });

  it("4 rows by default, alternating direction, two identical halves per row (seamless -50% loop)", () => {
    const html = render();
    const r = rows(html);
    expect(r).toHaveLength(4);
    expect(r.map((a) => a.match(/data-dir="(\w+)"/)![1])).toEqual(["left", "right", "left", "right"]);
    expect(html.match(/<span data-text=/g)).toHaveLength(4 * 12);
  });

  it("rows run at different speeds, scaled by the speed prop", () => {
    const durs = (html: string) => rows(html).map((a) => Number(a.match(/--olm-dur:([\d.]+)s/)![1]));
    const normal = durs(render());
    expect(new Set(normal).size).toBe(4);
    expect(durs(render({ speed: 2 }))).toEqual(normal.map((d) => d / 2));
  });

  it("only the chosen row is the accent; none by default", () => {
    expect(rows(render()).some((a) => a.includes("data-accent"))).toBe(false);
    expect(rows(render({ accentRow: 1 })).map((a) => a.includes("data-accent"))).toEqual([false, true, false, false]);
  });

  it("clamps rows, speed and opacity; sets theme, opacity and grain", () => {
    expect(rows(render({ rows: 50 }))).toHaveLength(8);
    expect(rows(render({ rows: 0 }))).toHaveLength(1);
    expect(render({ opacity: 3 })).toContain("--olm-op:1");
    expect(rows(render({ speed: 0 }))[0]).toMatch(/--olm-dur:600\.0s/);
    const light = render({ theme: "light", grain: false, text: "ALPHA CLUB" });
    expect(light).toContain('data-theme="light"');
    expect(light).not.toContain("data-grain");
    expect(light).toContain('data-text="ALPHA CLUB"');
  });

  it("CSS: transform-only motion, off under reduced motion, paused off-screen", () => {
    const block = css.slice(css.indexOf(".olm {"));
    expect(block).toMatch(/@media \(prefers-reduced-motion: no-preference\)\s*\{\s*\.olm-row \{[^}]*animation: olm-left/);
    expect(block).toMatch(/\.olm\[data-paused\] \.olm-row \{\s*animation-play-state: paused/);
    const frames = block.slice(block.indexOf("@keyframes olm-left"));
    expect(frames).not.toMatch(/\b(left|margin|width):/);
    expect(block).toMatch(/pointer-events: none/);
  });
});
