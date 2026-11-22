import type { Device, HeroSlide, HomeBlock, Targeting } from "./types";

/** CMS-02: is this block/slide live at `now`? Invalid dates fail closed (not shown). */
export function isLive(t: Targeting, now: Date): boolean {
  const ms = now.getTime();
  if (t.startsAt !== undefined) {
    const start = Date.parse(t.startsAt);
    if (Number.isNaN(start) || ms < start) return false;
  }
  if (t.endsAt !== undefined) {
    const end = Date.parse(t.endsAt);
    if (Number.isNaN(end) || ms >= end) return false;
  }
  return true;
}

/** Live blocks only; hero slides filtered too, and a hero with no live slide is dropped. */
export function liveBlocks(blocks: HomeBlock[], now: Date): HomeBlock[] {
  const out: HomeBlock[] = [];
  for (const block of blocks) {
    if (!isLive(block, now)) continue;
    if (block.type === "hero") {
      const slides: HeroSlide[] = block.slides.filter((s) => isLive(s, now));
      if (slides.length === 0) continue;
      out.push({ ...block, slides });
      continue;
    }
    out.push(block);
  }
  return out;
}

/**
 * Device targeting is done with CSS (no user-agent sniffing), so the page stays cacheable and the same
 * HTML serves every device. Returns the classes that hide a block on the other device.
 */
export function deviceClass(devices: Device[] | undefined): string {
  if (!devices || devices.length === 0 || devices.length === 2) return "";
  // Literal class names so Tailwind generates them.
  return devices[0] === "mobile" ? "lg:hidden" : "hidden lg:block";
}
