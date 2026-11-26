import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as emailConfirm } from "@/app/api/account/email/confirm/route";
import { POST as emailSend } from "@/app/api/account/email/send/route";
import { PATCH as mePATCH } from "@/app/api/account/me/route";
import { POST as otpSend } from "@/app/api/otp/send/route";
import { POST as otpVerify } from "@/app/api/otp/verify/route";
import { confirmEmailCode, sendEmailCode } from "@/lib/account/email-verify";
import { createOtpStore } from "@/lib/auth/otp";
import { createMemoryLedger } from "@/lib/consent/ledger";
import { createMemoryCustomerStore, resolveCustomers } from "@/lib/customers/store";
import { rateLimiter } from "@/lib/http/rate-limit";
import { checkDevice, deviceLabel, DEVICE_COOKIE } from "@/lib/security/devices";
import { securityPolicy } from "@/lib/security/policy";
import { applySettings, resetSettingsRuntime } from "@/lib/settings/runtime";
import { saveSettingsGroup } from "@/lib/settings/service";
import { createMemorySettingsStore } from "@/lib/settings/store";
import { allowsWith, cleanSwitches, NOTIFY_EVENTS } from "./catalog";
import { deliverOutbox } from "./delivery";
import { createDemoEmail, type EmailAdapter } from "./email";
import { renderEmail } from "./email-templates";
import { channelsFor, createMemoryOutbox, type Template } from "./outbox";
import { allows } from "./switches";
import { notificationsPayload, saveNotifications } from "./switches-service";

const BY = "stf_owner";
afterEach(() => resetSettingsRuntime());

describe("notification switches (Admin → Settings → Notifications)", () => {
  it("catalogue: every outbox message has a switch; marketing and the new-device alert never go by SMS", () => {
    expect(Object.keys(NOTIFY_EVENTS).sort()).toContain("new_device_sign_in");
    for (const t of ["abandoned_checkout_1h", "abandoned_checkout_24h", "new_device_sign_in"] as Template[]) expect(allowsWith({}, t, "sms"), t).toBe(false);
    expect(allowsWith({}, "order_shipped", "sms")).toBe(true);
    expect(allowsWith({}, "order_packed", "sms")).toBe(false); // default off
    expect(allowsWith({ order_shipped: { sms: false } }, "order_shipped", "sms")).toBe(false);
    expect(allowsWith({ abandoned_checkout_1h: { sms: true } } as never, "abandoned_checkout_1h", "sms")).toBe(false); // a switch can't add a channel
    expect(cleanSwitches({ order_shipped: { sms: "yes", email: false, whatsapp: true }, bogus: { sms: true } })).toEqual({ order_shipped: { email: false } });
  });

  it("save: only catalogued events and channels; in force at once; audit-friendly list of what changed", async () => {
    const store = createMemorySettingsStore();
    await expect(saveNotifications(store, { channels: { otp: { sms: false } } }, BY)).rejects.toThrow(/Unknown field/);
    await expect(saveNotifications(store, { channels: { abandoned_checkout_1h: { sms: true } } }, BY)).rejects.toThrow(/Unknown field/);
    await expect(saveNotifications(store, { channels: {}, role: "owner" }, BY)).rejects.toThrow(/Unknown field/);
    expect(allows("order_shipped", "sms")).toBe(true);
    const r = await saveNotifications(store, { channels: { order_shipped: { sms: false }, order_confirmed: { email: true } } }, BY);
    expect(r.changed).toEqual(["order_shipped.sms"]); // email was already on
    expect(allows("order_shipped", "sms")).toBe(false);
    expect(r.payload.events.find((e) => e.key === "order_shipped")!.channels).toEqual({ sms: false, email: true });
    // Another server: reading the same rows applies the same switches.
    resetSettingsRuntime();
    expect(allows("order_shipped", "sms")).toBe(true);
    applySettings(await store.all());
    expect(allows("order_shipped", "sms")).toBe(false);
    expect((await notificationsPayload(store)).alwaysOn.length).toBeGreaterThan(3);
  });

  it("queueing: admin switches remove channels; customer consent still decides marketing", async () => {
    const ledger = createMemoryLedger();
    expect(await channelsFor("cus_x", "order_shipped", ledger)).toEqual(["sms", "email"]);
    await saveNotifications(createMemorySettingsStore(), { channels: { order_shipped: { sms: false, email: false } } }, BY);
    expect(await channelsFor("cus_x", "order_shipped", ledger)).toEqual([]);
    expect(await channelsFor("cus_x", "abandoned_checkout_1h", ledger)).toEqual([]); // no marketing consent
    expect(await channelsFor("cus_x", "new_device_sign_in", ledger)).toEqual(["email"]);
  });
});

describe("email delivery from the outbox", () => {
  const sms = { name: "test", sendOtp: async () => ({}), supports: () => true, send: async () => ({ providerId: "s1" }) };
  const setup = async (opts: { verified: boolean; email?: string | null }) => {
    const customers = createMemoryCustomerStore();
    const { customer } = await customers.findOrCreateByPhone("+919811100001");
    if (opts.email !== null) await customers.setEmail(customer.id, opts.email ?? "buyer@example.com", opts.verified);
    const outbox = createMemoryOutbox();
    const email = createDemoEmail();
    const push = (template: Template, refs: Record<string, string>) => outbox.push({ customerId: customer.id, template, channels: ["sms", "email"], refs, createdAt: new Date().toISOString(), status: "queued" });
    return { customers, customer, outbox, email, push };
  };

  it("sends the fixed template to a verified address; skips an unverified one while the policy asks for verified", async () => {
    const s = await setup({ verified: true });
    await s.push("order_shipped", { orderNumber: "AH00000123" });
    const report = await deliverOutbox({ outbox: s.outbox, sms, email: s.email, customers: s.customers });
    expect(report.sent).toBe(2); // sms + email
    expect(s.email.sent[0]).toMatchObject({ to: "buyer@example.com", subject: "Order AH00000123 has shipped" });
    expect(s.email.sent[0].text).toContain("/account/orders/AH00000123");

    const u = await setup({ verified: false });
    await u.push("order_shipped", { orderNumber: "AH00000124" });
    await deliverOutbox({ outbox: u.outbox, sms, email: u.email, customers: u.customers });
    expect(u.email.sent).toEqual([]);
    expect((await u.outbox.listFor(u.customer.id))[0].status).toBe("done");

    // Owner allows unverified addresses → it goes.
    const v = await setup({ verified: false });
    await v.push("order_shipped", { orderNumber: "AH00000125" });
    await deliverOutbox({ outbox: v.outbox, sms, email: v.email, customers: v.customers, env: { REQUIRE_VERIFIED_EMAIL: "false" } });
    expect(v.email.sent).toHaveLength(1);
  });

  it("a switch turned off after queueing stops the message; a provider outage is retried, a refusal is not", async () => {
    const s = await setup({ verified: true });
    await s.push("order_delivered", { orderNumber: "AH00000126" });
    await saveNotifications(createMemorySettingsStore(), { channels: { order_delivered: { email: false, sms: false } } }, BY);
    let smsSent = 0;
    await deliverOutbox({ outbox: s.outbox, sms: { ...sms, send: async () => (smsSent++, { providerId: "s" }) }, email: s.email, customers: s.customers });
    expect(s.email.sent).toEqual([]);
    expect(smsSent).toBe(0);
    resetSettingsRuntime();

    const down = await setup({ verified: true });
    await down.push("order_confirmed", { orderNumber: "AH00000127" });
    const outage: EmailAdapter = { name: "x", enabled: true, send: async () => Promise.reject(Object.assign(new Error("timeout"), { name: "EmailError", code: "unavailable" })) };
    const r = await deliverOutbox({ outbox: down.outbox, sms, email: outage, customers: down.customers });
    expect(r.retry).toBe(1);
    const off: EmailAdapter = { name: "x", enabled: false, send: async () => ({ providerId: "never" }) };
    const n = await setup({ verified: true });
    await n.push("order_confirmed", { orderNumber: "AH00000128" });
    await deliverOutbox({ outbox: n.outbox, sms, email: off, customers: n.customers });
    expect((await n.outbox.listFor(n.customer.id))[0].status).toBe("done"); // no_provider is not a failure
  });

  it("templates: only allow-listed, well-formed references; marketing has the opt-out line", () => {
    expect(() => renderEmail("order_shipped", {}, "a@b.co")).toThrow();
    expect(() => renderEmail("order_shipped", { orderNumber: "<script>" }, "a@b.co")).toThrow();
    const m = renderEmail("abandoned_checkout_1h", { evil: "\r\nBcc: x@y.z" }, "a@b.co");
    expect(m.text).not.toContain("Bcc");
    expect(m.text).toContain("agreed to marketing emails");
    const d = renderEmail("new_device_sign_in", { device: "Chrome on Android", when: "30 Nov 2026, 9:05 pm" }, "a@b.co");
    expect(d.text).toContain("Chrome on Android");
    expect(d.text).toContain("Sign out everywhere");
  });
});

describe("security settings (Admin → Settings → Security)", () => {
  it("policy: defaults are the safe ones; bad values fall back; bounds hold", () => {
    expect(securityPolicy({})).toEqual({ staffIdleMs: 30 * 60_000, staffSessionMs: 12 * 3_600_000, customerSessionMs: 30 * 86_400_000, requireVerifiedEmail: true, newDeviceAlertStaff: true, newDeviceAlertCustomers: true });
    expect(securityPolicy({ STAFF_SESSION_IDLE_MINUTES: "100000", CUSTOMER_SESSION_DAYS: "-3", STAFF_SESSION_HOURS: "2.5" })).toMatchObject({ staffIdleMs: 30 * 60_000, customerSessionMs: 30 * 86_400_000, staffSessionMs: 12 * 3_600_000 });
    expect(securityPolicy({ STAFF_SESSION_IDLE_MINUTES: "15", REQUIRE_VERIFIED_EMAIL: "false" })).toMatchObject({ staffIdleMs: 15 * 60_000, requireVerifiedEmail: false });
  });

  it("saving the Security group validates numbers and is in force at once", async () => {
    const env: Record<string, string | undefined> = { NODE_ENV: "test" };
    const store = createMemorySettingsStore();
    await expect(saveSettingsGroup(store, "security", { fields: { STAFF_SESSION_IDLE_MINUTES: "500" } }, BY, env)).rejects.toMatchObject({ fields: { STAFF_SESSION_IDLE_MINUTES: expect.stringMatching(/5 to 120/) } });
    await expect(saveSettingsGroup(store, "security", { fields: { CUSTOMER_SESSION_DAYS: "7.5" } }, BY, env)).rejects.toBeTruthy();
    await saveSettingsGroup(store, "security", { fields: { STAFF_SESSION_IDLE_MINUTES: "15", CUSTOMER_SESSION_DAYS: "7", NEW_DEVICE_ALERT_STAFF: false } }, BY, env);
    expect(securityPolicy(env)).toMatchObject({ staffIdleMs: 15 * 60_000, customerSessionMs: 7 * 86_400_000, newDeviceAlertStaff: false });
  });

  it("new device: a browser is new once per account; the label never leaks the raw user agent", async () => {
    const req = (cookie?: string) => new Request("http://localhost/x", { headers: cookie ? { cookie } : {} });
    const first = await checkDevice("customer", "cus_dev1", req());
    expect(first).toMatchObject({ isNew: true, setCookie: true });
    expect(first.deviceId).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const again = await checkDevice("customer", "cus_dev1", req(`${DEVICE_COOKIE}=${first.deviceId}`));
    expect(again).toMatchObject({ isNew: false, setCookie: false });
    expect((await checkDevice("customer", "cus_dev2", req(`${DEVICE_COOKIE}=${first.deviceId}`))).isNew).toBe(true); // other account, same browser
    expect((await checkDevice("staff", "cus_dev1", req(`${DEVICE_COOKIE}=${first.deviceId}`))).isNew).toBe(true); // staff and customers are separate
    expect((await checkDevice("customer", "cus_dev1", req(`${DEVICE_COOKIE}=../../x`))).setCookie).toBe(true); // a bad cookie is replaced
    expect(deviceLabel("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36")).toBe("Chrome on Android");
    expect(deviceLabel("<img src=x onerror=alert(1)>")).toBe("a browser on an unknown device");
  });
});

describe("email verification (customer)", () => {
  it("code → verified; a code can't verify another customer or a changed address; changing the email resets it", async () => {
    const customers = createMemoryCustomerStore();
    const otp = createOtpStore();
    const mailer = createDemoEmail();
    const a = (await customers.findOrCreateByPhone("+919811100002")).customer;
    const b = (await customers.findOrCreateByPhone("+919811100003")).customer;
    await expect(sendEmailCode(a.id, { customers, otp, mailer })).rejects.toMatchObject({ code: "no_email" });
    await customers.setEmail(a.id, "a@example.com");
    await customers.setEmail(b.id, "b@example.com");
    const sent = await sendEmailCode(a.id, { customers, otp, mailer });
    expect(mailer.sent.at(-1)).toMatchObject({ to: "a@example.com" });
    expect(mailer.sent.at(-1)!.text).toContain(sent.demoCode!);
    // B can't use A's code.
    await expect(confirmEmailCode(b.id, sent.challengeId, sent.demoCode, { customers, otp })).rejects.toThrow();
    // A changes the address before entering the code → the old code no longer verifies.
    const s2 = await sendEmailCode(a.id, { customers, otp, mailer, now: Date.now() + 31_000 });
    await customers.setEmail(a.id, "new@example.com");
    await expect(confirmEmailCode(a.id, s2.challengeId, s2.demoCode, { customers, otp, now: Date.now() + 31_000 })).rejects.toThrow();
    expect((await customers.get(a.id))!.emailVerified).toBe(false);
    const s3 = await sendEmailCode(a.id, { customers, otp, mailer, now: Date.now() + 62_000 });
    await confirmEmailCode(a.id, s3.challengeId, s3.demoCode, { customers, otp, now: Date.now() + 62_000 });
    expect((await customers.get(a.id))!).toMatchObject({ email: "new@example.com", emailVerified: true });
    await expect(sendEmailCode(a.id, { customers, otp, mailer, now: Date.now() + 93_000 })).rejects.toMatchObject({ code: "already_verified" });
    await customers.setEmail(a.id, "other@example.com");
    expect((await customers.get(a.id))!.emailVerified).toBe(false);
  });

  describe("through the routes", () => {
    let n = 0;
    const req = (url: string, body: unknown, cookie?: string) =>
      new Request(`http://localhost:3000${url}`, { method: url.includes("/me") ? "PATCH" : "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000", "x-forwarded-for": `100.95.0.${(++n % 250) + 1}`, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
    const cookieOf = (res: Response, name: string) => res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`))?.split(";")[0];
    beforeEach(() => {
      rateLimiter.reset();
      vi.stubEnv("CHECKOUT_ENABLED", "true");
      vi.stubEnv("ACCOUNTS_ENABLED", "true");
    });
    afterEach(() => vi.unstubAllEnvs());

    it("sign in → add email → send code → confirm → verified; 401 signed out; re-saving the same email keeps it verified", async () => {
      const sent = await (await otpSend(req("/api/otp/send", { phone: "9811100044" }))).json();
      const signIn = await otpVerify(req("/api/otp/verify", { challengeId: sent.challengeId, code: sent.demoCode }));
      const session = cookieOf(signIn, "ah_session")!;
      expect(cookieOf(signIn, DEVICE_COOKIE)).toBeTruthy(); // the device cookie is set at sign-in
      expect((await emailSend(req("/api/account/email/send", {}))).status).toBe(401);
      expect((await mePATCH(req("/api/account/me", { email: "verify-me@example.com" }, session))).status).toBe(200);
      const code = await (await emailSend(req("/api/account/email/send", {}, session))).json();
      expect(code.challengeId).toBeTruthy();
      expect((await emailConfirm(req("/api/account/email/confirm", { challengeId: code.challengeId, code: "000000" }, session))).status).toBe(422);
      const ok = await emailConfirm(req("/api/account/email/confirm", { challengeId: code.challengeId, code: code.demoCode }, session));
      expect(await ok.json()).toMatchObject({ customer: { email: "verify-me@example.com", emailVerified: true } });
      await mePATCH(req("/api/account/me", { email: "verify-me@example.com" }, session));
      const id = (await resolveCustomers().findByPhone("+919811100044"))!.id;
      expect((await resolveCustomers().get(id))!.emailVerified).toBe(true);
      await mePATCH(req("/api/account/me", { email: "changed@example.com" }, session));
      expect((await resolveCustomers().get(id))!.emailVerified).toBe(false);
    });
  });
});
