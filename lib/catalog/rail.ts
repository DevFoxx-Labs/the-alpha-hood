import { isProductPhotoUrl } from "@/lib/catalog/photo-url";
import type { Product, ProductImage } from "@/lib/commerce/types";

/**
 * PLP-08 "on the rail" gallery at the top of a collection page.
 * Pure helpers (product pick, hanger shots, rail geometry + physics) so the rules are unit-tested and the
 * client component only renders and wires pointer/keyboard input.
 */

export const RAIL_MAX_ITEMS = 8;
/** Below this the rail looks empty; the page renders no gallery. */
export const RAIL_MIN_ITEMS = 3;

/** On-hanger cutouts (transparent background, hanger included) for one colour. Back is optional. */
export interface HangerShots {
  side: ProductImage & { url: string };
  front: ProductImage & { url: string };
  back?: ProductImage & { url: string };
}

/**
 * The colour's hanger photos, or null when it has no side + front pair (the rail then draws the
 * placeholder garment on its own hanger). Only our own photo URLs count (`isProductPhotoUrl`).
 */
export function hangerShots(product: Pick<Product, "images">): HangerShots | null {
  const find = (view: "front" | "back" | "side") => {
    const im = product.images.find((i) => i.view === view && isProductPhotoUrl(i.url));
    return im ? (im as ProductImage & { url: string }) : undefined;
  };
  const side = find("side");
  const front = find("front");
  if (!side || !front) return null;
  const back = find("back");
  return back ? { side, front, back } : { side, front };
}

/**
 * Pick the hangers for a collection: in stock only, one colour per style (a rail of the
 * same tee in five colours reads as a bug), most popular first. Within a style, a colour with
 * hanger photos beats one without (it is the one that can turn on the rail). Input order breaks ties.
 */
export function pickRailProducts(products: readonly Product[], limit = RAIL_MAX_ITEMS): Product[] {
  const best = new Map<string, { p: Product; i: number; shots: boolean }>();
  products.forEach((p, i) => {
    if (!p.sizes.some((s) => s.stock > 0) || p.images.length === 0) return;
    const shots = hangerShots(p) !== null;
    const cur = best.get(p.styleId);
    const better = !cur || (shots && !cur.shots) || (shots === cur.shots && p.popularity > cur.p.popularity);
    if (better) best.set(p.styleId, { p, i, shots });
  });
  // A style ranks by its most popular in-stock colour, whichever colour ends up on the hanger.
  const top = new Map<string, number>();
  for (const p of products) {
    if (best.has(p.styleId) && p.sizes.some((s) => s.stock > 0)) top.set(p.styleId, Math.max(top.get(p.styleId) ?? -Infinity, p.popularity));
  }
  return [...best.values()]
    .sort((a, b) => top.get(b.p.styleId)! - top.get(a.p.styleId)! || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.p);
}


/* ---------------------------------------------------------------------------------------------------------------
 * Rail geometry + physics (pure, unit-tested; the component only paints transforms).
 * Every hanger lives in one box of aspect RAIL_ASPECT (the 1000 × 1250 photo canvas), hook tip at RAIL_HOOK_TOP.
 * A garment at rest hangs side-on (turn = RAIL_REST deg) and takes only its side width on the rail; the faced one
 * turns to 0° and its neighbours slide apart to make room (footprints), so nothing ever covers the garment you look at.
 * ------------------------------------------------------------------------------------------------------------- */

/** Width / height of a hanger box (photo canvas 1000 × 1250). */
export const RAIL_ASPECT = 0.8;
/** Hook tip, as a share of the box height from its top (16 px on the 1250 px canvas). */
export const RAIL_HOOK_TOP = 16 / 1250;
/** Turn of a garment hanging side-on (deg). */
export const RAIL_REST = -70;
/** Air between two garments, as a share of the box height. */
const GAP = 0.035;
/** Box height limits (px): rail mode is used while every garment still gets at least RAIL_MIN_H. */
export const RAIL_MAX_H = 300;
export const RAIL_MIN_H = 180;

/** Side-on width per garment, as a share of the box width: a real side photo, or a drawing turned away. */
export const SIDE_WIDTH = { photo: 0.42, drawing: 0.36 } as const;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Width a garment takes on the rail at a given turn: side width at rest, 94% of the box when it faces you. */
export function footprint(h: number, angle: number, sideW: number): number {
  const e = clamp(1 - angle / RAIL_REST, 0, 1);
  const ease = e * e * (3 - 2 * e);
  return h * RAIL_ASPECT * (sideW + (0.94 - sideW) * ease);
}

/** Box height for a stage width, and whether the rail has to become a one-at-a-time carousel (phones). */
export function railLayout(width: number, sideWidths: readonly number[]): { h: number; carousel: boolean } {
  const n = Math.max(1, sideWidths.length);
  const side = sideWidths.reduce((s, w) => s + w, 0) / n;
  const restK = footprint(1, RAIL_REST, side) + GAP;
  const activeK = footprint(1, 0, side) + GAP;
  const fit = (width - 24) / (n * restK + (activeK - restK));
  if (fit < RAIL_MIN_H) return { h: Math.round(clamp(width * 0.62, 200, 280)), carousel: true };
  return { h: Math.round(Math.min(RAIL_MAX_H, fit)), carousel: false };
}

/**
 * Centre x of every hanger. Rail: the row (with the faced garment at full width) centred on the stage.
 * Carousel: the faced garment (default the first) centred, the rest side-on to its left and right.
 */
export function railTargets(h: number, width: number, carousel: boolean, front: number | null, sideWidths: readonly number[]): number[] {
  const feet = sideWidths.map((w, i) => footprint(h, i === front ? 0 : RAIL_REST, w) + h * GAP);
  if (carousel) {
    const c = clamp(front ?? 0, 0, Math.max(0, feet.length - 1));
    const xs = feet.map(() => 0);
    xs[c] = width / 2;
    for (let i = c + 1; i < feet.length; i++) xs[i] = xs[i - 1] + (feet[i - 1] + feet[i]) / 2;
    for (let i = c - 1; i >= 0; i--) xs[i] = xs[i + 1] - (feet[i + 1] + feet[i]) / 2;
    return xs;
  }
  let cursor = (width - feet.reduce((s, f) => s + f, 0)) / 2;
  return feet.map((f) => {
    const x = cursor + f / 2;
    cursor += f;
    return x;
  });
}

/** Lambert-ish light on a turning garment: 1 = full light facing you, ~0.7 side-on. */
export function railLight(angle: number): number {
  const r = (angle * Math.PI) / 180;
  return 0.66 + 0.34 * Math.max(0, Math.sin(r) * 0.42 + Math.cos(r) * 0.91);
}

/** Physics state, one entry per hanger: position, turn, swing (deg, around the hook) and hang-tag swing. */
export interface RailSim {
  x: number[];
  vx: number[];
  tx: number[];
  turn: number[];
  vturn: number[];
  tturn: number[];
  swing: number[];
  vswing: number[];
  tag: number[];
  vtag: number[];
  /** Index held by the pointer, or -1. */
  drag: number;
  /** Until this time (ms) released garments coast instead of springing home. */
  free: number;
}

export function createRailSim(): RailSim {
  return { x: [], vx: [], tx: [], turn: [], vturn: [], tturn: [], swing: [], vswing: [], tag: [], vtag: [], drag: -1, free: 0 };
}

/** Sets targets (slot + turn); `snap` jumps there at once (first paint, reduced motion, resize). */
export function aimRail(s: RailSim, targets: readonly number[], front: number | null, snap: boolean) {
  targets.forEach((tx, i) => {
    s.tx[i] = tx;
    s.tturn[i] = i === front ? 0 : RAIL_REST;
    if (snap || s.x[i] === undefined) {
      s.x[i] = tx;
      s.vx[i] = 0;
      s.turn[i] = s.tturn[i];
      s.vturn[i] = 0;
      s.swing[i] ??= 0;
      s.vswing[i] ??= 0;
      s.tag[i] = 0;
      s.vtag[i] = 0;
    }
  });
  for (const k of ["x", "vx", "tx", "turn", "vturn", "tturn", "swing", "vswing", "tag", "vtag"] as const) s[k].length = targets.length;
}

export interface RailStepOptions {
  /** Seconds since the last frame (clamped for stability). */
  dt: number;
  /** Current time, ms (same clock as `free`). */
  now: number;
  h: number;
  width: number;
  carousel: boolean;
  sideWidths: readonly number[];
}

/**
 * One frame (two semi-implicit Euler sub-steps). Mutates `s`; returns false once everything is still, so the
 * caller can stop its animation loop. Garments spring to their slots and turns, never overlap (a pushed garment
 * is shoved along; the held one never yields), swing against their hook's acceleration, and tags lag the swing.
 */
export function stepRailSim(s: RailSim, { dt, now, h, width, carousel, sideWidths }: RailStepOptions): boolean {
  const n = s.x.length;
  const step = clamp(dt, 0, 1 / 30) / 2;
  if (n === 0 || step === 0) return s.drag >= 0;
  const restoring = now > s.free;
  for (let k = 0; k < 2; k++) {
    for (let i = 0; i < n; i++) {
      const before = s.vx[i];
      if (i !== s.drag) {
        const stiff = restoring ? 130 : 0;
        const damp = restoring ? 2 * Math.sqrt(130) * 0.86 : 3.2;
        s.vx[i] = before + (-stiff * (s.x[i] - s.tx[i]) - damp * before) * step;
        s.x[i] += s.vx[i] * step;
      }
      const accel = (s.vx[i] - before) / step;
      s.vturn[i] += (-150 * (s.turn[i] - s.tturn[i]) - 2 * Math.sqrt(150) * 0.78 * s.vturn[i]) * step;
      s.turn[i] += s.vturn[i] * step;
      s.vswing[i] += (-24 * s.swing[i] - 2.1 * s.vswing[i] - clamp(accel, -6000, 6000) * 0.0045) * step;
      s.swing[i] = clamp(s.swing[i] + s.vswing[i] * step, -12, 12);
      s.vtag[i] += (-46 * (s.tag[i] - s.swing[i] * 0.6) - 3.4 * s.vtag[i] - s.vswing[i] * 0.9) * step;
      s.tag[i] = clamp(s.tag[i] + s.vtag[i] * step, -30, 30);
    }
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < n - 1; i++) {
        const gap = (footprint(h, s.turn[i], sideWidths[i]) + footprint(h, s.turn[i + 1], sideWidths[i + 1])) / 2 + h * 0.012;
        const overlap = gap - (s.x[i + 1] - s.x[i]);
        if (overlap <= 0) continue;
        if (i === s.drag) s.x[i + 1] += overlap;
        else if (i + 1 === s.drag) s.x[i] -= overlap;
        else {
          s.x[i] -= overlap / 2;
          s.x[i + 1] += overlap / 2;
        }
        if (s.vx[i] > s.vx[i + 1]) {
          const shared = (s.vx[i] + s.vx[i + 1]) / 2;
          if (i !== s.drag) s.vx[i] = shared;
          if (i + 1 !== s.drag) s.vx[i + 1] = shared;
        }
      }
    }
    if (!carousel) {
      const edge = h * 0.06;
      const first = edge + footprint(h, s.turn[0], sideWidths[0]) / 2;
      const last = width - edge - footprint(h, s.turn[n - 1], sideWidths[n - 1]) / 2;
      if (s.x[0] < first) {
        s.x[0] = first;
        s.vx[0] = Math.abs(s.vx[0]) * 0.3;
      }
      if (s.x[n - 1] > last) {
        s.x[n - 1] = last;
        s.vx[n - 1] = -Math.abs(s.vx[n - 1]) * 0.3;
      }
    }
  }
  let busy = s.drag >= 0 || !restoring;
  for (let i = 0; i < n; i++) {
    const moving =
      Math.abs(s.vx[i]) > 0.4 ||
      (restoring && Math.abs(s.x[i] - s.tx[i]) > 0.25) ||
      Math.abs(s.turn[i] - s.tturn[i]) > 0.05 ||
      Math.abs(s.vturn[i]) > 0.05 ||
      Math.abs(s.swing[i]) > 0.02 ||
      Math.abs(s.vswing[i]) > 0.05 ||
      Math.abs(s.tag[i]) > 0.05 ||
      Math.abs(s.vtag[i]) > 0.08;
    if (moving) busy = true;
  }
  if (!busy) {
    for (let i = 0; i < n; i++) {
      s.x[i] = s.tx[i];
      s.vx[i] = 0;
      s.turn[i] = s.tturn[i];
      s.vturn[i] = 0;
      s.swing[i] = 0;
      s.vswing[i] = 0;
      s.tag[i] = 0;
      s.vtag[i] = 0;
    }
  }
  return busy;
}
