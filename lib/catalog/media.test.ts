import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { cleanSignaturePixels, fitSize, SIGNATURE_BOX } from "@/components/admin/upload-media";
import { progressPhase } from "@/components/admin/upload-progress";
import { MEDIA_MAX_PX, MediaError, parseMediaKind, prepareProductPhoto } from "./media";

/** A real (blank) RGBA PNG of the given size. */
function png(w: number, h: number): Uint8Array {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let x = -1;
    for (const v of b) x = table[(x ^ v) & 255] ^ (x >>> 8);
    return (x ^ -1) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}

const reason = (f: () => unknown) => {
  try {
    f();
    return "ok";
  } catch (e) {
    return e instanceof MediaError ? e.code : String(e);
  }
};

describe("admin media upload kinds (photo vs signature)", () => {
  it("photo keeps the 600 px minimum; a signature of any size from 16 px is accepted", () => {
    expect(reason(() => prepareProductPhoto(png(800, 200), "s"))).toBe("bad_dimensions");
    expect(reason(() => prepareProductPhoto(png(800, 200), "s", new Date(), "signature"))).toBe("ok");
    expect(reason(() => prepareProductPhoto(png(120, 40), "s", new Date(), "signature"))).toBe("ok");
    expect(prepareProductPhoto(png(640, 640), "s").width).toBe(640);
  });

  it("signature limits still hold: not under 16 px, not over the 6000 px ceiling (decompression bombs), real image only", () => {
    expect(reason(() => prepareProductPhoto(png(15, 200), "s", new Date(), "signature"))).toBe("bad_dimensions");
    expect(reason(() => prepareProductPhoto(png(MEDIA_MAX_PX + 1, 20), "s", new Date(), "signature"))).toBe("bad_dimensions");
    expect(reason(() => prepareProductPhoto(new TextEncoder().encode("<svg onload=alert(1)>"), "s", new Date(), "signature"))).toBe("bad_type");
    expect(() => prepareProductPhoto(png(10, 10), "s", new Date(), "signature")).toThrow(/Signatures must be 16–6000 px/);
  });

  it("kind query: missing = photo, known kinds only, anything else refused", () => {
    expect(parseMediaKind(null)).toBe("photo");
    expect(parseMediaKind("")).toBe("photo");
    expect(parseMediaKind("signature")).toBe("signature");
    for (const bad of ["SIGNATURE", "logo", "photo ", "../x"]) expect(parseMediaKind(bad), bad).toBeNull();
  });
});

describe("signature auto-fit (pixel step)", () => {
  /** w×h white paper with a dark block of ink at (x, y, iw, ih). */
  const paper = (w: number, h: number, ink?: [number, number, number, number]) => {
    const px = new Uint8ClampedArray(w * h * 4).fill(255);
    if (ink) {
      const [x0, y0, iw, ih] = ink;
      for (let y = y0; y < y0 + ih; y++) for (let x = x0; x < x0 + iw; x++) px.set([20, 20, 30, 255], (y * w + x) * 4);
    }
    return px;
  };

  it("white paper turns transparent, ink stays solid, the crop hugs the ink with a small margin", () => {
    const px = paper(400, 300, [100, 120, 200, 40]);
    const crop = cleanSignaturePixels(px, 400, 300)!;
    expect(px[3]).toBe(0);
    expect(px[(130 * 400 + 150) * 4 + 3]).toBe(255);
    expect(crop.x).toBeLessThan(100);
    expect(crop.x).toBeGreaterThan(85);
    expect(crop.x + crop.w).toBeGreaterThan(300);
    expect(crop.x + crop.w).toBeLessThan(315);
    expect(crop.y).toBeLessThan(120);
    expect(crop.y + crop.h).toBeGreaterThan(160);
  });

  it("a blank image has no signature; an already-transparent PNG keeps its transparency", () => {
    expect(cleanSignaturePixels(paper(50, 50), 50, 50)).toBeNull();
    const px = new Uint8ClampedArray(10 * 10 * 4); // transparent black
    expect(cleanSignaturePixels(px, 10, 10)).toBeNull();
  });

  it("scales down to the signature box, never up, and never below the server's 16 px minimum", () => {
    expect(fitSize(4000, 1000)).toEqual({ width: SIGNATURE_BOX.width, height: SIGNATURE_BOX.height });
    expect(fitSize(300, 80)).toEqual({ width: 300, height: 80 });
    expect(fitSize(3000, 300).width).toBe(SIGNATURE_BOX.width);
    expect(fitSize(5000, 10).height).toBe(16);
  });

  it("progress: below 100 % shows the %, at 100 % the server is processing", () => {
    expect(progressPhase(42)).toEqual({ step: "sending", pct: 42, label: undefined });
    expect(progressPhase(100).step).toBe("processing");
  });
});
