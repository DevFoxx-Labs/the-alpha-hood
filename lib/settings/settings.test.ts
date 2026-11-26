import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkoutEnabled, codEnabled } from "@/lib/checkout/flags";
import { readTracking, TRACKING } from "@/lib/config/tracking";
import { LEGAL_CONFIG, PLACEHOLDER_PREFIX } from "@/lib/legal/config";
import { COOKIES_NOTICE } from "@/lib/legal/notices/cookies";
import { resolveGateway } from "@/lib/payments/gateway";
import { SETTING_ENV_KEYS, SETTING_GROUPS } from "./catalog";
import { applySettings, refreshSettings, resetSettingsRuntime } from "./runtime";
import { saveSettingsGroup, SettingsError, settingsPayload } from "./service";
import { createMemorySettingsStore, resolveSettingsStore } from "./store";

type Env = Record<string, string | undefined>;
const BY = "stf_test";

afterEach(() => resetSettingsRuntime());

describe("settings catalogue", () => {
  it("never lets the admin override the roots of trust or the preview-only switches", () => {
    const forbidden = [
      "DATABASE_URL", "DATABASE_DRIVER", "SECRET_BOX_KEY", "SECRET_BOX_PREVIOUS_KEYS", "OTP_PEPPER", "ADMIN_SETUP_TOKEN", "CRON_SECRET",
      "ALLOW_MOCK_DATA", "ALLOW_MOCK_PAYMENTS", "ENABLE_DEV_PAGES", "NODE_ENV", "SITE_URL", "COMMERCE_PROVIDER", "CMS_PROVIDER",
    ];
    for (const key of forbidden) expect(SETTING_ENV_KEYS, key).not.toContain(key);
    expect(new Set(SETTING_ENV_KEYS).size).toBe(SETTING_ENV_KEYS.length);
    // Anything that grants access is write-only.
    for (const f of SETTING_GROUPS.flatMap((g) => g.fields)) {
      if (/SECRET|TOKEN/.test(f.env)) expect(f.secret, f.env).toBe(true);
    }
    // Money: the payments group needs a fresh authenticator code.
    expect(SETTING_GROUPS.find((g) => g.id === "payments")?.stepUp).toBe(true);
  });

  it("guard: lib/settings is never imported by client code", () => {
    const offenders: string[] = [];
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const f = join(d, n);
        if (statSync(f).isDirectory()) walk(f);
        else if (/\.tsx?$/.test(n)) {
          const src = readFileSync(f, "utf8");
          if (!/^\s*["']use client["']/.test(src)) continue;
          // Types are erased; a value import would pull the database into the browser bundle.
          if (/^import (?!type )[^;]*from "@\/lib\/settings\/(service|store|runtime)"/m.test(src)) offenders.push(f);
        }
      }
    };
    walk(join(process.cwd(), "components"));
    walk(join(process.cwd(), "app"));
    expect(offenders).toEqual([]);
  }, 60_000); // reads every component file; slow disks need more than the default 5 s
});

describe("settings service", () => {
  it("saved values override the environment; removing one restores it; an empty store changes nothing", async () => {
    const env: Env = { SUPPORT_EMAIL: "env@example.test", NODE_ENV: "test" };
    const store = createMemorySettingsStore();
    expect(applySettings(await store.all(), env)).toBe(false);
    expect(env.SUPPORT_EMAIL).toBe("env@example.test");

    const saved = await saveSettingsGroup(store, "general", { fields: { SUPPORT_EMAIL: "Help@Example.Test", SUPPORT_HOURS: "Mon–Sat" } }, BY, env);
    expect(saved.changed.sort()).toEqual(["SUPPORT_EMAIL", "SUPPORT_HOURS"]);
    expect(env.SUPPORT_EMAIL).toBe("help@example.test");
    const field = saved.group.fields.find((f) => f.key === "SUPPORT_EMAIL")!;
    expect(field).toMatchObject({ source: "database", value: "help@example.test", envFallback: true });

    const cleared = await saveSettingsGroup(store, "general", { fields: {}, clear: ["SUPPORT_EMAIL", "SUPPORT_HOURS"] }, BY, env);
    expect(cleared.changed.sort()).toEqual(["SUPPORT_EMAIL", "SUPPORT_HOURS"]);
    expect(env.SUPPORT_EMAIL).toBe("env@example.test");
    expect(env.SUPPORT_HOURS).toBeUndefined();
    expect(await store.all()).toEqual([]);
  });

  it("a secret never appears in the payload or the save response", async () => {
    const env: Env = { NODE_ENV: "test", RAZORPAY_KEY_SECRET: "env-secret-value-0123456789" };
    const store = createMemorySettingsStore();
    const secret = "db-secret-value-ABCDEFGHIJKLMNOP";
    const res = await saveSettingsGroup(store, "payments", { fields: { RAZORPAY_WEBHOOK_SECRET: secret } }, BY, env);
    const payload = await settingsPayload(store, env);
    for (const blob of [JSON.stringify(res), JSON.stringify(payload)]) {
      expect(blob).not.toContain(secret);
      expect(blob).not.toContain("env-secret-value-0123456789");
    }
    const f = payload.groups.find((g) => g.id === "payments")!.fields.find((x) => x.key === "RAZORPAY_WEBHOOK_SECRET")!;
    expect(f).toMatchObject({ secret: true, value: null, isSet: true, source: "database" });
    expect(f.hint).toMatch(/^32 characters · [0-9a-f]{6}$/);
    // Blank on a later save means "keep", not "delete".
    expect((await saveSettingsGroup(store, "payments", { fields: { RAZORPAY_WEBHOOK_SECRET: "" } }, BY, env)).changed).toEqual([]);
    expect(env.RAZORPAY_WEBHOOK_SECRET).toBe(secret);
  });

  it("rejects unknown groups and fields, bad shapes, and writes nothing on any error", async () => {
    const env: Env = { NODE_ENV: "test" };
    const store = createMemorySettingsStore();
    await expect(saveSettingsGroup(store, "nope", { fields: {} }, BY, env)).rejects.toMatchObject({ status: 404 });
    // Mass assignment: a key outside the group (even a real env var) is refused.
    await expect(saveSettingsGroup(store, "general", { fields: { DATABASE_URL: "mysql://x" } }, BY, env)).rejects.toThrow(/Unknown field/);
    await expect(saveSettingsGroup(store, "general", { fields: { RAZORPAY_KEY_SECRET: "x".repeat(20) } }, BY, env)).rejects.toThrow(/Unknown field/);
    await expect(saveSettingsGroup(store, "general", { fields: {}, clear: ["ALLOW_MOCK_PAYMENTS"] }, BY, env)).rejects.toBeInstanceOf(SettingsError);
    await expect(saveSettingsGroup(store, "general", { fields: {}, role: "owner" }, BY, env)).rejects.toThrow(/Unknown field/);

    const bad = {
      SUPPORT_EMAIL: "not-an-email",
      SOCIAL_INSTAGRAM_URL: "javascript:alert(1)",
      SOCIAL_YOUTUBE_URL: "http://youtube.com/x",
      SOCIAL_X_URL: "https://user:pass@x.com/a",
      SUPPORT_HOURS: "line one\nline two",
      SUPPORT_PHONE: "<script>",
    };
    const err = await saveSettingsGroup(store, "general", { fields: { ...bad, SOCIAL_FACEBOOK_URL: "https://facebook.com/ok" } }, BY, env).catch((e) => e);
    expect(err).toBeInstanceOf(SettingsError);
    expect(Object.keys(err.fields).sort()).toEqual(Object.keys(bad).sort());
    expect(await store.all()).toEqual([]); // all-or-nothing: the valid field wasn't saved either
    expect(env.SOCIAL_FACEBOOK_URL).toBeUndefined();

    await expect(saveSettingsGroup(store, "checkout", { fields: { CHECKOUT_ENABLED: "true" } }, BY, env)).rejects.toMatchObject({ fields: { CHECKOUT_ENABLED: expect.any(String) } });
    await expect(saveSettingsGroup(store, "payments", { fields: { PAYMENT_GATEWAY: "stripe" } }, BY, env)).rejects.toBeInstanceOf(SettingsError);
    await expect(saveSettingsGroup(store, "tracking", { fields: { GA4_MEASUREMENT_ID: "G-1\"><script>" } }, BY, env)).rejects.toBeInstanceOf(SettingsError);
    await expect(saveSettingsGroup(store, "legal", { fields: { LEGAL_GSTIN: "27abcde1234f1z5" } }, BY, env)).rejects.toBeInstanceOf(SettingsError);
  });

  it("kill switches: an explicit off beats an environment \"true\", and stays fail-closed when unset", async () => {
    const env: Env = { NODE_ENV: "test", CHECKOUT_ENABLED: "true", COD_ENABLED: "true" };
    const store = createMemorySettingsStore();
    expect(checkoutEnabled(env)).toBe(true);
    await saveSettingsGroup(store, "checkout", { fields: { CHECKOUT_ENABLED: false } }, BY, env);
    expect(checkoutEnabled(env)).toBe(false);
    expect(codEnabled(env)).toBe(false); // COD needs checkout
    await saveSettingsGroup(store, "checkout", { fields: { CHECKOUT_ENABLED: true } }, BY, env);
    expect(checkoutEnabled(env)).toBe(true);
    // Nothing saved + nothing in the environment = off, and saving "off" there stores nothing.
    const bare: Env = { NODE_ENV: "test" };
    resetSettingsRuntime(env);
    const empty = createMemorySettingsStore();
    expect((await saveSettingsGroup(empty, "checkout", { fields: { ACCOUNTS_ENABLED: false } }, BY, bare)).changed).toEqual([]);
    expect(await empty.all()).toEqual([]);
  });

  it("a row that can't be decrypted falls back to the environment and is reported by name", async () => {
    const env: Env = { NODE_ENV: "test", SUPPORT_EMAIL: "env@example.test" };
    const at = new Date().toISOString();
    applySettings([{ key: "SUPPORT_EMAIL", value: null, updatedBy: BY, updatedAt: at }, { key: "DATABASE_URL", value: "mysql://evil", updatedBy: BY, updatedAt: at }], env);
    expect(env.SUPPORT_EMAIL).toBe("env@example.test");
    expect(env.DATABASE_URL).toBeUndefined(); // a row outside the catalogue is ignored, even if it is in the table
    const store = createMemorySettingsStore();
    expect((await settingsPayload(store, env)).unreadable).toEqual([]);
  });

  it("an unreachable database never throws at boot and leaves the environment alone", async () => {
    const env: Env = { NODE_ENV: "test", SUPPORT_EMAIL: "env@example.test" };
    const broken = { all: async () => Promise.reject(new Error("down")), write: async () => undefined };
    await expect(refreshSettings(broken, env)).resolves.toBe(false);
    expect(env.SUPPORT_EMAIL).toBe("env@example.test");
    // Production without a database: the store refuses instead of silently keeping settings in memory.
    await expect(resolveSettingsStore({ NODE_ENV: "production" }).all()).rejects.toThrow(/no production backend/);
  });
});

describe("live config follows saved settings (process environment)", () => {
  it("legal details, tracker IDs, the cookie policy table and the payment gateway update without a restart", async () => {
    const store = createMemorySettingsStore();
    const before = { ...process.env };
    try {
      for (const k of SETTING_ENV_KEYS) delete process.env[k];
      resetSettingsRuntime();
      for (const k of SETTING_ENV_KEYS) delete process.env[k];
      expect(LEGAL_CONFIG.entityName.startsWith(PLACEHOLDER_PREFIX)).toBe(true);
      expect(TRACKING.ga4Id).toBeNull();
      expect(JSON.stringify(COOKIES_NOTICE)).not.toContain("\"In use\",\"Google");

      await saveSettingsGroup(store, "legal", { fields: { LEGAL_ENTITY_NAME: "Example Retail Private Limited" } }, BY);
      await saveSettingsGroup(store, "tracking", { fields: { GA4_MEASUREMENT_ID: "G-TEST1234" } }, BY);
      expect(LEGAL_CONFIG.entityName).toBe("Example Retail Private Limited");
      expect(TRACKING.ga4Id).toBe("G-TEST1234");
      expect({ ...TRACKING }).toEqual(readTracking()); // spreads like a plain object (passed to client components)
      expect(JSON.parse(JSON.stringify(TRACKING)).ga4Id).toBe("G-TEST1234");

      expect(resolveGateway({ ...process.env, NODE_ENV: "production" }).name).toBe("disabled");
      await saveSettingsGroup(store, "payments", { fields: { PAYMENT_GATEWAY: "razorpay", RAZORPAY_KEY_ID: "rzp_test_ABCDEFGH1234", RAZORPAY_KEY_SECRET: "k".repeat(24), RAZORPAY_WEBHOOK_SECRET: "w".repeat(24) } }, BY);
      expect(resolveGateway({ ...process.env, NODE_ENV: "production" }).name).toBe("razorpay");

      await saveSettingsGroup(store, "tracking", { fields: {}, clear: ["GA4_MEASUREMENT_ID"] }, BY);
      expect(TRACKING.ga4Id).toBeNull();
    } finally {
      resetSettingsRuntime();
      for (const k of SETTING_ENV_KEYS) {
        if (before[k] === undefined) delete process.env[k];
        else process.env[k] = before[k];
      }
    }
  });
});
