import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildPincodeDirectory } from "@/lib/geo/pincodes";
import { createMemoryProviderStore } from "@/lib/providers/store";
import { setLiveShiprocket } from "./runtime";
import { activateShipping, saveShipping, shippingPayload, testShipping } from "./service";
import { forgetShiprocketTokens, SHIPROCKET_HOST, shiprocketCheck, ShiprocketError, type ShiprocketConfig } from "./shiprocket";

/**
 * Shiprocket delivery checks + Admin → Shipping. A fake Shiprocket answers every call; nothing leaves the machine.
 * Abuse / failure cases: wrong credentials, expired token, outage, odd answers, SSRF (host fixed), secret leakage,
 * going live untested.
 */
const CFG: ShiprocketConfig = { email: "api-user@shop.example", password: "s3cret-pass!", pickupPincode: "411045", weightKg: 0.5 };
const NOW = new Date("2026-12-02T05:00:00Z"); // 10:30 IST, before the 2 pm cut-off

type Call = { url: string; init: RequestInit };
function fakeShiprocket(opts: { login?: number; couriers?: unknown[]; serviceStatus?: number; recommended?: number; expireOnce?: boolean } = {}) {
  const calls: Call[] = [];
  let expired = !!opts.expireOnce;
  const fetcher = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (url.endsWith("/v1/external/auth/login")) {
      const status = opts.login ?? 200;
      return new Response(JSON.stringify(status === 200 ? { token: `tok_${"x".repeat(40)}_${calls.length}` } : { message: "Invalid email and password combination" }), { status });
    }
    if (expired) {
      expired = false;
      return new Response(JSON.stringify({ message: "Token has expired" }), { status: 401 });
    }
    const list = opts.couriers ?? [
      { courier_company_id: 10, courier_name: "Delhivery Surface", estimated_delivery_days: "4", cod: 1, city: "Pune", state: "Maharashtra" },
      { courier_company_id: 20, courier_name: "Blue Dart Air", estimated_delivery_days: "1", cod: 0, city: "Pune", state: "Maharashtra" },
    ];
    return new Response(JSON.stringify({ status: 200, data: { available_courier_companies: list, recommended_courier_company_id: opts.recommended ?? 10 } }), { status: opts.serviceStatus ?? 200 });
  };
  return { calls, fetcher };
}

beforeEach(() => forgetShiprocketTokens());
afterEach(() => setLiveShiprocket(null));

describe("Shiprocket client", () => {
  it("signs in once (token cached), checks the pincode, maps the promise; only the fixed host, no redirects", async () => {
    const f = fakeShiprocket();
    const a = await shiprocketCheck(CFG, "411001", f.fetcher, NOW);
    const b = await shiprocketCheck(CFG, "411002", f.fetcher, NOW);
    expect(f.calls.filter((c) => c.url.endsWith("/auth/login"))).toHaveLength(1);
    const login = f.calls[0];
    expect(login.init.method).toBe("POST");
    expect(JSON.parse(String(login.init.body))).toEqual({ email: CFG.email, password: CFG.password });
    const svc = new URL(f.calls[1].url);
    expect(svc.origin).toBe(SHIPROCKET_HOST);
    expect(svc.pathname).toBe("/v1/external/courier/serviceability/");
    expect(Object.fromEntries(svc.searchParams)).toEqual({ pickup_postcode: "411045", delivery_postcode: "411001", weight: "0.5", cod: "0" });
    expect((f.calls[1].init.headers as Record<string, string>).authorization).toMatch(/^Bearer tok_/);
    for (const c of f.calls) {
      expect(c.url.startsWith(SHIPROCKET_HOST)).toBe(true);
      expect(c.init.redirect).toBe("error");
      expect(c.url).not.toContain(CFG.password);
    }
    // recommended courier = 4 days → Mon 7 Dec (Sunday skipped); express = the 1-day courier; COD from any courier
    expect(a).toMatchObject({ pincode: "411001", serviceable: true, city: "Pune", state: "Maharashtra", standardBy: "2026-12-07", express: { by: "2026-12-03" }, cod: { available: true }, couriers: 2 });
    expect(b.pincode).toBe("411002");
  });

  it("an expired token: signs in again once and retries", async () => {
    const f = fakeShiprocket({ expireOnce: true });
    await shiprocketToken0(f.fetcher); // prime the cache with a token that the next call will reject
    const r = await shiprocketCheck(CFG, "411001", f.fetcher, NOW);
    expect(r.serviceable).toBe(true);
    expect(f.calls.filter((c) => c.url.endsWith("/auth/login"))).toHaveLength(2);
  });

  it("no courier → not serviceable; odd / missing fields don't break it", async () => {
    expect(await shiprocketCheck(CFG, "744101", fakeShiprocket({ couriers: [], serviceStatus: 404 }).fetcher, NOW)).toMatchObject({ serviceable: false, cod: { available: false } });
    const odd = await shiprocketCheck(CFG, "560001", fakeShiprocket({ couriers: [{ courier_name: "<script>x</script>", estimated_delivery_days: "abc", cod: "yes" }, "junk", null] }).fetcher, NOW);
    expect(odd.serviceable).toBe(true);
    expect(odd.city).toBeUndefined();
    expect(odd.cod.available).toBe(false);
    expect(odd.standardBy).toBe("2026-12-09"); // no usable estimate → 6 business days
  });

  it("wrong credentials → auth error; Shiprocket down → unreachable; bad pincode refused before any call", async () => {
    await expect(shiprocketCheck(CFG, "411001", fakeShiprocket({ login: 401 }).fetcher, NOW)).rejects.toMatchObject({ code: "auth" });
    const down = async () => {
      throw new Error("ECONNREFUSED");
    };
    await expect(shiprocketCheck(CFG, "411001", down, NOW)).rejects.toMatchObject({ code: "unreachable" });
    const f = fakeShiprocket();
    await expect(shiprocketCheck(CFG, "41100", f.fetcher, NOW)).rejects.toBeInstanceOf(ShiprocketError);
    expect(f.calls).toHaveLength(0);
  });
});

async function shiprocketToken0(fetcher: (u: string, i: RequestInit) => Promise<Response>) {
  const { shiprocketToken } = await import("./shiprocket");
  await shiprocketToken(CFG, fetcher, NOW.getTime());
}

describe("Admin → Shipping service", () => {
  const body = { email: CFG.email, password: CFG.password, pickupPincode: "411045", weightKg: 0.5 };

  it("validates; the password is write-only and never in the payload; blank keeps it", async () => {
    const store = createMemoryProviderStore();
    await expect(saveShipping(store, { ...body, email: "nope" }, "stf_1")).rejects.toMatchObject({ fields: { email: expect.any(String) } });
    await expect(saveShipping(store, { ...body, pickupPincode: "12" }, "stf_1")).rejects.toMatchObject({ fields: { pickupPincode: expect.any(String) } });
    await expect(saveShipping(store, { ...body, weightKg: 99 }, "stf_1")).rejects.toMatchObject({ fields: { weightKg: expect.any(String) } });
    await expect(saveShipping(store, { ...body, host: "https://evil.example" }, "stf_1")).rejects.toThrow(); // no URL field exists
    const saved = await saveShipping(store, body, "stf_1");
    expect(JSON.stringify(saved.payload)).not.toContain(CFG.password);
    expect(saved.payload).toMatchObject({ configured: true, active: false, verified: false, passwordSet: true, fields: { email: "a•••@shop.example", pickupPincode: "411045", weightKg: 0.5 } });
    // blank password + blank email = keep
    const again = await saveShipping(store, { email: "", password: "", pickupPincode: "411045", weightKg: 0.5 }, "stf_1");
    expect(again.payload.passwordSet).toBe(true);
  });

  it("can't go live untested; a passing test unlocks it; live then answers delivery checks; off again", async () => {
    const store = createMemoryProviderStore();
    await saveShipping(store, body, "stf_1");
    await expect(activateShipping(store, "shiprocket", "stf_1")).rejects.toMatchObject({ code: "not_verified" });
    const failed = await testShipping(store, { pincode: "411001" }, "stf_1", { fetcher: fakeShiprocket({ login: 401 }).fetcher, now: NOW });
    expect(failed.ok).toBe(false);
    await expect(activateShipping(store, "shiprocket", "stf_1")).rejects.toMatchObject({ code: "not_verified" });
    const ok = await testShipping(store, { pincode: "411001" }, "stf_1", { fetcher: fakeShiprocket().fetcher, now: NOW });
    expect(ok.ok).toBe(true);
    expect(ok.message).toMatch(/2 couriers deliver to 411001 \(Pune, Maharashtra\)/);
    const live = await activateShipping(store, "shiprocket", "stf_1");
    expect(live.liveChanged).toBe(true);
    expect((await shippingPayload(store)).mode).toBe("shiprocket");
    const off = await activateShipping(store, "off", "stf_1");
    expect(off.liveChanged).toBe(true);
    expect((await shippingPayload(store)).active).toBe(false);
    await expect(activateShipping(store, "dhl", "stf_1")).rejects.toMatchObject({ status: 422 });
  });

  it("changing the LIVE account is tested before it is saved — a failing change keeps the old settings", async () => {
    const store = createMemoryProviderStore();
    await saveShipping(store, body, "stf_1");
    await testShipping(store, {}, "stf_1", { fetcher: fakeShiprocket().fetcher, now: NOW });
    await activateShipping(store, "shiprocket", "stf_1");
    await expect(saveShipping(store, { ...body, password: "wrong-password" }, "stf_1", { fetcher: fakeShiprocket({ login: 401 }).fetcher, now: NOW })).rejects.toMatchObject({ code: "test_failed" });
    const rows = await store.list<{ shiprocket: ShiprocketConfig }>("shipping");
    expect(rows[0].doc?.shiprocket.password).toBe(CFG.password);
  });

  it("test needs saved settings and a valid pincode", async () => {
    const store = createMemoryProviderStore();
    await expect(testShipping(store, {}, "stf_1")).rejects.toMatchObject({ code: "not_configured" });
    await saveShipping(store, body, "stf_1");
    await expect(testShipping(store, { pincode: "abc" }, "stf_1")).rejects.toMatchObject({ status: 422 });
  });
});

describe("India Post pincode directory", () => {
  it("finds the columns by name, keeps the first office per pincode, title-cases, handles quotes", () => {
    const csv = [
      "﻿circename,regionname,divisionname,officename,pincode,officetype,delivery,district,statename,latitude,longitude",
      'Maharashtra Circle,Pune Region,Pune City East,"Kalyani Nagar S.O, Pune",411006,S.O,Delivery,PUNE,MAHARASHTRA,18.5,73.9',
      "Maharashtra Circle,Pune Region,Pune City East,Yerawada S.O,411006,S.O,Delivery,PUNE,MAHARASHTRA,18.5,73.9",
      "Delhi Circle,Delhi,New Delhi Central,Connaught Place S.O,110001,S.O,Delivery,NEW DELHI,DELHI,28.6,77.2",
      "Andaman Circle,,,Port Blair H.O,744101,H.O,Delivery,SOUTH ANDAMAN,ANDAMAN AND NICOBAR ISLANDS,11.6,92.7",
      "bad,row,,x,12345,,,,",
    ].join("\n");
    const { directory, rows } = buildPincodeDirectory(csv);
    expect(rows).toBe(4);
    expect(directory).toEqual({ "411006": ["Pune", "Maharashtra"], "110001": ["New Delhi", "Delhi"], "744101": ["South Andaman", "Andaman and Nicobar Islands"] });
    expect(() => buildPincodeDirectory("a,b\n1,2")).toThrow(/columns/);
  });
});
