import { describe, expect, it } from "vitest";
import { ValidationError } from "@/lib/http/guard";
import { NOTICES } from "@/lib/legal";
import { NO_OPTIONAL_COOKIES, parseChoice, readCookie, serializeChoice } from "./cookie";
import { createMemoryLedger, resolveLedger } from "./ledger";
import { activeCookiePurposes } from "./purposes";
import { nextStatus, parseCookieChoiceInput, recordCookieChoice } from "./service";

const ctx = { ip: "203.0.113.7", userAgent: "vitest", source: "web" as const };
const v = NOTICES.cookies.version;

describe("consent cookie", () => {
  it("round-trips a choice and holds no personal data", () => {
    const raw = serializeChoice({ version: v, analytics: true, advertising: false, decidedAt: 1_700_000_000 });
    expect(raw).toBe(`1.${v}.a1.d0.1700000000`);
    expect(parseChoice(raw, v)).toEqual({ version: v, analytics: true, advertising: false, decidedAt: 1_700_000_000 });
  });

  it("treats a choice under an older Cookie Policy, or a tampered value, as no choice (ask again, all off)", () => {
    expect(parseChoice(`1.2020-01-01.a1.d1.1`, v)).toBeNull();
    expect(parseChoice(`1.${v}.a2.d0.1`, v)).toBeNull();
    expect(parseChoice(`<script>`, v)).toBeNull();
    expect(parseChoice(undefined, v)).toBeNull();
  });

  it("reads a cookie from a header", () => {
    expect(readCookie("a=1; ah_vid=abc; b=2", "ah_vid")).toBe("abc");
    expect(readCookie(null, "ah_vid")).toBeUndefined();
  });
});

describe("consent input validation (server)", () => {
  it("accepts only booleans for known purposes and a known method", () => {
    expect(parseCookieChoiceInput({ analytics: false, advertising: true, method: "cookie_banner" })).toEqual({
      choice: { analytics: false, advertising: true },
      method: "cookie_banner",
    });
    expect(() => parseCookieChoiceInput({ analytics: "yes", advertising: false, method: "cookie_banner" })).toThrow(ValidationError);
    expect(() => parseCookieChoiceInput({ analytics: true, advertising: true, method: "silence" })).toThrow(ValidationError);
    expect(() => parseCookieChoiceInput({ analytics: true, advertising: true, method: "preferences", user_id: "x" })).toThrow(ValidationError);
    expect(() => parseCookieChoiceInput([])).toThrow(ValidationError);
  });
});

describe("consent ledger", () => {
  it("optional purposes are only offered when the tracker is configured", () => {
    expect(activeCookiePurposes({ ga4Id: null, metaPixelId: null })).toEqual([]);
    expect(activeCookiePurposes({ ga4Id: "G-ABC1234", metaPixelId: null })).toEqual(["analytics"]);
  });

  it("records one row per offered purpose with notice version, time, IP, UA and source", async () => {
    const ledger = createMemoryLedger();
    const now = new Date("2026-11-22T10:00:00Z");
    const { choice, records } = await recordCookieChoice(ledger, {
      visitorId: "v1",
      choice: { analytics: true, advertising: false },
      method: "cookie_banner",
      activePurposes: ["analytics", "advertising"],
      ctx,
      now,
    });
    expect(choice).toMatchObject({ analytics: true, advertising: false, version: v });
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      visitor_id: "v1",
      purpose: "analytics",
      status: "granted",
      method: "cookie_banner",
      source: "web",
      ip_address: "203.0.113.7",
      user_agent: "vitest",
      created_at: now.toISOString(),
    });
    expect(records[0].notice_version).toContain(`cookies@${v}`);
    expect(records[1]).toMatchObject({ purpose: "advertising", status: "denied" });
  });

  it("switching a granted purpose off is recorded as withdrawn", async () => {
    const ledger = createMemoryLedger();
    const base = { visitorId: "v2", activePurposes: ["analytics" as const], ctx };
    await recordCookieChoice(ledger, { ...base, choice: { analytics: true, advertising: false }, method: "cookie_banner" });
    const { records } = await recordCookieChoice(ledger, { ...base, choice: NO_OPTIONAL_COOKIES, method: "consent_settings" });
    expect(records[0].status).toBe("withdrawn");
    expect((await ledger.listByVisitor("v2")).map((r) => r.status)).toEqual(["granted", "withdrawn"]);
  });

  it("a purpose without a configured tracker can't be granted (forced off, not recorded)", async () => {
    const ledger = createMemoryLedger();
    const { choice, records } = await recordCookieChoice(ledger, {
      visitorId: "v3",
      choice: { analytics: true, advertising: true },
      method: "cookie_banner",
      activePurposes: [],
      ctx,
    });
    expect(choice.analytics).toBe(false);
    expect(choice.advertising).toBe(false);
    expect(records).toEqual([]);
  });

  it("is append-only: no update/delete API and rows are immutable", async () => {
    const ledger = createMemoryLedger();
    expect(Object.keys(ledger).sort()).toEqual(["append", "listBySubscriber", "listByVisitor"]);
    const [row] = await ledger.append([
      { user_id: null, visitor_id: "v4", subscriber_id: null, purpose: "analytics", status: "granted", method: "preferences", source: "web", notice_version: "x", ip_address: "1.1.1.1", user_agent: "" },
    ]);
    expect(() => {
      (row as { status: string }).status = "denied";
    }).toThrow();
  });

  it("status transitions", () => {
    expect(nextStatus(undefined, false)).toBe("denied");
    expect(nextStatus("denied", false)).toBe("denied");
    expect(nextStatus("granted", false)).toBe("withdrawn");
    expect(nextStatus("withdrawn", true)).toBe("granted");
  });

  it("fails closed in production without a real database", async () => {
    await expect(resolveLedger({ NODE_ENV: "production" }).listByVisitor("v")).rejects.toThrow(/no production backend/);
  });
});
