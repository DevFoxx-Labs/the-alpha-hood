import type { CSSProperties } from "react";

/**
 * Firecracker-style celebration burst (from the GymYardHQ kit): a flash at one point, then stars and dots fly out
 * along their own angle and fade, every 1.6 s. Upper arc only. Decorative; still under reduced motion (globals.css).
 */
type Spark = { rot: number; dist: number; s: number; tone: string; shape: "star" | "dot"; lag?: number };
const TONES = ["var(--color-volt)", "#ffffff", "#ffd54a"];
const SPARKS: Spark[] = [
  ...[-120, -84, -48, -14, 18, 52, 88, 120].map((rot, i) => ({ rot, dist: 62 + (i % 3) * 8, s: 13 + (i % 2) * 4, tone: TONES[i % 3], shape: "star" as const })),
  ...[-102, -66, -32, 2, 34, 70, 104].map((rot, i) => ({ rot, dist: 92 + (i % 2) * 12, s: 6 + (i % 2) * 2, tone: TONES[(i + 1) % 3], shape: "dot" as const, lag: 60 })),
];

export function CelebrationSparkles({ scale = 1, top = "22%" }: { scale?: number; top?: string }) {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute left-1/2 z-10 h-0 w-0" style={{ top, transform: scale === 1 ? undefined : `scale(${scale})` }}>
      <span className="burst-flash absolute left-0 top-0 h-16 w-16 rounded-full" />
      {SPARKS.map((p, i) => (
        <span
          key={i}
          className="burst-spark absolute left-0 top-0"
          style={{ width: p.s, height: p.s, "--rot": `${p.rot}deg`, "--dist": `${p.dist}px`, "--lag": `${p.lag ?? 0}ms`, filter: `drop-shadow(0 0 4px ${p.tone})` } as CSSProperties}
        >
          <span className={`block h-full w-full ${p.shape === "dot" ? "rounded-full" : "sparkle-star"}`} style={{ background: p.tone }} />
        </span>
      ))}
    </span>
  );
}
