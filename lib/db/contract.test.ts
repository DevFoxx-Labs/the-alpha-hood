import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSession, customerIdFromRequest, revokeAllSessions } from "@/lib/auth/session";
import { OTP_MAX_ATTEMPTS, OtpError, sendOtp, verifyOtp } from "@/lib/auth/otp";
import { MAX_ADDRESSES } from "@/lib/customers/store";
import { DbConfigError, readDbConfig, assertDestructiveAllowed, describeTarget } from "./config";
import { type StoresUnderTest, testTargets } from "./testing";

/**
 * One behaviour contract, run against every storage engine: memory, MySQL, PostgreSQL, MongoDB (the DB ones only
 * when TEST_*_URL points at a local `_test` database). If a test passes on memory but fails on a database, the
 * database store is wrong — the business layer depends on exactly this behaviour.
 */
const ADDRESS = { name: "Contract Buyer", phone: "9876543210", pincode: "411045", line1: "Flat 1, Test Tower, Baner Road", line2: "Baner", landmark: "", city: "Pune", state: "Maharashtra", type: "home" } as const;
const sms = { name: "test", sendOtp: async (_p: string, code: string) => ({ demoCode: code }) };
const reqWith = (token: string) => new Request("http://localhost/x", { headers: { cookie: `ah_session=${token}` } });

describe("database config fails closed", () => {
  it("rejects bad driver / URL combinations and never prints credentials", () => {
    expect(readDbConfig({})).toBeNull();
    expect(() => readDbConfig({ DATABASE_DRIVER: "oracle", DATABASE_URL: "x" })).toThrow(DbConfigError);
    expect(() => readDbConfig({ DATABASE_DRIVER: "mysql", DATABASE_URL: "postgres://u:p@h/db" })).toThrow(DbConfigError);
    expect(() => readDbConfig({ DATABASE_DRIVER: "mysql", DATABASE_URL: "mysql://u:p@h:3306/" })).toThrow(DbConfigError);
    const cfg = readDbConfig({ DATABASE_DRIVER: "postgres", DATABASE_URL: "postgres://admin:s3cret@db.example.com:5432/shop" })!;
    expect(describeTarget(cfg)).toBe("postgres://db.example.com:5432/shop");
    expect(describeTarget(cfg)).not.toContain("s3cret");
  });

  it("destructive operations only on a local _dev/_test database, never in production", () => {
    const local = { driver: "mysql" as const, url: "mysql://u:p@127.0.0.1:3306/alpha_hood_test" };
    expect(() => assertDestructiveAllowed(local, { NODE_ENV: "test" })).not.toThrow();
    expect(() => assertDestructiveAllowed(local, { NODE_ENV: "production" })).toThrow(DbConfigError);
    expect(() => assertDestructiveAllowed({ ...local, url: "mysql://u:p@10.0.0.5:3306/alpha_hood_test" }, {})).toThrow(DbConfigError);
    expect(() => assertDestructiveAllowed({ ...local, url: "mysql://u:p@127.0.0.1:3306/alpha_hood" }, {})).toThrow(DbConfigError);
  });
});

for (const target of testTargets()) {
  describe(`store contract · ${target.name}`, () => {
    let s: StoresUnderTest;
    beforeAll(async () => {
      s = await target.setup();
    }, 60_000);
    afterAll(async () => {
      await target.teardown();
    });

    it("consent ledger: append-only, ordered, filtered by user / visitor / subscriber", async () => {
      const base = { purpose: "analytics", status: "granted", method: "cookie_banner", source: "web", notice_version: "cookies@2026-11-25", ip_address: "203.0.113.1", user_agent: "UA" } as const;
      const t0 = new Date("2026-11-26T10:00:00.000Z");
      const [a] = await s.ledger.append([{ ...base, user_id: "u1", visitor_id: "v1", subscriber_id: null }], t0);
      await s.ledger.append([{ ...base, status: "withdrawn", user_id: "u1", visitor_id: null, subscriber_id: null }], new Date(t0.getTime() + 1000));
      await s.ledger.append([{ ...base, user_id: null, visitor_id: null, subscriber_id: "sub1" }], t0);
      expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(a.created_at).toBe(t0.toISOString());
      expect((await s.ledger.listByUser("u1")).map((r) => r.status)).toEqual(["granted", "withdrawn"]);
      expect(await s.ledger.listByVisitor("v1")).toHaveLength(1);
      expect(await s.ledger.listBySubscriber("sub1")).toHaveLength(1);
      expect(await s.ledger.listByUser("nobody")).toEqual([]);
      expect(Object.isFrozen(a)).toBe(true);
    });

    it("customers: one per phone even under a race; profile, counters, coupon uses", async () => {
      const phone = "+919000001001";
      const results = await Promise.all(Array.from({ length: 5 }, () => s.customers.findOrCreateByPhone(phone)));
      expect(new Set(results.map((r) => r.customer.id)).size).toBe(1);
      expect(results.filter((r) => r.created)).toHaveLength(1);
      const id = results[0].customer.id;
      await s.customers.setName(id, "Arjun");
      await s.customers.setEmail(id, "arjun@example.com");
      await Promise.all([s.customers.recordOrder(id, "ALPHA10"), s.customers.recordOrder(id, "ALPHA10"), s.customers.recordOrder(id, null)]);
      await s.customers.recordRto(id);
      await s.customers.setCodBlocked(id, true);
      const c = (await s.customers.get(id))!;
      expect(c).toMatchObject({ name: "Arjun", email: "arjun@example.com", orderCount: 3, rtoCount: 1, codBlocked: true, couponUses: { ALPHA10: 2 } });
      expect((await s.customers.findByPhone(phone))?.id).toBe(id);
      expect(await s.customers.get("cus_missing")).toBeNull();
    });

    it("customers: address cap holds under concurrent adds; remove is owner-scoped", async () => {
      const { customer } = await s.customers.findOrCreateByPhone("+919000001002");
      const other = (await s.customers.findOrCreateByPhone("+919000001003")).customer;
      const tries = await Promise.allSettled(Array.from({ length: MAX_ADDRESSES + 4 }, () => s.customers.addAddress(customer.id, ADDRESS)));
      expect(tries.filter((r) => r.status === "fulfilled")).toHaveLength(MAX_ADDRESSES);
      const saved = (await s.customers.get(customer.id))!.addresses;
      expect(saved).toHaveLength(MAX_ADDRESSES);
      expect(saved[0]).toMatchObject({ ...ADDRESS, id: expect.stringMatching(/^adr_/) });
      expect(await s.customers.removeAddress(other.id, saved[0].id)).toBe(false);
      expect(await s.customers.removeAddress(customer.id, saved[0].id)).toBe(true);
      expect((await s.customers.get(customer.id))!.addresses).toHaveLength(MAX_ADDRESSES - 1);
      await expect(s.customers.addAddress("cus_missing", ADDRESS)).rejects.toThrow();
    });

    it("customers: search (escaped LIKE), erasure frees the phone and hides the customer", async () => {
      const { customer } = await s.customers.findOrCreateByPhone("+919000004321");
      await s.customers.setName(customer.id, "Zara 100%_Real");
      expect((await s.customers.search("4321")).some((c) => c.id === customer.id)).toBe(true);
      expect((await s.customers.search("100%_real")).some((c) => c.id === customer.id)).toBe(true);
      expect((await s.customers.search("%")).some((c) => c.id === customer.id)).toBe(true);
      expect((await s.customers.search("1%0")).some((c) => c.id === customer.id)).toBe(false);
      await s.customers.erase(customer.id);
      const erased = (await s.customers.get(customer.id))!;
      expect(erased).toMatchObject({ name: null, email: null, addresses: [] });
      expect(erased.phone).not.toContain("4321");
      expect((await s.customers.search("4321")).some((c) => c.id === customer.id)).toBe(false);
      const again = await s.customers.findOrCreateByPhone("+919000004321");
      expect(again.created).toBe(true);
      expect(again.customer.id).not.toBe(customer.id);
    });

    it("sessions: stored by hash, expire, revoke one / all", async () => {
      const t = Date.now();
      const a = await createSession("cus_s1", s.sessions, t);
      const b = await createSession("cus_s1", s.sessions, t);
      const c = await createSession("cus_s2", s.sessions, t);
      expect(await customerIdFromRequest(reqWith(a), s.sessions, t + 1000)).toBe("cus_s1");
      expect(await customerIdFromRequest(reqWith(a), s.sessions, t + 31 * 86_400_000)).toBeNull();
      expect(await customerIdFromRequest(reqWith("x".repeat(43)), s.sessions, t)).toBeNull();
      expect(await revokeAllSessions("cus_s1", s.sessions)).toBe(2);
      expect(await customerIdFromRequest(reqWith(b), s.sessions, t)).toBeNull();
      expect(await customerIdFromRequest(reqWith(c), s.sessions, t)).toBe("cus_s2");
    });

    it("OTP: one live code per phone, cooldown, single use", async () => {
      const t = Date.parse("2026-11-26T09:00:00Z");
      const phone = "+919000002001";
      const first = await sendOtp(phone, { store: s.otp, sms, now: t });
      await expect(sendOtp(phone, { store: s.otp, sms, now: t + 1000 })).rejects.toMatchObject({ code: "cooldown" });
      const second = await sendOtp(phone, { store: s.otp, sms, now: t + 31_000 });
      await expect(verifyOtp(first.challengeId, first.demoCode!, { store: s.otp, now: t + 32_000 })).rejects.toBeInstanceOf(OtpError);
      expect(await verifyOtp(second.challengeId, second.demoCode!, { store: s.otp, now: t + 32_000 })).toBe(phone);
      await expect(verifyOtp(second.challengeId, second.demoCode!, { store: s.otp, now: t + 33_000 })).rejects.toMatchObject({ code: "invalid" });
    });

    it("OTP: concurrent guesses never exceed the attempt limit; a correct code wins only once", async () => {
      const t = Date.parse("2026-11-26T09:10:00Z");
      const phone = "+919000002002";
      const sent = await sendOtp(phone, { store: s.otp, sms, now: t });
      const wrong = sent.demoCode === "000000" ? "111111" : "000000";
      const guesses = await Promise.allSettled(Array.from({ length: OTP_MAX_ATTEMPTS + 5 }, () => verifyOtp(sent.challengeId, wrong, { store: s.otp, now: t + 1000 })));
      expect(guesses.every((g) => g.status === "rejected")).toBe(true);
      const c = await s.otp.getChallenge(sent.challengeId);
      expect(c!.attempts).toBe(OTP_MAX_ATTEMPTS);
      await expect(verifyOtp(sent.challengeId, sent.demoCode!, { store: s.otp, now: t + 2000 })).rejects.toMatchObject({ code: "locked" });

      const ok = await sendOtp("+919000002003", { store: s.otp, sms, now: t });
      const race = await Promise.allSettled([1, 2, 3].map(() => verifyOtp(ok.challengeId, ok.demoCode!, { store: s.otp, now: t + 1000 })));
      expect(race.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    });

    it("OTP: hourly send cap per phone", async () => {
      const t = Date.parse("2026-11-26T11:00:00Z");
      const phone = "+919000002004";
      for (let i = 0; i < 5; i++) await sendOtp(phone, { store: s.otp, sms, now: t + i * 31_000 });
      await expect(sendOtp(phone, { store: s.otp, sms, now: t + 6 * 31_000 })).rejects.toMatchObject({ code: "limited" });
    });
  });
}

// ── End to end: the real API routes running on each database ─────────────────────────────────────
import { vi } from "vitest";
import { GET as meGET, PATCH as mePATCH } from "@/app/api/account/me/route";
import { GET as prefsGET, POST as prefsPOST } from "@/app/api/account/preferences/route";
import { POST as otpSend } from "@/app/api/otp/send/route";
import { POST as otpVerify } from "@/app/api/otp/verify/route";
import { rateLimiter } from "@/lib/http/rate-limit";

for (const target of testTargets().filter((t) => t.cfg)) {
  describe(`API on the own backend · ${target.name}`, () => {
    const ORIGIN = "http://localhost:3000";
    const req = (path: string, method: string, body?: unknown, cookie?: string) =>
      new Request(`${ORIGIN}${path}`, {
        method,
        headers: { "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": "198.51.100.40", ...(cookie ? { cookie } : {}) },
        body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
      });
    beforeAll(async () => {
      await target.setup();
      vi.stubEnv("DATABASE_DRIVER", target.cfg!.driver);
      vi.stubEnv("DATABASE_URL", target.cfg!.url);
      vi.stubEnv("ACCOUNTS_ENABLED", "true");
      vi.stubEnv("CHECKOUT_ENABLED", "true");
      rateLimiter.reset();
    }, 60_000);
    afterAll(async () => {
      vi.unstubAllEnvs();
      await target.teardown();
    });

    it("OTP sign-in → session → profile → consent ledger, all persisted in the database", async () => {
      const sent = await (await otpSend(req("/api/otp/send", "POST", { phone: "9811122233" }))).json();
      const verified = await otpVerify(req("/api/otp/verify", "POST", { challengeId: sent.challengeId, code: sent.demoCode }));
      expect(verified.status).toBe(200);
      const cookie = verified.headers.getSetCookie().find((c) => c.startsWith("ah_session="))!.split(";")[0];
      expect((await mePATCH(req("/api/account/me", "PATCH", { name: "Db Tester" }, cookie))).status).toBe(200);
      const me = await (await meGET(req("/api/account/me", "GET", undefined, cookie))).json();
      expect(me.customer.name).toBe("Db Tester");
      expect((await prefsPOST(req("/api/account/preferences", "POST", { whatsapp_updates: true }, cookie))).status).toBe(200);
      const prefs = await (await prefsGET(req("/api/account/preferences", "GET", undefined, cookie))).json();
      expect(prefs.whatsapp_updates).toBe(true);
      // The rows really are in this database (not memory): read them back through a fresh store set.
      const { createDbStores } = await import("./index");
      const fresh = createDbStores(target.cfg!);
      const customer = await fresh.customers.findByPhone("+919811122233");
      expect(customer?.name).toBe("Db Tester");
      expect((await fresh.ledger.listByUser(customer!.id)).some((r) => r.purpose === "whatsapp_updates" && r.status === "granted")).toBe(true);
      // No cookie → 401 (auth still enforced on the async path).
      expect((await meGET(req("/api/account/me", "GET"))).status).toBe(401);
    });
  });
}

// ── Phase 2: money stores + checkout API (same file so database suites run sequentially) ─────────
import "./money-contract";
// ── Phase 3: returns, photos, grievance inbox, newsletter ─────────────────────────────────────────
import "./aftersales-contract";
// ── Phase 4: catalogue, reviews, admin product editing, COMMERCE_PROVIDER=own end to end ─────────
import "./catalog-contract";

// ── Guard: database code must never reach the browser bundle ─────────────────────────────────────
import { existsSync as fileExists, readFileSync as readSource, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve as resolvePath } from "node:path";

describe("client bundle never imports the database layer", () => {
  it("no 'use client' module reaches lib/db or a DB driver through its imports", () => {
    const root = process.cwd();
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((f) => {
        const p = join(dir, f);
        if (f === "node_modules" || f.startsWith(".")) return [];
        return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f) ? [p] : [];
      });
    const files = ["app", "components", "lib"].flatMap((d) => walk(join(root, d)));
    const resolveImport = (from: string, spec: string): string | null => {
      const base = spec.startsWith("@/") ? join(root, spec.slice(2)) : spec.startsWith(".") ? resolvePath(dirname(from), spec) : null;
      if (!base) return null;
      for (const cand of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) if (fileExists(cand) && statSync(cand).isFile()) return cand;
      return null;
    };
    const FORBIDDEN_PKG = /^(kysely|mysql2|pg|mongodb)(\/|$)/;
    const IMPORT_RE = /(?:^|\n)\s*(?:import|export)(?!\s+type)[^;'"]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
    const memo = new Map<string, string | null>();
    const reachesDb = (file: string, stack: Set<string>): string | null => {
      if (memo.has(file)) return memo.get(file)!;
      if (stack.has(file)) return null;
      stack.add(file);
      const src = readSource(file, "utf8");
      let hit: string | null = null;
      for (const m of src.matchAll(IMPORT_RE)) {
        const spec = m[1] ?? m[2];
        if (FORBIDDEN_PKG.test(spec)) {
          hit = `${file} → ${spec}`;
          break;
        }
        const next = resolveImport(file, spec);
        if (!next) continue;
        if (next.includes(`${join("lib", "db")}`)) {
          hit = `${file} → ${spec}`;
          break;
        }
        const deeper = reachesDb(next, stack);
        if (deeper) {
          hit = `${file} → ${deeper}`;
          break;
        }
      }
      stack.delete(file);
      memo.set(file, hit);
      return hit;
    };
    const clientFiles = files.filter((f) => /^\s*["']use client["']/.test(readSource(f, "utf8")));
    const leaks = clientFiles.map((f) => reachesDb(f, new Set())).filter(Boolean);
    expect(leaks).toEqual([]);
    expect(clientFiles.length).toBeGreaterThan(20);
  });
});
