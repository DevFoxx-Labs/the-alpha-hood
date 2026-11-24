import { describe, expect, it } from "vitest";
import { deliverOutbox, MAX_ATTEMPTS } from "./delivery";
import { createMemoryOutbox, type OutboxMessage } from "./outbox";
import { readTemplateIds, resolveSms, SMS_PROVIDERS, type SmsAdapter, SmsError, type SmsTemplate, templateVars } from "./sms";

const customers = (map: Record<string, string | null>) => ({
  get: async (id: string) => (id in map ? ({ id, phone: map[id] ?? "" } as never) : null),
});
const msg = (over: Partial<OutboxMessage> = {}): OutboxMessage => ({ customerId: "cus_a", template: "order_shipped", channels: ["sms", "email"], refs: { orderNumber: "AH12345678" }, createdAt: new Date().toISOString(), status: "queued", ...over });

function fakeSms(opts: { supports?: SmsTemplate[]; fail?: (n: number) => SmsError | null } = {}) {
  const sent: { phone: string; template: SmsTemplate; vars: Record<string, string> }[] = [];
  let calls = 0;
  const adapter: SmsAdapter = {
    name: "fake",
    sendOtp: async () => ({}),
    supports: (t) => (opts.supports ?? ["order_shipped", "order_confirmed", "back_in_stock"]).includes(t),
    async send(phone, template, vars) {
      const err = opts.fail?.(++calls);
      if (err) throw err;
      sent.push({ phone, template, vars });
      return { providerId: `p${calls}` };
    },
  };
  return { adapter, sent };
}

describe("SMS templates (DLT)", () => {
  it("only the template's allow-listed variables leave the server; unsafe values refused", () => {
    expect(templateVars("order_shipped", { orderNumber: "AH12345678", phone: "+919999999999", name: "Ravi" })).toEqual({ orderNumber: "AH12345678" });
    expect(templateVars("back_in_stock", { handle: "linen-shirt-sand", productId: "x" })).toEqual({ handle: "linen-shirt-sand" });
    expect(() => templateVars("order_shipped", {})).toThrow(/Missing/);
    expect(() => templateVars("order_shipped", { orderNumber: "<a href=x>" })).toThrow(/Bad/);
    expect(() => templateVars("order_shipped", { orderNumber: "x".repeat(31) })).toThrow(/Bad/);
  });
  it("template ids come from SMS_TEMPLATES (unknown keys and bad ids ignored)", () => {
    expect(readTemplateIds({ SMS_TEMPLATES: '{"otp":"tmpl_123","order_shipped":"abc-456","hack":"x1234","order_confirmed":"<x>"}' })).toEqual({ otp: "tmpl_123", order_shipped: "abc-456" });
    expect(readTemplateIds({ SMS_TEMPLATES: "not json" })).toEqual({});
  });
  it("provider selection fails closed: unknown SMS_PROVIDER never falls back to the demo", async () => {
    expect(resolveSms({ NODE_ENV: "development" }).name).toBe("demo");
    expect(resolveSms({ NODE_ENV: "production" }).name).toBe("disabled");
    expect(resolveSms({ NODE_ENV: "development", SMS_PROVIDER: "made-up" }).name).toBe("disabled");
    await expect(resolveSms({ NODE_ENV: "production" }).sendOtp("+919999999999", "123456")).rejects.toThrow();
    expect(Object.keys(SMS_PROVIDERS)).toEqual([]); // no unverified provider shipped
  });
});

describe("outbox delivery worker", () => {
  it("sends transactional SMS to the current phone; email has no provider; marketing never goes by SMS", async () => {
    const outbox = createMemoryOutbox();
    const sms = fakeSms();
    await outbox.push(msg());
    await outbox.push(msg({ template: "abandoned_checkout_1h", channels: ["email", "whatsapp"], refs: {} }));
    await outbox.push(msg({ template: "order_delivered" })); // no DLT template configured → skipped
    const r = await deliverOutbox({ outbox, sms: sms.adapter, customers: customers({ cus_a: "+919876543210" }) });
    expect(r).toMatchObject({ claimed: 3, sent: 1, retry: 0, failed: 0 });
    expect(sms.sent).toEqual([{ phone: "+919876543210", template: "order_shipped", vars: { orderNumber: "AH12345678" } }]);
    expect((await outbox.listFor("cus_a")).map((m) => m.status)).toEqual(["done", "done", "done"]);
    expect((await deliverOutbox({ outbox, sms: sms.adapter, customers: customers({}) })).claimed).toBe(0); // nothing twice
  });

  it("erased / unknown customers and odd numbers are skipped, never sent", async () => {
    const outbox = createMemoryOutbox();
    const sms = fakeSms();
    await outbox.push(msg({ customerId: "cus_gone" }));
    await outbox.push(msg({ customerId: "cus_erased" }));
    await outbox.push(msg({ customerId: "cus_intl" }));
    await deliverOutbox({ outbox, sms: sms.adapter, customers: customers({ cus_erased: null, cus_intl: "+14155550100" }) });
    expect(sms.sent).toEqual([]);
  });

  it("temporary failures retry with back-off and never re-send a channel that went out; permanent failures stop", async () => {
    const outbox = createMemoryOutbox();
    const flaky = fakeSms({ fail: (n) => (n <= 2 ? new SmsError("unavailable", "timeout", true) : null) });
    await outbox.push(msg());
    const t0 = Date.now();
    expect((await deliverOutbox({ outbox, sms: flaky.adapter, customers: customers({ cus_a: "+919876543210" }) }, t0)).retry).toBe(1);
    expect((await deliverOutbox({ outbox, sms: flaky.adapter, customers: customers({ cus_a: "+919876543210" }) }, t0 + 1000)).claimed).toBe(0); // backing off
    await deliverOutbox({ outbox, sms: flaky.adapter, customers: customers({ cus_a: "+919876543210" }) }, t0 + 10 * 60_000);
    await deliverOutbox({ outbox, sms: flaky.adapter, customers: customers({ cus_a: "+919876543210" }) }, t0 + 60 * 60_000);
    expect(flaky.sent).toHaveLength(1);
    expect((await outbox.listFor("cus_a"))[0].status).toBe("done");

    const dead = createMemoryOutbox();
    const always = fakeSms({ fail: () => new SmsError("unavailable", "down", true) });
    await dead.push(msg());
    for (let i = 0; i < MAX_ATTEMPTS + 2; i++) await deliverOutbox({ outbox: dead, sms: always.adapter, customers: customers({ cus_a: "+919876543210" }) }, t0 + i * 2 * 3_600_000);
    expect((await dead.listFor("cus_a"))[0].status).toBe("failed");

    const rejected = createMemoryOutbox();
    await rejected.push(msg());
    const r = await deliverOutbox({ outbox: rejected, sms: fakeSms({ fail: () => new SmsError("rejected", "template mismatch", false) }).adapter, customers: customers({ cus_a: "+919876543210" }) });
    expect(r).toMatchObject({ failed: 1, retry: 0 });
  });

  it("two workers at once never both take a message", async () => {
    const outbox = createMemoryOutbox();
    for (let i = 0; i < 10; i++) await outbox.push(msg({ refs: { orderNumber: `AH0000000${i}` } }));
    const [a, b] = await Promise.all([outbox.claim(10, Date.now()), outbox.claim(10, Date.now())]);
    expect(a.length + b.length).toBe(10);
    expect(new Set([...a, ...b].map((m) => m.id)).size).toBe(10);
  });
});
