import { describe, expect, it } from "vitest";
import { MOCK_PRODUCTS } from "@/lib/commerce/mock/data";
import { pickRailProducts, RAIL_MAX_ITEMS, type RailBody, stepRail } from "./rail";

const body = (x = 0): RailBody => ({ x, v: 0, a: 0, av: 0 });
const inStock = (p: (typeof MOCK_PRODUCTS)[number]) => p.sizes.some((s) => s.stock > 0);

describe("PLP-08 pickRailProducts", () => {
  it("caps the rail, skips sold-out and repeats of the same style", () => {
    const picked = pickRailProducts(MOCK_PRODUCTS);
    expect(picked.length).toBe(RAIL_MAX_ITEMS);
    expect(picked.every(inStock)).toBe(true);
    expect(new Set(picked.map((p) => p.styleId)).size).toBe(picked.length);
  });

  it("orders by popularity, most popular first", () => {
    const pops = pickRailProducts(MOCK_PRODUCTS).map((p) => p.popularity);
    expect([...pops].sort((a, b) => b - a)).toEqual(pops);
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

describe("PLP-08 stepRail physics", () => {
  const rest = [0, 60, 120];
  const run = (bodies: RailBody[], frames: number, dragged: number | null = null, target = 0) => {
    let moving = true;
    for (let f = 0; f < frames; f++) moving = stepRail(bodies, { rest, minGap: 20, dragged, target, dt: 1 / 60 });
    return moving;
  };

  it("is at rest with no input", () => {
    expect(stepRail([body(), body(), body()], { rest, minGap: 20, dragged: null, target: 0, dt: 1 / 60 })).toBe(false);
  });

  it("a released hanger springs home and settles", () => {
    const bodies = [body(), body(40), body()];
    expect(run(bodies, 1)).toBe(true);
    expect(run(bodies, 600)).toBe(false);
    for (const b of bodies) expect(b).toEqual({ x: 0, v: 0, a: 0, av: 0 });
  });

  it("dragging one hanger into its neighbour pushes the neighbour along (hooks never cross)", () => {
    const bodies = [body(), body(), body()];
    run(bodies, 30, 0, 110); // drag the first hook almost onto the second's slot
    const pos = bodies.map((b, i) => rest[i] + b.x);
    expect(pos[0]).toBe(110);
    expect(pos[1] - pos[0]).toBeGreaterThanOrEqual(20 - 1e-9);
    expect(pos[2] - pos[1]).toBeGreaterThanOrEqual(20 - 1e-9);
  });

  it("moving a hook makes its garment swing, within the angle limit", () => {
    const bodies = [body(), body(), body()];
    let maxSwing = 0;
    for (let f = 1; f <= 12; f++) run(bodies, 1, 1, f * 4); // a 48 px drag over 0.2 s
    for (let f = 0; f < 60; f++) {
      run(bodies, 1, null); // let go
      maxSwing = Math.max(maxSwing, Math.abs(bodies[1].a));
    }
    expect(maxSwing).toBeGreaterThan(1);
    run(bodies, 2, 1, -400); // violent yank
    for (const b of bodies) expect(Math.abs(b.a)).toBeLessThanOrEqual(18);
  });

  it("survives a huge frame gap (tab was in the background)", () => {
    const bodies = [body(), body(50), body()];
    stepRail(bodies, { rest, minGap: 20, dragged: null, target: 0, dt: 5 });
    for (const b of bodies) expect(Number.isFinite(b.x) && Math.abs(b.x) < 100).toBe(true);
  });
});
