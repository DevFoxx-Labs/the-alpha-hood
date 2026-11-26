import { afterEach, describe, expect, it } from "vitest";
import { resolveEmail, setActiveEmail } from "@/lib/notify/email";
import { activateEmailProvider, createEmailProvider, deactivateEmailProvider, deleteEmailProvider, emailProvidersPayload, testEmailProvider, updateEmailProvider } from "./email-service";
import { type EmailProviderDoc, sendThrough } from "./email-transport";
import { isPrivateAddress, publicAddress } from "./net-guard";
import { createMemoryProviderStore } from "./store";

const PASS = "app-password-ABCDEFGH-123";
const USER = "smtp-login-7f3a9c@zoho.example";
const BODY = { name: "Zoho", host: "smtp.zoho.in", port: 465, encryption: "ssl", username: USER, password: PASS, fromAddress: "orders@alphahood.example", fromName: "The Alpha Hood", replyTo: "" };
const BY = "stf_owner";
const STAFF_EMAIL = "owner@alphahood.example";
const publicDns = async () => ["8.8.4.4"]; // a public address

/** Fake nodemailer: records the transport options and the messages. */
function fakeMailer(fail?: { responseCode?: number; message: string }) {
  const transports: Record<string, unknown>[] = [];
  const sent: Record<string, unknown>[] = [];
  const createTransport = ((opts: Record<string, unknown>) => {
    transports.push(opts);
    return {
      sendMail: async (m: Record<string, unknown>) => {
        if (fail) throw Object.assign(new Error(fail.message), { responseCode: fail.responseCode });
        sent.push(m);
        return { messageId: "<m1@example>" };
      },
      close: () => undefined,
    };
  }) as never;
  return { transports, sent, deps: { resolve: publicDns, createTransport } };
}

afterEach(() => setActiveEmail(null));

describe("SMTP host guard (SSRF)", () => {
  it("private, loopback, link-local, CGNAT and reserved addresses are refused, IPv4 and IPv6", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "not-an-ip"]) expect(isPrivateAddress(ip), ip).toBe(true);
    for (const ip of ["8.8.4.4", "142.250.183.5", "2607:f8b0:4004:800::200e"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it("IP literals and bad names are refused; a name resolving to ANY private address is refused", async () => {
    await expect(publicAddress("127.0.0.1", publicDns)).rejects.toThrow(/not an IP address/);
    await expect(publicAddress("[::1]", publicDns)).rejects.toThrow();
    await expect(publicAddress("localhost", publicDns)).rejects.toThrow(/valid host name/);
    await expect(publicAddress("smtp.example.com", async () => ["8.8.4.4", "10.0.0.5"])).rejects.toThrow(/private or internal/);
    await expect(publicAddress("smtp.example.com", async () => { throw new Error("ENOTFOUND"); })).rejects.toThrow(/could not be found/);
    expect(await publicAddress("SMTP.Example.com", async () => ["2607:f8b0::1", "8.8.4.4"])).toBe("8.8.4.4"); // IPv4 first
  });
});

describe("SMTP transport", () => {
  const doc: EmailProviderDoc = { ...BODY, encryption: "tls", port: 587, replyTo: "help@alphahood.example", lastTest: null, activatedAt: null, createdAt: "", updatedBy: BY };

  it("connects to the checked IP, verifies the certificate for the host name, TLS required, no file/URL access", async () => {
    const m = fakeMailer();
    await sendThrough(doc, { to: "buyer@example.com", subject: "Hi", text: "Body" }, m.deps);
    expect(m.transports[0]).toMatchObject({
      host: "8.8.4.4",
      port: 587,
      secure: false,
      requireTLS: true,
      ignoreTLS: false,
      tls: { servername: "smtp.zoho.in", rejectUnauthorized: true, minVersion: "TLSv1.2" },
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    expect(m.sent[0]).toMatchObject({ from: { name: "The Alpha Hood", address: "orders@alphahood.example" }, to: "buyer@example.com", replyTo: "help@alphahood.example" });
  });

  it("header injection is refused before any connection; provider errors are scrubbed of the login", async () => {
    const m = fakeMailer();
    await expect(sendThrough(doc, { to: "a@b.co\r\nBcc: x@y.z", subject: "Hi", text: "x" }, m.deps)).rejects.toThrow();
    await expect(sendThrough(doc, { to: "a@b.co", subject: "Hi\r\nBcc: x@y.z", text: "x" }, m.deps)).rejects.toThrow();
    expect(m.transports).toEqual([]);
    const bad = fakeMailer({ responseCode: 535, message: `535 Authentication failed for ${USER} with ${PASS}` });
    const e = await sendThrough(doc, { to: "a@b.co", subject: "Hi", text: "x" }, bad.deps).catch((x) => x);
    expect(e).toMatchObject({ code: "rejected" });
    expect(e.message).not.toContain(PASS);
    expect(e.message).not.toContain(USER);
  });
});

describe("Email providers service", () => {
  it("password never returned, username masked; validation allow-lists port, encryption, host and addresses", async () => {
    const store = createMemoryProviderStore();
    const made = await createEmailProvider(store, BODY, BY, fakeMailer().deps);
    const payload = await emailProvidersPayload(store, { NODE_ENV: "production" });
    for (const blob of [JSON.stringify(made), JSON.stringify(payload)]) {
      expect(blob).not.toContain(PASS);
      expect(blob).not.toContain(USER);
    }
    expect(made.provider).toMatchObject({ usernameHint: "sm••••••••le", passwordSet: true, verified: false, active: false });
    expect(payload.catalog.presets.some((p) => p.key === "ses" && p.host === "email-smtp.ap-south-1.amazonaws.com")).toBe(true);

    const bad = (over: Record<string, unknown>) => createEmailProvider(store, { ...BODY, ...over }, BY, fakeMailer().deps).catch((e) => e.fields ?? e.message);
    expect(await bad({ port: 22 })).toHaveProperty("port");
    expect(await bad({ encryption: "none" })).toHaveProperty("encryption");
    expect(await bad({ host: "127.0.0.1" })).toHaveProperty("host");
    expect(await bad({ fromName: 'Evil" <x@y.z>' })).toHaveProperty("fromName");
    expect(await bad({ fromAddress: "nope" })).toHaveProperty("fromAddress");
    expect(await bad({ password: "" })).toHaveProperty("password");
    expect(await bad({ transport: "sendmail" })).toMatch(/Unknown field/);
    await expect(createEmailProvider(store, BODY, BY, { ...fakeMailer().deps, resolve: async () => ["192.168.0.2"] })).rejects.toMatchObject({ fields: { host: expect.stringMatching(/private/) } });
    expect(await store.list("email")).toHaveLength(1);
  });

  it("live only after a passed test; one live; the live one can't be deleted; a live edit is tested first", async () => {
    const store = createMemoryProviderStore();
    const ok = fakeMailer();
    const a = (await createEmailProvider(store, BODY, BY, ok.deps)).provider;
    await expect(activateEmailProvider(store, a.id, BY)).rejects.toMatchObject({ code: "not_verified" });
    const failed = await testEmailProvider(store, a.id, undefined, BY, STAFF_EMAIL, fakeMailer({ responseCode: 535, message: "auth failed" }).deps);
    expect(failed.ok).toBe(false);
    const passed = await testEmailProvider(store, a.id, undefined, BY, STAFF_EMAIL, ok.deps);
    expect(passed).toMatchObject({ ok: true, provider: { verified: true } });
    expect(ok.sent.at(-1)).toMatchObject({ to: STAFF_EMAIL }); // default recipient: the staff member's own address
    expect(passed.message).not.toContain(STAFF_EMAIL);

    expect(resolveEmail().name).toBe("demo");
    await activateEmailProvider(store, a.id, BY);
    expect(resolveEmail().name).toBe("smtp");
    await expect(deleteEmailProvider(store, a.id)).rejects.toMatchObject({ code: "live" });

    // Blank password on an edit keeps the stored one; a name change keeps it verified.
    const renamed = await updateEmailProvider(store, a.id, { ...BODY, name: "Zoho main", password: "", username: "" }, BY, STAFF_EMAIL, ok.deps);
    expect(renamed.provider).toMatchObject({ name: "Zoho main", verified: true, passwordSet: true });
    // Live + new password: a failing test saves nothing.
    await expect(updateEmailProvider(store, a.id, { ...BODY, password: "new-password-XYZ123456" }, BY, STAFF_EMAIL, fakeMailer({ responseCode: 535, message: "auth" }).deps)).rejects.toMatchObject({ code: "test_failed" });
    expect((await store.get<EmailProviderDoc>("email", a.id))!.doc!.password).toBe(PASS);
    const saved = await updateEmailProvider(store, a.id, { ...BODY, password: "new-password-XYZ123456" }, BY, STAFF_EMAIL, ok.deps);
    expect(saved).toMatchObject({ liveChanged: true, provider: { verified: true } });

    expect((await deactivateEmailProvider(store, a.id)).liveChanged).toBe(true);
    expect(resolveEmail().name).toBe("demo");
    await deleteEmailProvider(store, a.id);
    expect(await store.list("email")).toEqual([]);
  });
});
