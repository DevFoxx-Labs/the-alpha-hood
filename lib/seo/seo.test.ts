import { describe, expect, it, vi } from "vitest";
import { GET as feedGET } from "@/app/feeds/products.xml/route";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { POST as rumPOST } from "@/app/api/rum/route";
import { commerce } from "@/lib/commerce";
import { STORE_CONFIG } from "@/lib/config/store";
import { CONTENT_SLUGS, renderContentPage } from "@/lib/content/pages";
import { feedItems, merchantFeedXml, xml } from "@/lib/feeds/merchant";
import { formatINR } from "@/lib/format";
import { resetRumForTests, routeTemplate, rumSummary } from "@/lib/rum/store";
import { indexingAllowed } from "./indexing";
import { breadcrumbJsonLd, siteJsonLd, toJsonLd } from "./json-ld";
import { nextRedirects, REDIRECTS, redirectProblems } from "./redirects";
import { readSiteUrl } from "./site";

// "use cache" loaders run uncached in unit tests (cacheLife needs the Next.js runtime).
vi.mock("next/cache", () => ({ cacheLife: () => undefined, cacheTag: () => undefined }));

const ORIGIN = "http://localhost:3000";
const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN, "Sec-Fetch-Site": "same-origin", "x-forwarded-for": "203.0.113.9", ...headers },
    body: JSON.stringify(body),
  });

describe("CMS-03 site URL + indexing (fail closed)", () => {
  it("accepts only a bare https origin", () => {
    expect(readSiteUrl({ SITE_URL: "https://www.example.in" })).toBe("https://www.example.in");
    expect(readSiteUrl({ SITE_URL: "https://www.example.in/" })).toBe("https://www.example.in");
    for (const bad of ["http://example.in", "https://example.in/shop", "javascript:alert(1)", "https://user@example.in", "example.in", ""]) {
      expect(readSiteUrl({ SITE_URL: bad })).toBe(ORIGIN);
    }
  });

  it("nothing is indexable unless production + real SITE_URL + no demo data + ALLOW_INDEXING=true", () => {
    const live = { NODE_ENV: "production", SITE_URL: "https://www.example.in", ALLOW_INDEXING: "true" };
    expect(indexingAllowed(live)).toBe(true);
    expect(indexingAllowed({ ...live, NODE_ENV: "development" })).toBe(false);
    expect(indexingAllowed({ ...live, SITE_URL: "" })).toBe(false);
    expect(indexingAllowed({ ...live, ALLOW_MOCK_DATA: "true" })).toBe(false);
    expect(indexingAllowed({ ...live, ALLOW_INDEXING: "1" })).toBe(false);
  });

  it("robots.txt disallows everything outside the live store", () => {
    const r = robots();
    expect(r.rules).toEqual([{ userAgent: "*", disallow: "/" }]);
  });
});

describe("CMS-03 sitemap", () => {
  it("lists products, categories, collections and content — never private or filtered URLs", async () => {
    const urls = (await sitemap()).map((e) => e.url);
    const { products } = await commerce.listProducts({ limit: 1 });
    expect(urls).toContain(`${ORIGIN}/products/${products[0].handle}`);
    expect(urls).toContain(`${ORIGIN}/men`);
    expect(urls).toContain(`${ORIGIN}/help/shipping`);
    expect(urls).toContain(`${ORIGIN}/legal/privacy/hi`);
    expect(urls.some((u) => /\/(admin|api|account|checkout|bag|wishlist|dev|search)(\/|$)|\?/.test(u.replace(ORIGIN, "")))).toBe(false);
    expect(new Set(urls).size).toBe(urls.length);
  });
});

describe("CMS-03 structured data", () => {
  it("Organization + WebSite SearchAction; JSON can't break out of <script>", () => {
    const [org, site] = siteJsonLd({ origin: ORIGIN, name: "X</script><script>alert(1)</script>", description: "d", sameAs: [], email: null, phone: null });
    expect((site as { potentialAction: { target: { urlTemplate: string } } }).potentialAction.target.urlTemplate).toBe(`${ORIGIN}/search?q={search_term_string}`);
    expect(org).not.toHaveProperty("contactPoint");
    expect(toJsonLd(org)).not.toMatch(/<\/script/i);
    const bc = breadcrumbJsonLd([{ name: "Home", url: `${ORIGIN}/` }, { name: "Men", url: `${ORIGIN}/men` }]);
    expect(bc.itemListElement.map((i) => i.position)).toEqual([1, 2]);
  });
});

describe("CMS-03 redirects manager", () => {
  it("the shipped list is safe", () => {
    expect(redirectProblems(REDIRECTS)).toEqual([]);
    expect(nextRedirects().every((r) => r.permanent)).toBe(true);
  });

  it("refuses open redirects, protocol-relative targets, loops, duplicates and chains", () => {
    expect(redirectProblems([{ from: "/a", to: "https://evil.example", note: "" }])).toHaveLength(1);
    expect(redirectProblems([{ from: "/a", to: "//evil.example", note: "" }])).toHaveLength(1);
    expect(redirectProblems([{ from: "/a", to: "/a", note: "" }]).length).toBeGreaterThan(0);
    expect(redirectProblems([{ from: "/a", to: "/b", note: "" }, { from: "/a", to: "/c", note: "" }]).length).toBeGreaterThan(0);
    expect(redirectProblems([{ from: "/a", to: "/b", note: "" }, { from: "/b", to: "/c", note: "" }]).length).toBeGreaterThan(0);
    expect(redirectProblems([{ from: "/a", to: "/b#x\"onload", note: "" }])).toHaveLength(1);
    expect(() => nextRedirects([{ from: "/a", to: "https://evil.example", note: "" }])).toThrow(/Unsafe redirects/);
  });
});

describe("CMS-04 help & company pages", () => {
  it("every token is filled and numbers come from the same config checkout uses", () => {
    for (const slug of CONTENT_SLUGS) {
      const text = JSON.stringify(renderContentPage(slug));
      expect(text).not.toMatch(/\{\{/);
    }
    const shipping = JSON.stringify(renderContentPage("shipping"));
    expect(shipping).toContain(formatINR(STORE_CONFIG.freeShippingThreshold));
    expect(shipping).toContain(formatINR(STORE_CONFIG.shippingFee));
    expect(shipping).toContain(formatINR(STORE_CONFIG.codFee));
  });

  it("contact page shows seller details and the grievance officer (E-Commerce Rules 2020)", () => {
    const c = JSON.stringify(renderContentPage("contact"));
    expect(c).toMatch(/Grievance Officer/);
    expect(c).toMatch(/GSTIN/);
  });
});

describe("ANL-02 product feed", () => {
  it("one item per size, grouped by product id, sale price only below MRP", async () => {
    const { products } = await commerce.listProducts({ limit: 5 });
    const items = feedItems(products, "The Alpha Hood");
    expect(items.length).toBe(products.reduce((n, p) => n + p.sizes.length, 0));
    for (const p of products) {
      const mine = items.filter((i) => i.groupId === p.id);
      expect(new Set(mine.map((i) => i.id)).size).toBe(mine.length);
      for (const i of mine) {
        expect(i.availability).toBe(p.sizes.find((s) => s.label === i.size)!.stock > 0 ? "in_stock" : "out_of_stock");
        if (p.price < p.mrp) expect(i.salePrice).toBe(`${(p.price / 100).toFixed(2)} INR`);
        else expect(i.salePrice).toBeNull();
      }
    }
  });

  it("escapes catalogue text so the XML can't be broken or injected", () => {
    expect(xml(`<a href="x">&'\u0001`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&apos;");
    const evil = { id: "p1", handle: "h", title: "Tee</g:title><g:price>1 INR</g:price>", description: "]]>", category: "t-shirts", price: 100, mrp: 200, sku: "S", colour: { name: "Black", hex: "#000" }, images: [], sizes: [{ label: "M", stock: 1 }] };
    const out = merchantFeedXml([evil as never], { brand: "B", title: "T" });
    expect(out.match(/<g:price>/g)).toHaveLength(1);
    expect(out).toContain("&lt;/g:title&gt;");
  });

  it("route serves XML, not indexed, rate-limited", async () => {
    const res = await feedGET(new Request(`${ORIGIN}/feeds/products.xml`, { headers: { "x-forwarded-for": "198.51.100.7" } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/xml/);
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(await res.text()).toMatch(/^<\?xml/);
    let last = 200;
    for (let i = 0; i < 31; i++) last = (await feedGET(new Request(`${ORIGIN}/feeds/products.xml`, { headers: { "x-forwarded-for": "198.51.100.8" } }))).status;
    expect(last).toBe(429);
  });
});

describe("§7 RUM", () => {
  it("stores only metric, value, route template and device — never ids or query strings", async () => {
    resetRumForTests();
    expect(routeTemplate("/products/black-oversized-tee?utm=x")).toBe("/products/[handle]");
    expect(routeTemplate("/checkout/order/AH1234")).toBe("/checkout/[step]/[id]");
    expect(routeTemplate("/account/orders/AH1")).toBe("/account/*");
    expect(routeTemplate("/something/else")).toBe("other");
    expect((await rumPOST(post("/api/rum", { metric: "LCP", value: 2100, path: "/products/x?phone=9876543210", device: "mobile" }))).status).toBe(204);
    await rumPOST(post("/api/rum", { metric: "LCP", value: 3100, path: "/products/y", device: "mobile" }));
    await rumPOST(post("/api/rum", { metric: "LCP", value: -5, path: "/products/y", device: "mobile" }));
    await rumPOST(post("/api/rum", { metric: "EVIL", value: 1, path: "/", device: "mobile" }));
    const rows = rumSummary();
    expect(rows).toEqual([{ route: "/products/[handle]", device: "mobile", metric: "LCP", p75: 3100, samples: 2, good: false }]);
    expect(JSON.stringify(rows)).not.toMatch(/9876543210|black|phone/);
  });

  it("refuses cross-site posts and oversized bodies", async () => {
    expect((await rumPOST(post("/api/rum", { metric: "LCP", value: 1 }, { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" }))).status).toBe(403);
    expect((await rumPOST(post("/api/rum", { metric: "LCP", value: 1, path: "x".repeat(400) }))).status).toBe(413);
  });
});
