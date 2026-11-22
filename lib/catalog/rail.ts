import type { Product } from "@/lib/commerce/types";

/**
 * PLP-08 "on the rail" gallery at the top of a collection page.
 * Pure helpers (product pick + 1-D rail physics) so the rules are unit-tested and the
 * client component only renders and wires pointer/keyboard input.
 */

export const RAIL_MAX_ITEMS = 8;
/** Below this the rail looks empty; the page renders no gallery. */
export const RAIL_MIN_ITEMS = 3;

/**
 * Pick the hangers for a collection: in stock only, one colour per style (a rail of the
 * same tee in five colours reads as a bug), most popular first. Input order breaks ties.
 */
export function pickRailProducts(products: readonly Product[], limit = RAIL_MAX_ITEMS): Product[] {
  const seen = new Set<string>();
  const picked: Product[] = [];
  const ranked = products
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.sizes.some((s) => s.stock > 0) && p.images.length > 0)
    .sort((a, b) => b.p.popularity - a.p.popularity || a.i - b.i);
  for (const { p } of ranked) {
    if (seen.has(p.styleId)) continue;
    seen.add(p.styleId);
    picked.push(p);
    if (picked.length >= limit) break;
  }
  return picked;
}

/** One hanger: horizontal offset from its rest slot (px), velocity, swing angle (deg), angular velocity. */
export interface RailBody {
  x: number;
  v: number;
  a: number;
  av: number;
}

export interface RailStep {
  /** Rest slot of each body (px from the rail's left edge), same length as `bodies`. */
  rest: readonly number[];
  /** Closest two hooks may get (px). */
  minGap: number;
  /** Index of the body held by the pointer, or null. */
  dragged: number | null;
  /** Offset the held body should sit at this frame. */
  target: number;
  /** Seconds since the last frame. Clamped for stability. */
  dt: number;
}

const SPRING = 90; // pull back to the rest slot
const DAMP = 14; // ≈0.74 damping ratio: one small overshoot, then still
const PENDULUM = 55; // swing stiffness
const SWING_DAMP = 6.5; // two or three visible swings, still within ~2 s
const COUPLING = 0.045; // deg/s² of swing per px/s² of hook acceleration
const MAX_ANGLE = 18;
const MAX_SPEED = 4000;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Advance the rail one frame (semi-implicit Euler). Mutates `bodies`.
 * Held hanger follows the pointer, the rest spring home, hooks never pass each other
 * (a pushed hanger is shoved along), and each garment swings against its hook's acceleration.
 * Returns false once everything is at rest, so the caller can stop its animation loop.
 */
export function stepRail(bodies: RailBody[], { rest, minGap, dragged, target, dt }: RailStep): boolean {
  const h = clamp(dt, 0, 1 / 30);
  if (h === 0 || bodies.length === 0) return dragged !== null;
  const before = bodies.map((b) => b.v);

  bodies.forEach((b, i) => {
    if (i === dragged) {
      b.v = clamp((target - b.x) / h, -MAX_SPEED, MAX_SPEED);
      b.x = target;
    } else {
      b.v = clamp(b.v + (-SPRING * b.x - DAMP * b.v) * h, -MAX_SPEED, MAX_SPEED);
      b.x += b.v * h;
    }
  });

  // Hooks can't cross. With a held hanger, pushes travel outward from it (the held one never yields);
  // otherwise overlapping pairs split the difference, two passes so a push runs down the rail.
  const overlapAt = (i: number) => minGap - (rest[i + 1] + bodies[i + 1].x - (rest[i] + bodies[i].x));
  if (dragged !== null) {
    for (let i = dragged; i < bodies.length - 1; i++) {
      const overlap = overlapAt(i);
      if (overlap <= 0) continue;
      bodies[i + 1].x += overlap;
      bodies[i + 1].v = Math.max(bodies[i + 1].v, bodies[i].v);
    }
    for (let i = dragged - 1; i >= 0; i--) {
      const overlap = overlapAt(i);
      if (overlap <= 0) continue;
      bodies[i].x -= overlap;
      bodies[i].v = Math.min(bodies[i].v, bodies[i + 1].v);
    }
  } else {
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < bodies.length - 1; i++) {
        const overlap = overlapAt(i);
        if (overlap <= 0) continue;
        const l = bodies[i];
        const r = bodies[i + 1];
        l.x -= overlap / 2;
        r.x += overlap / 2;
        const v = (l.v + r.v) / 2;
        l.v = v;
        r.v = v;
      }
    }
  }

  let moving = dragged !== null;
  bodies.forEach((b, i) => {
    const accel = (b.v - before[i]) / h;
    b.av += (-PENDULUM * b.a - SWING_DAMP * b.av + COUPLING * accel) * h;
    b.a = clamp(b.a + b.av * h, -MAX_ANGLE, MAX_ANGLE);
    const still = Math.abs(b.x) < 0.25 && Math.abs(b.v) < 2 && Math.abs(b.a) < 0.05 && Math.abs(b.av) < 0.5;
    if (still && i !== dragged) {
      b.x = 0;
      b.v = 0;
      b.a = 0;
      b.av = 0;
    } else {
      moving = true;
    }
  });
  return moving;
}
