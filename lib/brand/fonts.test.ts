import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatINR } from "@/lib/format";

/**
 * Guards for the self-hosted Inter faces (app/layout.tsx, scripts/build-fonts.py). Web-performance rule:
 * one stray character must not pull an 83 KB font file onto every page.
 */
const root = process.cwd();
const layout = readFileSync(join(root, "app/layout.tsx"), "utf8");

type Face = { src: string; ranges: [number, number][]; preload: boolean };

function parseRanges(value: string): [number, number][] {
  return value.split(",").map((part) => {
    const [a, b] = part.trim().replace(/^U\+/i, "").split("-");
    return [parseInt(a, 16), parseInt(b ?? a, 16)];
  });
}

const faces: Face[] = [...layout.matchAll(/localFont\(\{([\s\S]*?)\n\}\);/g)].map(([, body]) => ({
  src: body.match(/src: "([^"]+)"/)![1],
  ranges: parseRanges(body.match(/prop: "unicode-range", value: "([^"]+)"/)![1]),
  preload: !/preload: false/.test(body),
}));

const covers = (face: Face, cp: number) => face.ranges.some(([a, b]) => cp >= a && cp <= b);
const facesFor = (ch: string) => faces.filter((f) => covers(f, ch.codePointAt(0)!));

// Google's Inter ranges that next/font/google used before (latin, latin-ext, vietnamese).
const GOOGLE = parseRanges(
  "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD," +
    "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF," +
    "U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+1EA0-1EF9",
);

describe("self-hosted Inter faces", () => {
  it("declares the four faces, and only the latin face is preloaded", () => {
    expect(faces.map((f) => f.src)).toEqual([
      "../assets/fonts/inter-latin.woff2",
      "../assets/fonts/inter-rupee.woff2",
      "../assets/fonts/inter-latin-ext.woff2",
      "../assets/fonts/inter-vietnamese.woff2",
    ]);
    expect(faces.filter((f) => f.preload).map((f) => f.src)).toEqual(["../assets/fonts/inter-latin.woff2"]);
    for (const f of faces) expect(existsSync(join(root, "app", f.src)), f.src).toBe(true);
  });

  it("₹ comes only from the 1–2 KB rupee file, never from the 83 KB latin-ext file", () => {
    expect(facesFor("₹").map((f) => f.src)).toEqual(["../assets/fonts/inter-rupee.woff2"]);
    expect(statSync(join(root, "assets/fonts/inter-rupee.woff2")).size).toBeLessThan(4096);
  });

  it("a formatted price needs only the latin and rupee files", () => {
    for (const ch of new Set(formatINR(129_900_00) + formatINR(-49_900))) {
      expect(facesFor(ch).map((f) => f.src)).not.toContain("../assets/fonts/inter-latin-ext.woff2");
      expect(facesFor(ch).length, `U+${ch.codePointAt(0)!.toString(16)}`).toBeGreaterThan(0);
    }
  });

  it("covers every code point Google's latin, latin-ext and vietnamese faces covered", () => {
    for (const [a, b] of GOOGLE) for (let cp = a; cp <= b; cp++) {
      expect(faces.some((f) => covers(f, cp)), `U+${cp.toString(16)}`).toBe(true);
    }
  });
});
