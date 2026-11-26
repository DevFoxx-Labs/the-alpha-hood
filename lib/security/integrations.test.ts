import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as otpSend } from "@/app/api/otp/send/route";
import { POST as trackSend } from "@/app/api/track/send/route";
import { rateLimiter } from "@/lib/http/rate-limit";
import { buildEnvelope, readSentry, reportError, scrub } from "@/lib/ops/sentry";
import { SETTING_GROUPS, settingGroup } from "@/lib/settings/catalog";
import { resetSettingsRuntime } from "@/lib/settings/runtime";
import { saveSettingsGroup, SettingsError, settingsPayload } from "@/lib/settings/service";
import { createMemorySettingsStore } from "@/lib/settings/store";
import { checkHuman, readTurnstile, TURNSTILE_VERIFY_URL } from "./turnstile";

const SITE = "0x4AAAAAAABBBBCCCCDDDD";
const SECRET = "0x4AAAAAAA-secret-key-for-tests-1234567890";
const TOKEN = "0.valid-token-abcdefghijklmnopqrstuvwxyz";
const FAKE_ANTHROPIC = ["sk", "ant", "test-only-not-a-secret-000000"].join("-"); // built at runtime: no key-shaped literal in git
const DSN = "https://0123456789abcdef0123456789abcdef@o123456.ingest.sentry.io/7654321";
const ENV = { NODE_ENV: "test", TURNSTILE_SITE_KEY: SITE, TURNSTILE_SECRET_KEY: SECRET };

const answer = (body: unknown, status = 200) => {
  const calls: { url: string; body: string }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => (calls.push({ url: String(url), body: String(init.body) }), new Response(JSON.stringify(body), { status }))) as unknown as typeof fetch;
  return { calls, fetcher };
};

describe("Turnstile (bot protection)", () => {
  it("off unless both keys are set; then the token is verified on Cloudflare's fixed address with the secret", async () => {
    expect(readTurnstile({})).toBeNull();
    expect(readTurnstile({ TURNSTILE_SITE_KEY: SITE })).toBeNull();
    expect(await checkHuman(undefined, "1.2.3.4", {})).toBe("not_required");
    const ok = answer({ success: true });
    expect(await checkHuman(TOKEN, "203.0.113.9", ENV, ok.fetcher)).toBe("passed");
    expect(ok.calls[0].url).toBe(TURNSTILE_VERIFY_URL);
    expect(Object.fromEntries(new URLSearchParams(ok.calls[0].body))).toEqual({ secret: SECRET, response: TOKEN, remoteip: "203.0.113.9" });
  });

  it("missing, malformed or rejected tokens fail without / after the call; an outage does not block sign-in", async () => {
    const none = answer({ success: true });
    for (const bad of [undefined, "", "short", 42, "x".repeat(3000), "has spaces in it aaaaaaaaaaaaaaaa"]) expect(await checkHuman(bad, "1.2.3.4", ENV, none.fetcher)).toBe("failed");
    expect(none.calls).toEqual([]);
    expect(await checkHuman(TOKEN, "1.2.3.4", ENV, answer({ success: false, "error-codes": ["invalid-input-response"] }).fetcher)).toBe("failed");
    expect(await checkHuman(TOKEN, "1.2.3.4", ENV, answer({}, 503).fetcher)).toBe("unavailable");
    const down = (async () => Promise.reject(new Error("timeout"))) as unknown as typeof fetch;
    expect(await checkHuman(TOKEN, "1.2.3.4", ENV, down)).toBe("unavailable");
    // A forged client IP header can't inject a form field.
    const odd = answer({ success: true });
    await checkHuman(TOKEN, "1.2.3.4&secret=x", ENV, odd.fetcher);
    expect(new URLSearchParams(odd.calls[0].body).has("remoteip")).toBe(false);
  });

  describe("on the routes that send a paid SMS", () => {
    let n = 0;
    const post = (path: string, body: unknown) =>
      new Request(`http://localhost:3000${path}`, { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000", "x-forwarded-for": `100.80.0.${(++n % 250) + 1}` }, body: JSON.stringify(body) });
    beforeEach(() => {
      rateLimiter.reset();
      vi.stubEnv("CHECKOUT_ENABLED", "true");
      vi.stubEnv("ACCOUNTS_ENABLED", "true");
    });
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    });

    it("off: codes are sent as before; on: no token or a rejected token → 403 and no code", async () => {
      const off = await otpSend(post("/api/otp/send", { phone: "9811100001" }));
      expect(off.status).toBe(200);
      expect((await off.json()).challengeId).toBeTruthy();

      vi.stubEnv("TURNSTILE_SITE_KEY", SITE);
      vi.stubEnv("TURNSTILE_SECRET_KEY", SECRET);
      const seen: string[] = [];
      vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
        seen.push(String(url));
        return new Response(JSON.stringify({ success: new URLSearchParams(String(init.body)).get("response") === TOKEN }));
      });
      const missing = await otpSend(post("/api/otp/send", { phone: "9811100002" }));
      expect(missing.status).toBe(403);
      expect((await missing.json()).error.code).toBe("human_check_failed");
      expect((await otpSend(post("/api/otp/send", { phone: "9811100002", turnstile: "0.wrong-token-abcdefghijklmnopqrstuvwxyz" }))).status).toBe(403);
      expect((await trackSend(post("/api/track/send", { orderNumber: "AH00000001", phone: "9811100002" }))).status).toBe(403);
      const ok = await otpSend(post("/api/otp/send", { phone: "9811100002", turnstile: TOKEN }));
      expect(ok.status).toBe(200);
      expect((await trackSend(post("/api/track/send", { orderNumber: "AH00000001", phone: "9811100002", turnstile: TOKEN }))).status).toBe(200);
      expect(seen.every((u) => u === TURNSTILE_VERIFY_URL)).toBe(true);
      // Unknown fields are still refused (mass assignment).
      expect((await otpSend(post("/api/otp/send", { phone: "9811100003", turnstile: TOKEN, role: "owner" }))).status).toBe(422);
    });
  });
});

describe("Sentry (error tracking)", () => {
  it("only Sentry's own ingest hosts are accepted — a saved DSN can't point the server anywhere else", () => {
    expect(readSentry({})).toBeNull();
    expect(readSentry({ SENTRY_DSN: DSN })).toEqual({ url: "https://o123456.ingest.sentry.io/api/7654321/envelope/", dsn: DSN, environment: "development" });
    expect(readSentry({ SENTRY_DSN: DSN.replace(".ingest.", ".ingest.us."), NODE_ENV: "production", SENTRY_ENVIRONMENT: "staging" })?.environment).toBe("staging");
    for (const bad of ["https://key@169.254.169.254/1", "http://0123456789abcdef0123456789abcdef@o1.ingest.sentry.io/1", "https://0123456789abcdef0123456789abcdef@o1.ingest.sentry.io.evil.example/1", "https://0123456789abcdef0123456789abcdef@localhost/1"]) {
      expect(readSentry({ SENTRY_DSN: bad }), bad).toBeNull();
    }
  });

  it("the event carries no personal data: scrubbed message, path without query, no headers or cookies", () => {
    const err = new Error("Order failed for +91 98765 43210 / buyer@example.com with token abcdefghijklmnopqrstuvwxyz0123456789ABCD");
    const env = buildEnvelope(err, { path: "/account/orders/AH1?phone=9876543210&token=secret", method: "GET", routePath: "/account/orders/[number]", routeType: "render" }, readSentry({ SENTRY_DSN: DSN })!);
    const [header, item, event] = env.split("\n").map((l) => JSON.parse(l));
    expect(header.dsn).toBe(DSN);
    expect(item).toEqual({ type: "event" });
    expect(event.request).toEqual({ url: "/account/orders/AH1", method: "GET" });
    expect(event.exception.values[0].value).toBe("Order failed for [number] / [email] with token [token]");
    for (const leak of ["9876543210", "98765 43210", "buyer@example.com", "abcdefghijklmnopqrstuvwxyz0123456789ABCD", "cookie", "authorization"]) expect(env).not.toContain(leak);
    expect(scrub("plain message")).toBe("plain message");
  });

  it("never throws, sends nothing without a DSN, and caps an error storm", async () => {
    const sent: string[] = [];
    const fetcher = (async (url: string) => (sent.push(String(url)), new Response("{}"))) as unknown as typeof fetch;
    expect(await reportError(new Error("x"), {}, {}, fetcher)).toBe(false);
    expect(await reportError("a string", {}, { SENTRY_DSN: DSN }, fetcher)).toBe(true);
    expect(sent).toEqual(["https://o123456.ingest.sentry.io/api/7654321/envelope/"]);
    const broken = (async () => Promise.reject(new Error("down"))) as unknown as typeof fetch;
    await expect(reportError(new Error("x"), {}, { SENTRY_DSN: DSN }, broken)).resolves.toBe(false);
    let ok = 0;
    for (let i = 0; i < 40; i++) if (await reportError(new Error("storm"), {}, { SENTRY_DSN: DSN }, fetcher)) ok++;
    expect(ok).toBeLessThanOrEqual(20);
  });
});

describe("integration settings groups", () => {
  afterEach(() => resetSettingsRuntime());

  it("Turnstile, Sentry and social sign-in are in use; push and AI say plainly that nothing reads them yet", async () => {
    const env: Record<string, string | undefined> = { NODE_ENV: "test" };
    const payload = await settingsPayload(createMemorySettingsStore(), env);
    const by = Object.fromEntries(payload.groups.map((g) => [g.id, g]));
    for (const id of ["turnstile", "sentry", "social"]) expect(by[id].notInUse, id).toBeNull();
    for (const id of ["push", "ai"]) expect(by[id].notInUse, id).toMatch(/not built yet|no AI feature yet/);
    // Every key that grants access is write-only.
    for (const f of SETTING_GROUPS.flatMap((g) => g.fields)) if (/SECRET|TOKEN|PRIVATE|API_KEY|DSN/.test(f.env)) expect(f.secret, f.env).toBe(true);
  });

  it("saving the keys switches the feature on at once; bad shapes are refused", async () => {
    const env: Record<string, string | undefined> = { NODE_ENV: "test" };
    const store = createMemorySettingsStore();
    expect(readTurnstile(env)).toBeNull();
    await saveSettingsGroup(store, "turnstile", { fields: { TURNSTILE_SITE_KEY: SITE, TURNSTILE_SECRET_KEY: SECRET } }, "stf", env);
    expect(readTurnstile(env)).toEqual({ siteKey: SITE, secretKey: SECRET });
    await saveSettingsGroup(store, "turnstile", { fields: {}, clear: ["TURNSTILE_SECRET_KEY"] }, "stf", env);
    expect(readTurnstile(env)).toBeNull(); // one key removed = off

    await saveSettingsGroup(store, "sentry", { fields: { SENTRY_DSN: DSN } }, "stf", env);
    expect(readSentry(env)?.url).toContain("o123456.ingest.sentry.io");
    const reject = (group: string, fields: Record<string, unknown>) => expect(saveSettingsGroup(store, group, { fields }, "stf", env), JSON.stringify(fields)).rejects.toBeInstanceOf(SettingsError);
    await reject("sentry", { SENTRY_DSN: "https://key@169.254.169.254/1" });
    await reject("sentry", { SENTRY_DSN: "https://0123456789abcdef0123456789abcdef@evil.example/1" });
    await reject("social", { GOOGLE_CLIENT_ID: "not-a-client-id" });
    await reject("social", { FACEBOOK_APP_SECRET: "xyz" });
    await reject("push", { WEB_PUSH_SUBJECT: "javascript:alert(1)" });
    await reject("ai", { AI_PROVIDER: "http://evil" });
    await reject("ai", { ANTHROPIC_API_KEY: "sk-wrong" });
    // Saved secrets never come back.
    await saveSettingsGroup(store, "ai", { fields: { AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: FAKE_ANTHROPIC } }, "stf", env);
    const blob = JSON.stringify(await settingsPayload(store, env));
    for (const secret of [DSN, FAKE_ANTHROPIC]) expect(blob).not.toContain(secret);
    expect(settingGroup("social")?.fields.map((f) => f.env)).toEqual(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET"]);
  });
});
