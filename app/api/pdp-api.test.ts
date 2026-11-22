import { beforeEach, describe, expect, it } from "vitest";
import { MOCK_REVIEWS } from "@/lib/commerce/mock/data";
import { rateLimiter } from "@/lib/http/rate-limit";
import { GET as deliveryGET } from "./delivery/route";
import { POST as helpfulPOST } from "./reviews/helpful/route";
import { GET as reviewsGET } from "./reviews/route";

const ORIGIN = "http://localhost:3000";
const get = (path: string, ip = "198.51.100.20") => new Request(`${ORIGIN}${path}`, { headers: { "x-forwarded-for": ip } });
const post = (body: unknown, { cookie, origin = ORIGIN }: { cookie?: string; origin?: string } = {}) => {
  const headers = new Headers({ "content-type": "application/json", origin, "x-forwarded-for": "198.51.100.21" });
  if (cookie) headers.set("cookie", cookie);
  return new Request(`${ORIGIN}/api/reviews/helpful`, { method: "POST", headers, body: JSON.stringify(body) });
};

beforeEach(() => rateLimiter.reset());

describe("GET /api/delivery", () => {
  it("validates the pincode and returns the promise", async () => {
    expect((await deliveryGET(get("/api/delivery?pincode=12345"))).status).toBe(422);
    expect((await deliveryGET(get("/api/delivery?pincode=411045%27"))).status).toBe(422);
    const res = await deliveryGET(get("/api/delivery?pincode=411045"));
    expect(res.status).toBe(200);
    expect((await res.json()).serviceable).toBe(true);
    expect(res.headers.get("cache-control")).toContain("private");
  });

  it("rate-limits per IP", async () => {
    let last: Response | undefined;
    for (let i = 0; i < 31; i++) last = await deliveryGET(get("/api/delivery?pincode=411045", "198.51.100.99"));
    expect(last?.status).toBe(429);
  });
});

describe("GET /api/reviews", () => {
  it("lists by style or category and rejects bad targets", async () => {
    const style = MOCK_REVIEWS[0].styleId;
    const res = await reviewsGET(get(`/api/reviews?style=${style}&rating=5`));
    const body = await res.json();
    expect(body.reviews.every((r: { rating: number }) => r.rating === 5)).toBe(true);
    expect((await reviewsGET(get("/api/reviews?category=shirts"))).status).toBe(200);
    expect((await reviewsGET(get("/api/reviews?style=../x"))).status).toBe(400);
    expect((await reviewsGET(get("/api/reviews"))).status).toBe(400);
  });
});

describe("POST /api/reviews/helpful", () => {
  const id = MOCK_REVIEWS[1].id;

  it("counts one vote per browser and refuses repeats", async () => {
    const first = await helpfulPOST(post({ reviewId: id }));
    expect(first.status).toBe(200);
    const vid = first.headers.getSetCookie().find((c) => c.startsWith("ah_vid="))!.split(";")[0];
    expect((await helpfulPOST(post({ reviewId: id }, { cookie: vid }))).status).toBe(409);
  });

  it("refuses cross-origin, unknown fields and bad ids", async () => {
    expect((await helpfulPOST(post({ reviewId: id }, { origin: "https://evil.example" }))).status).toBe(403);
    expect((await helpfulPOST(post({ reviewId: id, helpful: 999 }))).status).toBe(422);
    expect((await helpfulPOST(post({ reviewId: "<script>" }))).status).toBe(422);
  });
});
