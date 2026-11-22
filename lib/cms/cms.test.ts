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
      "product_grid",
      "trust_strip",
      "seo",
    ]);
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
