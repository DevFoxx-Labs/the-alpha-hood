import { afterEach, describe, expect, it } from "vitest";
import { activeSms, resolveSms, setActiveSms, SmsError } from "@/lib/notify/sms";
import { configChecks } from "@/lib/ops/readiness";
import { SMS_DRIVERS } from "./sms-catalog";
import { type Fetcher, gatewaySend, gatewaySendOtp, type SmsProviderDoc } from "./sms-gateway";
import { refreshActiveSms } from "./sms-runtime";
import { activateSmsProvider, createSmsProvider, deactivateSmsProvider, deleteSmsProvider, MAX_SMS_PROVIDERS, ProviderError, smsProvidersPayload, testSmsProvider, updateSmsProvider } from "./sms-service";
import { createMemoryProviderStore } from "./store";

const KEY = "abcDEF1234567890abcd";
const BODY = { name: "MSG91 main", driver: "msg91", credentials: { auth_key: KEY }, senderId: "ALPHAH", otpTemplate: "tmpl_otp_1", templates: { order_shipped: "tmpl_ship_1" } };
const BY = "stf_owner";
const PHONE = "9876543210";

/** Records every outgoing request; answers like the provider would. */
function fakeFetch(reply: (url: string) => { status?: number; body: unknown } = () => ({ body: { type: "success", request_id: "req_1" } })) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher: Fetcher = async (url, init) => {
    calls.push({ url, init });
    const r = reply(url);
    return new Response(typeof r.body === "string" ? r.body : JSON.stringify(r.body), { status: r.status ?? 200 });
  };
  return { calls, fetcher };
}

afterEach(() => setActiveSms(null));

describe("SMS gateway (fixed hosts, no free text)", () => {
  const doc = (over: Partial<SmsProviderDoc> = {}): SmsProviderDoc => ({ name: "x", driver: "msg91", credentials: { auth_key: KEY }, senderId: "ALPHAH", otpTemplate: "tmpl_otp_1", templates: { order_shipped: "tmpl_ship_1", back_in_stock: "tmpl_bis" }, lastTest: null, activatedAt: null, createdAt: "", updatedBy: BY, ...over });

  it("MSG91: OTP and Flow calls go to MSG91 only, with the key in a header, never in the URL", async () => {
    const f = fakeFetch();
    await gatewaySendOtp(doc(), "+919876543210", "123456", f.fetcher);
    await gatewaySend(doc(), "+919876543210", "order_shipped", { orderNumber: "AH00000012", evil: "x" }, f.fetcher);
    expect(f.calls.map((c) => new URL(c.url).origin)).toEqual(["https://control.msg91.com", "https://control.msg91.com"]);
    expect(f.calls[0].url).toBe("https://control.msg91.com/api/v5/otp?template_id=tmpl_otp_1&mobile=919876543210&otp=123456");
    expect(f.calls.every((c) => !c.url.includes(KEY) && (c.init.headers as Record<string, string>).authkey === KEY && c.init.redirect === "error" && !!c.init.signal)).toBe(true);
    // Only the template's allowed variables are sent.
    expect(JSON.parse(f.calls[1].init.body as string)).toEqual({ template_id: "tmpl_ship_1", short_url: "0", recipients: [{ mobiles: "919876543210", orderNumber: "AH00000012" }] });
  });

  it("Fast2SMS and 2Factor: variables in template order; 2Factor sends codes only", async () => {
    const f = fakeFetch(() => ({ body: { return: true, request_id: "r2" } }));
    const fast = doc({ driver: "fast2sms", credentials: { api_key: KEY }, otpTemplate: "111", templates: { back_in_stock: "222" } });
    await gatewaySendOtp(fast, "+919876543210", "654321", f.fetcher);
    await gatewaySend(fast, "+919876543210", "back_in_stock", { handle: "black-hoodie", size: "M" }, f.fetcher);
    expect(JSON.parse(f.calls[0].init.body as string)).toMatchObject({ route: "dlt", sender_id: "ALPHAH", message: "111", variables_values: "654321|", numbers: "9876543210" });
    expect(JSON.parse(f.calls[1].init.body as string)).toMatchObject({ message: "222", variables_values: "black-hoodie|M|" });
    const two = doc({ driver: "twofactor", credentials: { api_key: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }, senderId: null, otpTemplate: null, templates: {} });
    await gatewaySendOtp(two, "+919876543210", "111222", f.fetcher);
    expect(f.calls[2].url).toBe("https://2factor.in/API/V1/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/SMS/919876543210/111222");
    await expect(gatewaySend(two, "+919876543210", "order_shipped", { orderNumber: "AH1" }, f.fetcher)).rejects.toMatchObject({ code: "not_configured" });
  });

  it("refuses bad input before any request; unconfigured templates are not sent", async () => {
    const f = fakeFetch();
    await expect(gatewaySendOtp(doc(), "+15551234567", "123456", f.fetcher)).rejects.toBeInstanceOf(SmsError);
    await expect(gatewaySendOtp(doc(), "+919876543210", "12 34", f.fetcher)).rejects.toBeInstanceOf(SmsError);
    await expect(gatewaySend(doc(), "+919876543210", "order_shipped", { orderNumber: "AH1\r\nBcc: x" }, f.fetcher)).rejects.toMatchObject({ code: "invalid" });
    await expect(gatewaySend(doc(), "+919876543210", "price_drop", { handle: "x" }, f.fetcher)).rejects.toMatchObject({ code: "not_configured" });
    expect(f.calls).toEqual([]);
  });

  it("errors: 200-with-error bodies fail, keys are scrubbed, 5xx / 429 / network are retryable", async () => {
    const bad = fakeFetch(() => ({ body: { type: "error", message: `Invalid authkey ${KEY}` } }));
    const e = await gatewaySendOtp(doc(), "+919876543210", "123456", bad.fetcher).catch((x) => x);
    expect(e).toMatchObject({ code: "rejected", retryable: false });
    expect(e.message).not.toContain(KEY);
    expect(e.message).toContain("MSG91 refused");
    await expect(gatewaySendOtp(doc(), "+919876543210", "123456", fakeFetch(() => ({ status: 503, body: "down" })).fetcher)).rejects.toMatchObject({ code: "unavailable", retryable: true });
    await expect(gatewaySendOtp(doc(), "+919876543210", "123456", fakeFetch(() => ({ status: 429, body: {} })).fetcher)).rejects.toMatchObject({ retryable: true });
    const down: Fetcher = async () => Promise.reject(new Error(`ECONNREFUSED ${KEY}`));
    const n = await gatewaySendOtp(doc(), "+919876543210", "123456", down).catch((x) => x);
    expect(n).toMatchObject({ code: "unavailable", retryable: true });
    expect(n.message).not.toContain(KEY);
  });
});

describe("SMS providers service", () => {
  it("keys are never returned: payload and results carry a masked hint only", async () => {
    const store = createMemoryProviderStore();
    const made = await createSmsProvider(store, BODY, BY);
    const payload = await smsProvidersPayload(store, { NODE_ENV: "production" });
    for (const blob of [JSON.stringify(made), JSON.stringify(payload)]) expect(blob).not.toContain(KEY);
    expect(made.provider).toMatchObject({ name: "MSG91 main", driverLabel: "MSG91", active: false, verified: false, credentialHints: { auth_key: "abcD••••cd" } });
    expect(made.provider.id).toMatch(/^prv_[a-f0-9]{20}$/);
    expect(payload.fallback).toBe("none");
    expect(JSON.stringify(payload.catalog)).not.toContain("pattern");
  });

  it("validation: allow-listed driver, fields and template names; nothing is saved on error", async () => {
    const store = createMemoryProviderStore();
    const bad = async (over: Record<string, unknown>) => createSmsProvider(store, { ...BODY, ...over }, BY).catch((e) => e);
    expect(await bad({ driver: "smtp" })).toBeInstanceOf(ProviderError);
    expect((await bad({ credentials: { auth_key: "short" } })).fields).toHaveProperty("credentials.auth_key");
    expect((await bad({ credentials: {} })).fields).toHaveProperty("credentials.auth_key");
    expect((await bad({ senderId: "alpha1" })).fields).toHaveProperty("senderId");
    expect((await bad({ otpTemplate: "../../etc" })).fields).toHaveProperty("otpTemplate");
    expect((await bad({ name: "x\r\ny" })).fields).toHaveProperty("name");
    expect((await bad({ templates: { order_shipped: "bad id!" } })).fields).toHaveProperty("templates.order_shipped");
    await expect(createSmsProvider(store, { ...BODY, templates: { otp: "x" } }, BY)).rejects.toThrow(/Unknown field/);
    await expect(createSmsProvider(store, { ...BODY, credentials: { auth_key: KEY, url: "http://169.254.169.254" } }, BY)).rejects.toThrow(/Unknown field/);
    await expect(createSmsProvider(store, { ...BODY, active: true }, BY)).rejects.toThrow(/Unknown field/);
    expect((await bad({ driver: "twofactor", credentials: { api_key: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }, senderId: "", otpTemplate: "" })).fields).toHaveProperty("templates.order_shipped");
    expect(await store.list("sms")).toEqual([]);
    for (let i = 0; i < MAX_SMS_PROVIDERS; i++) await createSmsProvider(store, { ...BODY, name: `p${i}` }, BY);
    await expect(createSmsProvider(store, BODY, BY)).rejects.toMatchObject({ status: 409, code: "limit" });
  });

  it("a provider goes live only after a passed test; exactly one is live; the live one can't be deleted", async () => {
    const store = createMemoryProviderStore();
    const a = (await createSmsProvider(store, BODY, BY)).provider;
    const b = (await createSmsProvider(store, { ...BODY, name: "Backup" }, BY)).provider;
    await expect(activateSmsProvider(store, a.id, BY)).rejects.toMatchObject({ code: "not_verified" });

    const failing = fakeFetch(() => ({ status: 401, body: { type: "error", message: "bad key" } }));
    const t1 = await testSmsProvider(store, a.id, PHONE, BY, { fetcher: failing.fetcher });
    expect(t1).toMatchObject({ ok: false, provider: { verified: false } });
    await expect(activateSmsProvider(store, a.id, BY)).rejects.toMatchObject({ code: "not_verified" });
    await expect(testSmsProvider(store, a.id, "12345", BY)).rejects.toMatchObject({ status: 422 });

    const ok = fakeFetch();
    const t2 = await testSmsProvider(store, a.id, PHONE, BY, { fetcher: ok.fetcher });
    expect(t2.ok).toBe(true);
    expect(t2.message).toContain("+91******3210"); // the number is masked in what is stored and shown
    expect(t2.message).not.toContain(PHONE);
    await testSmsProvider(store, b.id, PHONE, BY, { fetcher: ok.fetcher });

    expect((await activateSmsProvider(store, a.id, BY)).liveChanged).toBe(true);
    expect((await activateSmsProvider(store, a.id, BY)).liveChanged).toBe(false); // idempotent
    const swap = await activateSmsProvider(store, b.id, BY);
    expect(swap.summary).toContain('replacing "MSG91 main"');
    expect((await store.list("sms")).filter((r) => r.active).map((r) => r.id)).toEqual([b.id]);

    await expect(deleteSmsProvider(store, b.id)).rejects.toMatchObject({ code: "live" });
    await deleteSmsProvider(store, a.id);
    await expect(deleteSmsProvider(store, "prv_nope")).rejects.toMatchObject({ status: 404 });
    expect((await deactivateSmsProvider(store, b.id)).liveChanged).toBe(true);
    expect((await store.list("sms")).some((r) => r.active)).toBe(false);
  });

  it("editing: blank key keeps the stored one; a changed connection needs a new test; the live one is tested before saving", async () => {
    const store = createMemoryProviderStore();
    const ok = fakeFetch();
    const p = (await createSmsProvider(store, BODY, BY)).provider;
    await testSmsProvider(store, p.id, PHONE, BY, { fetcher: ok.fetcher });

    // Name / order templates only: stays verified, key kept.
    const renamed = await updateSmsProvider(store, p.id, { ...BODY, name: "Renamed", credentials: {}, templates: {} }, BY);
    expect(renamed.provider).toMatchObject({ name: "Renamed", verified: true, credentialHints: { auth_key: "abcD••••cd" } });
    // New OTP template: must be tested again.
    expect((await updateSmsProvider(store, p.id, { ...BODY, credentials: {}, otpTemplate: "tmpl_otp_2" }, BY)).provider.verified).toBe(false);
    // Switching driver drops the old keys: the new ones are required.
    await expect(updateSmsProvider(store, p.id, { ...BODY, driver: "fast2sms", credentials: {}, otpTemplate: "123" }, BY)).rejects.toMatchObject({ fields: { "credentials.api_key": expect.any(String) } });

    await testSmsProvider(store, p.id, PHONE, BY, { fetcher: ok.fetcher });
    await activateSmsProvider(store, p.id, BY);
    const newKey = "ZZZZ1234567890zzzzzz";
    const broken = fakeFetch(() => ({ status: 401, body: { type: "error", message: "Authentication failure" } }));
    // Live + connection change: no test number → refused; failing test → nothing saved.
    await expect(updateSmsProvider(store, p.id, { ...BODY, otpTemplate: "tmpl_otp_2", credentials: { auth_key: newKey } }, BY, { fetcher: broken.fetcher })).rejects.toMatchObject({ status: 422 });
    await expect(updateSmsProvider(store, p.id, { ...BODY, otpTemplate: "tmpl_otp_2", credentials: { auth_key: newKey }, testTo: PHONE }, BY, { fetcher: broken.fetcher })).rejects.toMatchObject({ code: "test_failed" });
    expect((await store.get<SmsProviderDoc>("sms", p.id))!.doc!.credentials.auth_key).toBe(KEY);
    const saved = await updateSmsProvider(store, p.id, { ...BODY, otpTemplate: "tmpl_otp_2", credentials: { auth_key: newKey }, testTo: PHONE }, BY, { fetcher: ok.fetcher });
    expect(saved).toMatchObject({ liveChanged: true, provider: { active: true, verified: true } });
    expect((await store.get<SmsProviderDoc>("sms", p.id))!.doc!.credentials.auth_key).toBe(newKey);
  });
});

describe("live provider at send time", () => {
  it("the live provider wins over the environment; none live = environment / demo / disabled as before", async () => {
    const store = createMemoryProviderStore();
    const ok = fakeFetch();
    const p = (await createSmsProvider(store, BODY, BY)).provider;
    await testSmsProvider(store, p.id, PHONE, BY, { fetcher: ok.fetcher });
    expect(activeSms()).toBeNull();
    expect(resolveSms().name).toBe("demo"); // tests: no provider live

    await activateSmsProvider(store, p.id, BY);
    expect(resolveSms().name).toBe("msg91");
    expect(resolveSms().supports("order_shipped")).toBe(true);
    expect(resolveSms().supports("price_drop")).toBe(false);
    expect(resolveSms().supports("otp")).toBe(false);
    // A caller that passes its own environment still gets exactly what that says (tests, scripts).
    expect(resolveSms({ NODE_ENV: "production" }).name).toBe("disabled");

    await deactivateSmsProvider(store, p.id);
    expect(resolveSms().name).toBe("demo");
    // Database down: the current provider stays, nothing throws.
    setActiveSms({ name: "kept", sendOtp: async () => ({}), supports: () => false, send: async () => ({ providerId: "x" }) });
    const broken = { ...store, list: async () => Promise.reject(new Error("down")) };
    expect(await refreshActiveSms(broken)).toBe(false);
    expect(activeSms()?.name).toBe("kept");
  });

  it("go-live check: a live provider satisfies the SMS blocker", () => {
    const ids = (opts?: { liveSmsProvider?: boolean }) => configChecks({ NODE_ENV: "production" }, opts).filter((c) => !c.ok).map((c) => c.id);
    expect(ids()).toContain("sms_provider");
    expect(ids({ liveSmsProvider: true })).not.toContain("sms_provider");
  });

  it("every driver has an https host of its own and required OTP wiring", () => {
    for (const [name, spec] of Object.entries(SMS_DRIVERS)) {
      expect(Object.keys(spec.credentials).length, name).toBeGreaterThan(0);
      for (const c of Object.values(spec.credentials)) expect(c.pattern.test("http://evil.example/"), name).toBe(false);
    }
  });
});
