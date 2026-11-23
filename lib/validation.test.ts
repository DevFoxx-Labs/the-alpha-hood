import { describe, expect, it } from "vitest";
import { ValidationError } from "@/lib/http/guard";
import { createRateLimiter } from "@/lib/http/rate-limit";
import { cleanText, maskContact, normaliseEmail, normaliseIndianMobile } from "./validation";

describe("validators", () => {
  it("normalises Indian mobiles and rejects the rest", () => {
    expect(normaliseIndianMobile("98765 43210")).toBe("+919876543210");
    expect(normaliseIndianMobile("+91-98765-43210")).toBe("+919876543210");
    expect(normaliseIndianMobile("09876543210")).toBe("+919876543210");
    expect(normaliseIndianMobile("5876543210")).toBeNull();
    expect(normaliseIndianMobile("98765")).toBeNull();
    expect(normaliseIndianMobile(9876543210)).toBeNull();
  });

  it("normalises emails and rejects injection-y values", () => {
    expect(normaliseEmail("  Ravi@Example.COM ")).toBe("ravi@example.com");
    expect(normaliseEmail("a@b")).toBeNull();
    expect(normaliseEmail("a@b.co\r\nBcc: x@y.z")).toBeNull();
    expect(normaliseEmail(`${"a".repeat(250)}@b.co`)).toBeNull();
  });

  it("strips control characters and enforces lengths", () => {
    expect(cleanText(" hi\u0000 there ", "x", { max: 20 })).toBe("hi  there");
    expect(cleanText("line1\r\nline2", "x", { max: 20, multiline: true })).toBe("line1\nline2");
    expect(() => cleanText("", "Name", { min: 2, max: 10 })).toThrow(ValidationError);
    expect(() => cleanText("x".repeat(11), "Name", { max: 10 })).toThrow(ValidationError);
  });

  it("masks contacts for display/logs", () => {
    expect(maskContact("ravi@example.com")).toBe("ra***@example.com");
    expect(maskContact("+919876543210")).toBe("+91******3210");
  });
});

describe("rate limiter", () => {
  it("allows `limit` hits per window then blocks until reset", async () => {
    const rl = createRateLimiter();
    for (let i = 0; i < 3; i++) expect((await rl.hit("k", 3, 1_000, 0)).ok).toBe(true);
    const blocked = await rl.hit("k", 3, 1_000, 500);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(1);
    expect((await rl.hit("k", 3, 1_000, 1_000)).ok).toBe(true);
  });

  it("falls back to in-process counters when the shared store fails (limits never switch off)", async () => {
    const rl = createRateLimiter(() => ({
      hit: async () => Promise.reject(new Error("db down")),
      peek: async () => Promise.reject(new Error("db down")),
    }));
    for (let i = 0; i < 2; i++) expect((await rl.hit("k", 2, 1_000, 0)).ok).toBe(true);
    expect((await rl.hit("k", 2, 1_000, 0)).ok).toBe(false);
    expect(await rl.peek("k", 2, 1_000, 0)).toBe(false);
  });
});
