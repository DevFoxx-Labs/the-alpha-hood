import { beforeEach, describe, expect, it } from "vitest";
import { parseScope } from "@/lib/catalog/scope";
import { rateLimiter } from "@/lib/http/rate-limit";
import { GET as catalogGET } from "./catalog/route";
import { GET as searchGET } from "./search/route";

const get = (path: string, ip = "198.51.100.10") =>
  new Request(`http://localhost:3000${path}`, { headers: { "x-forwarded-for": ip } });

beforeEach(() => rateLimiter.reset());

describe("GET /api/search (SRCH-01)", () => {
  it("returns products and categories for a query, nothing for < 2 chars", async () => {
    const res = await searchGET(get("/api/search?q=hoodie"));
    const body = await res.json();
    expect(body.products.length).toBeGreaterThan(0);
    expect(body.products.length).toBeLessThanOrEqual(6);
    expect(await (await searchGET(get("/api/search?q=h"))).json()).toEqual({ products: [], categories: [] });
  });

  it("bounds the query and ignores control characters", async () => {
    const long = encodeURIComponent("jeans " + "x".repeat(5_000) + "\u0000");
    expect((await searchGET(get(`/api/search?q=${long}`))).status).toBe(200);
  });

  it("rate-limits per IP", async () => {
    let last: Response | undefined;
    for (let i = 0; i < 121; i++) last = await searchGET(get("/api/search?q=tee", "198.51.100.77"));
    expect(last?.status).toBe(429);
  });
});

describe("GET /api/catalog (mobile Apply count)", () => {
  it("counts with the same filters as the page", async () => {
    const all = await (await catalogGET(get("/api/catalog?scope=category&category=shirts"))).json();
    const slim = await (await catalogGET(get("/api/catalog?scope=category&category=shirts&fit=slim"))).json();
    expect(all.total).toBeGreaterThan(slim.total);
    expect(Object.keys(all)).toEqual(["total"]);
  });

  it("rejects unknown or malformed scopes", async () => {
    expect((await catalogGET(get("/api/catalog"))).status).toBe(400);
    expect((await catalogGET(get("/api/catalog?scope=category&category=../../etc"))).status).toBe(400);
    expect((await catalogGET(get("/api/catalog?scope=collection&collection=nope"))).status).toBe(400);
  });
});

describe("parseScope", () => {
  it("allow-lists scope kinds and handles", () => {
    expect(parseScope(new URLSearchParams("scope=all"))).toEqual({ kind: "all" });
    expect(parseScope(new URLSearchParams("scope=category&category=jeans&sub=baggy"))).toEqual({ kind: "category", category: "jeans", subcategory: "baggy" });
    expect(parseScope(new URLSearchParams("scope=category&category=Jeans"))).toBeNull();
    expect(parseScope(new URLSearchParams("scope=search&q=%20%20"))).toBeNull();
    expect(parseScope(new URLSearchParams("scope=admin"))).toBeNull();
  });
});
