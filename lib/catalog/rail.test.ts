import { describe, expect, it } from "vitest";
import { MOCK_PRODUCTS } from "@/lib/commerce/mock/data";
import { aimRail, createRailSim, footprint, hangerShots, pickRailProducts, RAIL_ASPECT, RAIL_MAX_H, RAIL_MAX_ITEMS, RAIL_MIN_H, RAIL_REST, type RailSim, railLayout, railLight, railTargets, SIDE_WIDTH, stepRailSim } from "./rail";

const inStock = (p: (typeof MOCK_PRODUCTS)[number]) => p.sizes.some((s) => s.stock > 0);

describe("PLP-08 pickRailProducts", () => {
  it("caps the rail, skips sold-out and repeats of the same style", () => {
    const picked = pickRailProducts(MOCK_PRODUCTS);
    expect(picked.length).toBe(RAIL_MAX_ITEMS);
    expect(picked.every(inStock)).toBe(true);
    expect(new Set(picked.map((p) => p.styleId)).size).toBe(picked.length);
  });

  it("orders styles by popularity, most popular first", () => {
    const topOf = (styleId: string) => Math.max(...MOCK_PRODUCTS.filter((p) => p.styleId === styleId && inStock(p)).map((p) => p.popularity));
    const pops = pickRailProducts(MOCK_PRODUCTS).map((p) => topOf(p.styleId));
    expect([...pops].sort((a, b) => b - a)).toEqual(pops);
  });

  it("hangs the colour that has hanger photos, even when another colour is more popular", () => {
    const hoodies = MOCK_PRODUCTS.filter((p) => p.category === "hoodies");
    const picked = pickRailProducts(hoodies);
    const withShots = picked.filter((p) => hangerShots(p));
    expect(withShots.map((p) => p.handle)).toEqual(["heavyweight-oversized-hoodie-black"]);
    // Still one hanger per style.
    expect(new Set(picked.map((p) => p.styleId)).size).toBe(picked.length);
  });
});

describe("PLP-08 hangerShots + pick edge cases", () => {
  const url = (c: string) => `/api/media/med_${c.repeat(32)}`;
  const img = (view: "front" | "back" | "side" | "detail", u?: string) => ({ view, url: u, alt: view, art: "hoodie" as const, colour: "#999999" });

  it("needs a side and a front photo; back is optional", () => {
    expect(hangerShots({ images: [img("front", url("a")), img("side", url("b"))] })).toMatchObject({ front: { url: url("a") }, side: { url: url("b") } });
    expect(hangerShots({ images: [img("front", url("a")), img("back", url("c")), img("side", url("b"))] })?.back?.url).toBe(url("c"));
    expect(hangerShots({ images: [img("front", url("a")), img("back", url("c"))] })).toBeNull();
    // Drawings (no url) never count as hanger shots.
    expect(hangerShots({ images: [img("front"), img("side")] })).toBeNull();
  });

  it("ignores photo URLs that aren't ours (remote, traversal, other paths)", () => {
    for (const bad of ["https://evil.example/a.webp", "/demo/products/../../secret.webp", "/api/media/med_x", "//evil.example/x.png", "/demo/products/a.svg"]) {
      expect(hangerShots({ images: [img("front", bad), img("side", url("b"))] }), bad).toBeNull();
    }
  });

  it("returns nothing when every product is sold out", () => {
    const allOut = MOCK_PRODUCTS.slice(0, 5).map((p) => ({ ...p, sizes: p.sizes.map((s) => ({ ...s, stock: 0 })) }));
    expect(pickRailProducts(allOut)).toEqual([]);
  });

  it("does not mutate the input order", () => {
    const input = MOCK_PRODUCTS.slice(0, 10);
    const ids = input.map((p) => p.id);
    pickRailProducts(input, 4);
    expect(input.map((p) => p.id)).toEqual(ids);
  });
});

describe("PLP-08 pick prefers a photographed colour", () => {
  it("hangs the colour with hanger photos even when another colour of the style is more popular", () => {
    const style = MOCK_PRODUCTS.filter((p) => p.styleId === MOCK_PRODUCTS[0].styleId);
    const plain = style.map((p) => ({ ...p, images: p.images.filter((i) => !i.url) }));
    const shots = ["front", "side"].map((view) => ({ url: `/demo/products/x-${view}.webp`, view: view as "front" | "side", alt: view, art: "tee" as const, colour: "#000000" }));
    const leastPopular = [...plain].sort((a, b) => a.popularity - b.popularity)[0];
    const input = plain.map((p) => (p.id === leastPopular.id ? { ...p, images: shots } : p));
    expect(pickRailProducts(input).map((p) => p.id)).toEqual([leastPopular.id]);
  });
});

describe("PLP-08 rail geometry", () => {
  const sides = Array.from({ length: 8 }, (_, i) => (i === 1 ? SIDE_WIDTH.photo : SIDE_WIDTH.drawing));

  it("a faced garment takes far more room than a side-on one", () => {
    expect(footprint(300, 0, 0.4)).toBeCloseTo(300 * RAIL_ASPECT * 0.94);
    expect(footprint(300, RAIL_REST, 0.4)).toBeCloseTo(300 * RAIL_ASPECT * 0.4);
  });

  it("desktop gets a rail, phones a carousel, and the row always fits the stage", () => {
    const desk = railLayout(1360, sides);
    expect(desk).toEqual({ h: RAIL_MAX_H, carousel: false });
    expect(railLayout(370, sides).carousel).toBe(true);
    for (const width of [640, 768, 1024, 1360]) {
      const { h, carousel } = railLayout(width, sides);
      if (carousel) continue;
      expect(h).toBeGreaterThanOrEqual(RAIL_MIN_H);
      for (const front of [null, 0, 3, 7]) {
        const xs = railTargets(h, width, false, front, sides);
        const half = (i: number) => footprint(h, i === front ? 0 : RAIL_REST, sides[i]) / 2;
        expect(xs[0] - half(0)).toBeGreaterThanOrEqual(0);
        expect(xs[7] + half(7)).toBeLessThanOrEqual(width);
      }
    }
  });

  it("carousel centres the faced garment", () => {
    const xs = railTargets(220, 370, true, 3, sides);
    expect(xs[3]).toBe(185);
    expect(xs[2]).toBeLessThan(xs[3]);
    expect(xs[4]).toBeGreaterThan(xs[3]);
  });

  it("light is full facing you and dimmer side-on", () => {
    expect(railLight(0)).toBeCloseTo(0.66 + 0.34 * 0.91);
    expect(railLight(RAIL_REST)).toBeLessThan(railLight(0));
  });
});

describe("PLP-08 rail physics", () => {
  const sides = [0.4, 0.4, 0.4, 0.4];
  const h = 200;
  const width = 900;
  const setup = (front: number | null = null) => {
    const s = createRailSim();
    aimRail(s, railTargets(h, width, false, null, sides), null, true);
    aimRail(s, railTargets(h, width, false, front, sides), front, false);
    return s;
  };
  const run = (s: RailSim, frames: number, now = 10_000) => {
    let busy = true;
    for (let f = 0; f < frames; f++) busy = stepRailSim(s, { dt: 1 / 60, now: now + f * 16, h, width, carousel: false, sideWidths: sides });
    return busy;
  };
  const noOverlap = (s: RailSim) => {
    for (let i = 0; i < s.x.length - 1; i++) {
      const gap = (footprint(h, s.turn[i], sides[i]) + footprint(h, s.turn[i + 1], sides[i + 1])) / 2;
      expect(s.x[i + 1] - s.x[i]).toBeGreaterThanOrEqual(gap - 0.5); // half a pixel; the solver keeps 1.2% of h as air on top
    }
  };

  it("is still with no input", () => {
    const s = setup();
    expect(run(s, 1)).toBe(false);
  });

  it("facing one garment turns it to 0°, neighbours make room, and everything settles", () => {
    const s = setup(1);
    for (let f = 0; f < 600 && run(s, 1); f++) noOverlap(s);
    expect(s.turn[1]).toBe(0);
    expect(s.turn[0]).toBe(RAIL_REST);
    expect(s.x).toEqual(s.tx);
  });

  it("dragging a garment into its neighbour shoves it along; the held one never yields", () => {
    const s = setup();
    s.drag = 0;
    s.free = 1e12;
    for (let f = 1; f <= 30; f++) {
      s.x[0] = s.tx[0] + f * 8;
      run(s, 1);
      noOverlap(s);
    }
    expect(s.x[0]).toBe(s.tx[0] + 240);
    expect(s.x[1]).toBeGreaterThan(s.tx[1]);
  });

  it("a moving hook makes the garment swing, within the limit, and the tag lags it", () => {
    const s = setup();
    s.vswing[2] = 60;
    let maxSwing = 0;
    let maxTag = 0;
    for (let f = 0; f < 60; f++) {
      run(s, 1);
      maxSwing = Math.max(maxSwing, Math.abs(s.swing[2]));
      maxTag = Math.max(maxTag, Math.abs(s.tag[2]));
    }
    expect(maxSwing).toBeGreaterThan(1);
    expect(maxSwing).toBeLessThanOrEqual(12);
    expect(maxTag).toBeGreaterThan(0);
  });

  it("survives a huge frame gap (tab was in the background)", () => {
    const s = setup(2);
    stepRailSim(s, { dt: 5, now: 10_000, h, width, carousel: false, sideWidths: sides });
    for (const x of s.x) expect(Number.isFinite(x)).toBe(true);
  });
});
