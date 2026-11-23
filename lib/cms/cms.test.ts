import { describe, expect, it } from "vitest";
import { resolveCms } from "./index";
import { MOCK_HOMEPAGE } from "./mock-home";
import { deviceClass, isLive, liveBlocks } from "./schedule";
import type { HomeBlock } from "./types";

const now = new Date("2026-11-22T12:00:00Z");

describe("CMS-02 scheduling", () => {
  it("respects inclusive start and exclusive end", () => {
    expect(isLive({}, now)).toBe(true);
    expect(isLive({ startsAt: "2026-11-22T12:00:00Z" }, now)).toBe(true);
    expect(isLive({ startsAt: "2026-11-22T12:00:01Z" }, now)).toBe(false);
    expect(isLive({ endsAt: "2026-11-22T12:00:00Z" }, now)).toBe(false);
    expect(isLive({ endsAt: "2026-11-23T00:00:00Z" }, now)).toBe(true);
  });

  it("fails closed on invalid dates", () => {
    expect(isLive({ startsAt: "not a date" }, now)).toBe(false);
    expect(isLive({ endsAt: "soon" }, now)).toBe(false);
  });

  it("filters hero slides and drops a hero with no live slide", () => {
    const hero = MOCK_HOMEPAGE.find((b) => b.type === "hero") as Extract<HomeBlock, { type: "hero" }>;
    const expired = { ...hero, slides: hero.slides.map((s) => ({ ...s, endsAt: "2026-01-01T00:00:00Z" })) };
    expect(liveBlocks([expired], now)).toEqual([]);
    const oneLive = { ...hero, slides: [{ ...hero.slides[0], endsAt: "2026-01-01T00:00:00Z" }, hero.slides[1]] };
    const [block] = liveBlocks([oneLive], now) as Extract<HomeBlock, { type: "hero" }>[];
    expect(block.slides.map((s) => s.id)).toEqual([hero.slides[1].id]);
  });

  it("device targeting maps to CSS (cacheable, no UA sniffing)", () => {
    expect(deviceClass(undefined)).toBe("");
    expect(deviceClass(["mobile", "desktop"])).toBe("");
    expect(deviceClass(["mobile"])).toBe("lg:hidden");
    expect(deviceClass(["desktop"])).toBe("hidden lg:block");
  });
});

describe("CMS adapter", () => {
  it("the homepage covers HOME-01…06, 08, 11, 12 in reference order", () => {
    expect(MOCK_HOMEPAGE.map((b) => b.type)).toEqual([
      "hero",
      "category_rail",
      "promo_band",
      "collection_tiles",
      "offer_tiles",
      "product_tabs",
      "shop_the_look",
      "product_grid",
      "campaign_band",
      "club_band",
      "ugc_grid",
      "trust_strip",
      "seo",
    ]);
  });

  it("mascot art (MASCOT_PROMPTS §7) is registered with its size and points at a shipped file", async () => {
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { MASCOT, MASCOT_HERO } = await import("@/lib/brand/mascot");
    for (const m of Object.values(MASCOT)) {
      expect(existsSync(join(process.cwd(), "public", m.src))).toBe(true);
      expect(m.width).toBeGreaterThan(0);
      expect(m.height).toBeGreaterThan(0);
    }
    for (const h of Object.values(MASCOT_HERO)) {
      expect(existsSync(join(process.cwd(), "public", h.desktop))).toBe(true);
      expect(existsSync(join(process.cwd(), "public", h.mobile))).toBe(true);
    }
    const hero = MOCK_HOMEPAGE.find((b) => b.type === "hero");
    expect(hero && hero.type === "hero" && hero.slides.every((s) => s.image && s.image.alt.length > 0)).toBe(true);
  });

  it("demo content is refused in production unless explicitly allowed", async () => {
    expect(resolveCms({ NODE_ENV: "production" }).name).toBe("disabled");
    await expect(resolveCms({ NODE_ENV: "production" }).getHomepage()).rejects.toThrow();
    expect(resolveCms({ NODE_ENV: "production", ALLOW_MOCK_DATA: "true" }).name).toBe("mock");
    expect(() => resolveCms({ CMS_PROVIDER: "wordpress" })).toThrow(/Unknown CMS_PROVIDER/);
  });

  it("footer social links accept only https URLs from config", async () => {
    const footer = await resolveCms({
      SOCIAL_INSTAGRAM_URL: "https://instagram.com/example",
      SOCIAL_X_URL: "javascript:alert(1)",
      SOCIAL_YOUTUBE_URL: "http://youtube.com/x",
    }).getFooter();
    expect(footer.social).toEqual([{ label: "Instagram", href: "https://instagram.com/example" }]);
  });
});
