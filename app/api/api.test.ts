import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { resolveLedger } from "@/lib/consent/ledger";
import { rateLimiter } from "@/lib/http/rate-limit";
import { POST as consentPOST, GET as consentGET } from "./consent/route";
import { GET as legalIndexGET } from "./legal/route";
import { GET as legalGET } from "./legal/[slug]/route";
import { POST as newsletterPOST } from "./newsletter/route";
import { POST as withdrawPOST } from "./newsletter/withdraw/route";
import { POST as privacyPOST } from "./privacy-requests/route";

const ORIGIN = "http://localhost:3000";

function post(path: string, body: unknown, init: { origin?: string | null; cookie?: string; ip?: string; contentType?: string } = {}) {
  const headers = new Headers({ "content-type": init.contentType ?? "application/json", "x-forwarded-for": init.ip ?? "198.51.100.1" });
  if (init.origin !== null) headers.set("origin", init.origin ?? ORIGIN);
  if (init.cookie) headers.set("cookie", init.cookie);
  return new Request(`${ORIGIN}${path}`, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });
}

function cookieFrom(res: Response, name: string): string | undefined {
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(";");
    const [k, v] = pair.split("=");
    if (k === name) return v;
  }
  return undefined;
}

beforeEach(() => rateLimiter.reset());

describe("public write guards (CSRF, size, content type)", () => {
  it("refuses cross-origin and origin-less writes with 403", async () => {
    expect((await consentPOST(post("/api/consent", {}, { origin: "https://evil.example" }))).status).toBe(403);
    expect((await newsletterPOST(post("/api/newsletter", {}, { origin: null }))).status).toBe(403);
    expect((await privacyPOST(post("/api/privacy-requests", {}, { origin: "null" }))).status).toBe(403);
  });

  it("refuses non-JSON (415) and oversize bodies (413)", async () => {
    expect((await consentPOST(post("/api/consent", "a=1", { contentType: "application/x-www-form-urlencoded" }))).status).toBe(415);
    expect((await consentPOST(post("/api/consent", { pad: "x".repeat(2_000) }))).status).toBe(413);
  });

  it("rate-limits per IP with 429 + Retry-After", async () => {
    let last: Response | undefined;
    for (let i = 0; i < 6; i++) {
      last = await newsletterPOST(post("/api/newsletter", { channel: "email", contact: "a@b.co", consent: false }, { ip: "198.51.100.99" }));
    }
    expect(last?.status).toBe(429);
    expect(last?.headers.get("retry-after")).toMatch(/^\d+$/);
  });

  it("every POST route under app/api uses guardPublicWrite (no unthrottled public write)", () => {
    const routes: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (name === "route.ts") routes.push(p);
      }
    };
    walk(join(process.cwd(), "app", "api"));
    const writes = routes.filter((r) => /export async function (POST|PUT|PATCH|DELETE)\b/.test(readFileSync(r, "utf8")));
    expect(writes.length).toBeGreaterThanOrEqual(4);
    // Server-to-server webhooks can't pass a same-origin check; they must verify a signature instead.
    const WEBHOOKS = [join("payments", "webhook", "route.ts")];
    for (const r of writes) {
      const src = readFileSync(r, "utf8");
      if (WEBHOOKS.some((w) => r.endsWith(w))) {
        expect(src, r).toContain("verifyWebhook(");
        expect(src, r).toContain("rateLimiter.hit(");
      } else if (src.includes("adminWrite(")) {
        // Admin writes: adminWrite = guardPublicWrite + requireStaff + permission (lib/admin/http.ts).
        expect(src, r).not.toContain("guardPublicWrite(request, { name: \"admin-\"");
      } else if (src.includes("guardPublicUpload(")) {
        // Binary uploads: same-origin + rate limit + size cap, binary instead of JSON.
        expect(src, r).toContain("requireAccount(");
      } else {
        expect(src, r).toContain("guardPublicWrite(");
      }
    }
  });
});

describe("POST /api/consent", () => {
  it("records the decision, sets ah_consent + an HTTP-only visitor cookie", async () => {
    const res = await consentPOST(post("/api/consent", { analytics: false, advertising: false, method: "cookie_banner" }));
    expect(res.status).toBe(201);
    expect(cookieFrom(res, "ah_consent")).toMatch(/^1\.\d{4}-\d{2}-\d{2}\.a0\.d0\.\d+$/);
    const vid = res.headers.getSetCookie().find((c) => c.startsWith("ah_vid="));
    expect(vid).toMatch(/HttpOnly/i);
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("rejects malformed decisions with 422", async () => {
    const res = await consentPOST(post("/api/consent", { analytics: "yes", advertising: false, method: "cookie_banner" }));
    expect(res.status).toBe(422);
  });

  it("GET returns an empty history for a browser without a visitor cookie", async () => {
    const res = await consentGET(new Request(`${ORIGIN}/api/consent`));
    expect(await res.json()).toEqual({ history: [] });
  });
});

describe("POST /api/newsletter (GLB-05)", () => {
  it("fails without an affirmative tick — even a truthy string — and writes nothing", async () => {
    for (const consent of [undefined, false, "true", 1]) {
      const res = await newsletterPOST(post("/api/newsletter", { channel: "email", contact: "x@example.com", consent }));
      expect(res.status).toBe(422);
    }
  });

  it("rejects invalid contacts", async () => {
    const bad = [
      { channel: "email", contact: "not-an-email" },
      { channel: "whatsapp", contact: "12345" },
      { channel: "sms", contact: "9876543210" },
    ];
    for (const b of bad) expect((await newsletterPOST(post("/api/newsletter", { ...b, consent: true }))).status).toBe(422);
  });

  it("writes a granted marketing consent row, and one-click withdrawal records withdrawn", async () => {
    const res = await newsletterPOST(post("/api/newsletter", { channel: "whatsapp", contact: "98765 43210", consent: true }));
    expect(res.status).toBe(201);
    const vid = cookieFrom(res, "ah_vid")!;
    const rows = await resolveLedger().listByVisitor(vid);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ purpose: "marketing_whatsapp", status: "granted", method: "checkbox", source: "web" });
    expect(rows[0].subscriber_id).toBeTruthy();
    expect(rows[0].notice_version).toMatch(/^privacy@/);

    const w = await withdrawPOST(post("/api/newsletter/withdraw", {}, { cookie: `ah_vid=${vid}` }));
    expect(await w.json()).toEqual({ withdrawn: 1 });
    const after = await resolveLedger().listByVisitor(vid);
    expect(after.map((r) => r.status)).toEqual(["granted", "withdrawn"]);
  });
});

describe("POST /api/privacy-requests (DPDP ss.11–14)", () => {
  const valid = { type: "access", name: "Test Person", contact: "person@example.com", details: "Please send me my data summary.", declaration: true };

  it("requires the declaration and valid fields", async () => {
    expect((await privacyPOST(post("/api/privacy-requests", { ...valid, declaration: false }))).status).toBe(422);
    expect((await privacyPOST(post("/api/privacy-requests", { ...valid, type: "hack" }))).status).toBe(422);
    expect((await privacyPOST(post("/api/privacy-requests", { ...valid, details: "short" }))).status).toBe(422);
    expect((await privacyPOST(post("/api/privacy-requests", { ...valid, role: "admin" }))).status).toBe(422);
    expect((await privacyPOST(post("/api/privacy-requests", { ...valid, type: "nomination" }))).status).toBe(422);
  });

  it("returns a reference and timelines only (no echo of personal data)", async () => {
    const res = await privacyPOST(post("/api/privacy-requests", { ...valid, contact: "echo@example.com" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.reference).toMatch(/^PR-[A-Z2-9]{8}$/);
    expect(Object.keys(body).sort()).toEqual(["acknowledgeBy", "reference", "resolveBy"]);
  });

  it("caps requests per contact per day", async () => {
    const contact = "flood@example.com";
    for (let i = 0; i < 3; i++) {
      expect((await privacyPOST(post("/api/privacy-requests", { ...valid, contact }, { ip: `192.0.2.${i}` }))).status).toBe(201);
    }
    expect((await privacyPOST(post("/api/privacy-requests", { ...valid, contact }, { ip: "192.0.2.9" }))).status).toBe(422);
  });
});

describe("GET /api/legal", () => {
  it("lists notices and serves each one, Hindi where available", async () => {
    const index = await (await legalIndexGET()).json();
    expect(index.notices).toHaveLength(4);
    const hi = await legalGET(new Request(`${ORIGIN}/api/legal/privacy?lang=hi`), { params: Promise.resolve({ slug: "privacy" }) });
    expect(hi.status).toBe(200);
    expect((await hi.json()).lang).toBe("hi");
    const missing = await legalGET(new Request(`${ORIGIN}/api/legal/x`), { params: Promise.resolve({ slug: "../etc" }) });
    expect(missing.status).toBe(404);
  });
});
