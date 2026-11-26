import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { acceptInvite, createOwner, createPasswordReset, passwordStep, totpStep } from "@/lib/admin/auth";
import { totpAt } from "@/lib/admin/crypto";
import { createAdminSession, createInvite, newStaff } from "@/lib/admin/staff";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { localBackend } from "@/lib/storage/backends";
import { setStorageRuntime } from "@/lib/storage/runtime";
import { getMongo } from "./mongo";
import { createSecretBox } from "./secret-box";
import { getSqlDb } from "./sql";
import { type StoresUnderTest, testTargets } from "./testing";

/**
 * Phase 5 contract: staff + MFA, audit log, shared rate limits, alerts, UGC, outbox and flow state behave the same
 * on memory, MySQL, PostgreSQL and MongoDB. Every security counter is raced. Registered from contract.test.ts.
 */
const PASSWORD = "correct horse battery staple";

for (const target of testTargets()) {
  describe(`admin + growth contract · ${target.name}`, () => {
    let s: StoresUnderTest;
    beforeAll(async () => {
      s = await target.setup();
    }, 60_000);
    afterAll(async () => {
      await target.teardown();
    });

    it("first owner: parallel setups create exactly one; then setup is closed", async () => {
      const tries = await Promise.allSettled([1, 2, 3].map((i) => createOwner(s.staff, { email: `owner${i}@example.test`, name: "Owner", password: PASSWORD }, { NODE_ENV: "test" })));
      expect(tries.filter((t) => t.status === "fulfilled")).toHaveLength(1);
      expect(await s.staff.count()).toBe(1);
      await expect(createOwner(s.staff, { email: "late@example.test", name: "Late", password: PASSWORD }, { NODE_ENV: "test" })).rejects.toMatchObject({ code: "setup_closed" });
    });

    it("MFA: enrol, sign in, a code works once (also in parallel), lockout after 5 wrong passwords", async () => {
      const owner = (await s.staff.list())[0];
      const t0 = Date.parse("2026-11-26T10:00:00Z");
      const { ticket, step } = await passwordStep(s.staff, owner.email, PASSWORD, t0);
      expect(step).toBe("enrol");
      // Parallel enrol calls agree on one secret.
      const { enrolStep } = await import("@/lib/admin/auth");
      const secrets = await Promise.all([1, 2, 3].map(() => enrolStep(s.staff, ticket, t0)));
      expect(new Set(secrets.map((x) => x.secret)).size).toBe(1);
      const secret = secrets[0].secret;
      const code = totpAt(secret, Math.floor(t0 / 30_000));
      const { token, staff } = await totpStep(s.staff, ticket, code, t0);
      expect(token).toMatch(/^[A-Za-z0-9_-]{40,60}$/);
      expect(staff.totpEnabled).toBe(true);
      expect((await s.staff.get(owner.id))!.totpSecret).toBe(secret);

      // The same code on two fresh tickets at once: exactly one sign-in.
      const t1 = t0 + 1000;
      const [a, b] = await Promise.all([passwordStep(s.staff, owner.email, PASSWORD, t1), passwordStep(s.staff, owner.email, PASSWORD, t1)]);
      const next = totpAt(secret, Math.floor(t1 / 30_000) + 1);
      const race = await Promise.allSettled([totpStep(s.staff, a.ticket, next, t1), totpStep(s.staff, b.ticket, next, t1)]);
      expect(race.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      // The used code is refused afterwards too (replay).
      const c = await passwordStep(s.staff, owner.email, PASSWORD, t1);
      await expect(totpStep(s.staff, c.ticket, next, t1)).rejects.toMatchObject({ code: "invalid_code" });

      // 5 wrong passwords in parallel lock the account.
      await Promise.allSettled(Array.from({ length: 5 }, (_, i) => passwordStep(s.staff, owner.email, `wrong-password-${i}`, t1)));
      await expect(passwordStep(s.staff, owner.email, PASSWORD, t1)).rejects.toMatchObject({ code: "locked" });
      expect(await passwordStep(s.staff, owner.email, PASSWORD, t1 + 16 * 60_000)).toHaveProperty("ticket");
    });

    it("tickets allow 5 guesses; sessions are revoked per staff member", async () => {
      const owner = (await s.staff.list())[0];
      const t = Date.parse("2026-11-26T12:00:00Z");
      const { ticket } = await passwordStep(s.staff, owner.email, PASSWORD, t);
      const guesses = await Promise.allSettled(Array.from({ length: 8 }, () => totpStep(s.staff, ticket, "000000", t)));
      expect(guesses.every((g) => g.status === "rejected")).toBe(true);
      const owner2 = (await s.staff.get(owner.id))!;
      await expect(totpStep(s.staff, ticket, totpAt(owner2.totpSecret!, Math.floor(t / 30_000)), t)).rejects.toMatchObject({ code: "expired" });
      expect(await s.staff.deleteSessionsOf(owner.id)).toBeGreaterThanOrEqual(1);
      expect(await s.staff.deleteSessionsOf(owner.id)).toBe(0);
    });

    it("invites: single use even when accepted twice at once; UNIQUE email", async () => {
      const token = await createInvite(s.staff, { email: "new@example.test", name: "New Person", role: "warehouse", invitedBy: "stf_x" });
      const race = await Promise.allSettled([acceptInvite(s.staff, token, "another strong passphrase"), acceptInvite(s.staff, token, "another strong passphrase")]);
      expect(race.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect((await s.staff.list()).filter((x) => x.email === "new@example.test")).toHaveLength(1);
      expect(await s.staff.listInvites(Date.now())).toHaveLength(0);
      await expect(s.staff.insert(newStaff({ email: "new@example.test", name: "Dup", role: "support", passwordHash: null }))).rejects.toThrow(/already/);
      // Role change through update() keeps everything else.
      const id = (await s.staff.byEmail("new@example.test"))!.id;
      const updated = await s.staff.update(id, (x) => void (x.role = "support"));
      expect(updated).toMatchObject({ role: "support", email: "new@example.test", totpEnabled: false });
    });

    it("password-reset link: single use (raced), new password works, old one fails, sessions revoked, MFA kept", async () => {
      const owner = (await s.staff.list())[0];
      const before = (await s.staff.get(owner.id))!;
      await createAdminSession(s.staff, owner.id);
      const token = await createPasswordReset(s.staff, owner, "stf_other");
      // The link round-trips as a reset (not a join invite) on every driver.
      expect((await s.staff.listInvites(Date.now())).find((i) => i.resetFor === owner.id)).toBeTruthy();
      const NEW = "a brand new long passphrase";
      const race = await Promise.allSettled([acceptInvite(s.staff, token, NEW), acceptInvite(s.staff, token, NEW)]);
      expect(race.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(race.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "invite_invalid" } });
      expect((await s.staff.list()).filter((x) => x.email === owner.email)).toHaveLength(1);
      expect(await s.staff.deleteSessionsOf(owner.id)).toBe(0); // already revoked
      const after = (await s.staff.get(owner.id))!;
      expect(after).toMatchObject({ totpEnabled: before.totpEnabled, lastTotpStep: before.lastTotpStep, failedLogins: 0, lockedUntil: 0 });
      const t = Date.parse("2026-11-26T14:00:00Z");
      await expect(passwordStep(s.staff, owner.email, PASSWORD, t)).rejects.toMatchObject({ code: "invalid_credentials" });
      await expect(passwordStep(s.staff, owner.email, NEW, t)).resolves.toMatchObject({ step: "totp" });
      // Put the shared fixture password back for later tests (through the same reset path).
      await acceptInvite(s.staff, await createPasswordReset(s.staff, after, "stf_other"), PASSWORD);
    });

    it("password-reset link: expired, disabled account and changed email are refused", async () => {
      const t0 = Date.parse("2026-11-26T15:00:00Z");
      const victim = newStaff({ email: "reset-me@example.test", name: "Reset Me", role: "support", passwordHash: null });
      await s.staff.insert(victim);
      const expired = await createPasswordReset(s.staff, victim, "stf_other", t0);
      await expect(acceptInvite(s.staff, expired, "long enough passphrase", t0 + 61 * 60_000)).rejects.toMatchObject({ code: "invite_invalid" });
      const forDisabled = await createPasswordReset(s.staff, victim, "stf_other");
      await s.staff.update(victim.id, (x) => void (x.disabled = true));
      await expect(acceptInvite(s.staff, forDisabled, "long enough passphrase")).rejects.toMatchObject({ code: "invite_invalid" });
      await expect(createPasswordReset(s.staff, (await s.staff.get(victim.id))!, "stf_other")).rejects.toMatchObject({ code: "disabled" });
      await s.staff.update(victim.id, (x) => void (x.disabled = false));
      const stale = await createPasswordReset(s.staff, victim, "stf_other");
      await s.staff.update(victim.id, (x) => void (x.email = "moved@example.test"));
      await expect(acceptInvite(s.staff, stale, "long enough passphrase")).rejects.toMatchObject({ code: "invite_invalid" });
      expect((await s.staff.get(victim.id))!.passwordHash).toBeNull();
    });

    it("TOTP secrets are encrypted in the database (never stored in the clear)", async () => {
      const owner = (await s.staff.list()).find((x) => x.role === "owner")!;
      if (target.cfg) {
        let raw: unknown;
        if (target.cfg.driver === "mongodb") raw = await (await getMongo(target.cfg)).db.collection("staff").findOne({ _id: owner.id as never });
        else raw = await getSqlDb(target.cfg).selectFrom("staff").selectAll().where("id", "=", owner.id).executeTakeFirst();
        const text = JSON.stringify(raw);
        expect(text).not.toContain(owner.totpSecret!);
        expect(text).toMatch(/v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+/);
      }
      const box = createSecretBox({});
      const sealed = box.seal("JBSWY3DPEHPK3PXP");
      expect(sealed).not.toContain("JBSWY3DPEHPK3PXP");
      expect(box.open(sealed)).toBe("JBSWY3DPEHPK3PXP");
      expect(() => createSecretBox({ NODE_ENV: "production" })).toThrow(/SECRET_BOX_KEY/);
      const other = createSecretBox({ SECRET_BOX_KEY: Buffer.alloc(32, 7).toString("base64") });
      expect(() => other.open(sealed)).toThrow(); // wrong key can't read it
      const rotated = createSecretBox({ SECRET_BOX_KEY: Buffer.alloc(32, 9).toString("base64"), SECRET_BOX_PREVIOUS_KEYS: Buffer.alloc(32, 7).toString("base64") });
      expect(rotated.open(other.seal("x"))).toBe("x");
    });

    it("settings: atomic set + clear, replace in place, sealed at rest", async () => {
      const t = new Date("2026-11-28T08:00:00.000Z");
      expect(await s.settings.all()).toEqual([]);
      await s.settings.write({ set: { SUPPORT_EMAIL: "help@example.test", RAZORPAY_KEY_SECRET: "plain-secret-ABCDEFGH" }, clear: [] }, "stf_a", t);
      await s.settings.write({ set: {}, clear: [] }, "stf_a", t); // nothing to do
      expect(await s.settings.all()).toEqual([
        { key: "RAZORPAY_KEY_SECRET", value: "plain-secret-ABCDEFGH", updatedBy: "stf_a", updatedAt: t.toISOString() },
        { key: "SUPPORT_EMAIL", value: "help@example.test", updatedBy: "stf_a", updatedAt: t.toISOString() },
      ]);
      if (target.cfg) {
        // At rest every value is ciphertext — public ones too.
        const raw: unknown =
          target.cfg.driver === "mongodb"
            ? await (await getMongo(target.cfg)).db.collection("app_settings").find({}).toArray()
            : await getSqlDb(target.cfg).selectFrom("app_settings").selectAll().execute();
        const blob = JSON.stringify(raw);
        expect(blob).not.toContain("plain-secret-ABCDEFGH");
        expect(blob).not.toContain("help@example.test");
        expect(blob).toContain("v1:");
      }
      // One change: replace one key, remove another, add a third; parallel writers leave one row per key.
      const later = new Date(t.getTime() + 1000);
      await Promise.all([
        s.settings.write({ set: { SUPPORT_EMAIL: "care@example.test", SUPPORT_HOURS: "Mon–Sat" }, clear: ["RAZORPAY_KEY_SECRET"] }, "stf_b", later),
        s.settings.write({ set: { SUPPORT_HOURS: "Mon–Sat" }, clear: [] }, "stf_b", later),
      ]);
      const rows = await s.settings.all();
      expect(rows.map((r) => [r.key, r.value, r.updatedBy])).toEqual([
        ["SUPPORT_EMAIL", "care@example.test", "stf_b"],
        ["SUPPORT_HOURS", "Mon–Sat", "stf_b"],
      ]);
      await s.settings.write({ set: {}, clear: ["SUPPORT_EMAIL", "SUPPORT_HOURS", "NEVER_SAVED"] }, "stf_b");
      expect(await s.settings.all()).toEqual([]);
    });

    it("providers: sealed at rest, one active per kind even when activations race, the live row can't be removed", async () => {
      const doc = (name: string) => ({ name, driver: "msg91", credentials: { auth_key: `plain-key-${name}-ABCDEFGH` } });
      const t = new Date("2026-11-28T09:00:00.000Z");
      for (const id of ["prv_a", "prv_b", "prv_c"]) await s.providers.put("sms", id, doc(id), t);
      await s.providers.put("sms", "prv_a", doc("renamed"), t); // replace in place
      expect((await s.providers.list<{ name: string }>("sms")).map((r) => [r.id, r.active, r.doc?.name, r.updatedAt])).toEqual([
        ["prv_a", false, "renamed", t.toISOString()],
        ["prv_b", false, "prv_b", t.toISOString()],
        ["prv_c", false, "prv_c", t.toISOString()],
      ]);
      expect(await s.providers.get("sms", "prv_nope")).toBeNull();
      if (target.cfg) {
        const raw: unknown =
          target.cfg.driver === "mongodb"
            ? await (await getMongo(target.cfg)).db.collection("providers").find({}).toArray()
            : await getSqlDb(target.cfg).selectFrom("providers").selectAll().execute();
        expect(JSON.stringify(raw)).not.toContain("plain-key");
      }
      expect(await s.providers.setActive("sms", "prv_nope")).toBe(false);
      // Three owners activate three providers at the same moment: exactly one ends up live.
      const race = await Promise.allSettled(["prv_a", "prv_b", "prv_c"].map((id) => s.providers.setActive("sms", id)));
      expect(race.some((r) => r.status === "fulfilled")).toBe(true);
      const live = (await s.providers.list("sms")).filter((r) => r.active);
      expect(live).toHaveLength(1);
      // Editing the live row keeps it live; it can't be removed; the others can.
      await s.providers.put("sms", live[0].id, doc("edited"), t);
      expect((await s.providers.get("sms", live[0].id))!.active).toBe(true);
      expect(await s.providers.remove("sms", live[0].id)).toBe(false);
      const other = ["prv_a", "prv_b", "prv_c"].find((id) => id !== live[0].id)!;
      expect(await s.providers.remove("sms", other)).toBe(true);
      expect(await s.providers.remove("sms", other)).toBe(false);
      expect(await s.providers.setActive("sms", null)).toBe(true);
      expect((await s.providers.list("sms")).some((r) => r.active)).toBe(false);
      for (const r of await s.providers.list("sms")) await s.providers.remove("sms", r.id);
      expect(await s.providers.list("sms")).toEqual([]);
    });

    it("product photos on object storage: the row keeps the storage key and no bytes; reads come back from the backend", async () => {
      const dir = mkdtempSync(join(tmpdir(), "ah-contract-"));
      try {
        setStorageRuntime("local", { local: localBackend(dir) });
        const id = `med_${"c".repeat(32)}`;
        await s.media.save({ id, type: "image/png", width: 800, height: 800, bytes: new Uint8Array([0x89, 0x50, 7]), createdAt: "2026-11-29T00:00:00.000Z", createdBy: "stf_a" });
        expect([...(await s.media.get(id))!.bytes]).toEqual([0x89, 0x50, 7]);
        expect((await s.media.existing([id])).has(id)).toBe(true);
        if (target.cfg) {
          const raw =
            target.cfg.driver === "mongodb"
              ? await (await getMongo(target.cfg)).db.collection("product_media").findOne({ _id: id as never })
              : await getSqlDb(target.cfg).selectFrom("product_media").select(["bytes", "storage_key"]).where("id", "=", id).executeTakeFirst();
          const r = raw as unknown as { storage_key?: string; storageKey?: string; bytes: { length?: number; buffer?: { byteLength: number } } };
          expect(r.storage_key ?? r.storageKey).toBe(`local:media/${id}.png`);
          expect(r.bytes.length ?? r.bytes.buffer?.byteLength).toBe(0);
        }
        // Storage switched back to the database: the old photo is still read from the folder.
        setStorageRuntime(null, { local: localBackend(dir) });
        expect([...(await s.media.get(id))!.bytes]).toEqual([0x89, 0x50, 7]);
      } finally {
        setStorageRuntime(null, {});
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("social identities: one social account → one customer even when links race; unlink and erasure remove them", async () => {
      const at = "2026-11-29T00:00:00.000Z";
      const race = await Promise.all(["cus_s1", "cus_s2", "cus_s3"].map((customerId) => s.socialIdentities.link({ provider: "google", subject: "1098765", customerId, email: null, createdAt: at })));
      expect(race.filter(Boolean)).toHaveLength(1);
      const owner = (await s.socialIdentities.find("google", "1098765"))!.customerId;
      expect(await s.socialIdentities.link({ provider: "facebook", subject: "1098765", customerId: "cus_s9", email: null, createdAt: at })).toBe(true); // same id, other provider
      expect(await s.socialIdentities.find("google", "nope")).toBeNull();
      expect((await s.socialIdentities.listFor(owner)).map((i) => i.provider)).toEqual(["google"]);
      expect(await s.socialIdentities.unlink(owner, "facebook")).toBe(false);
      expect(await s.socialIdentities.unlink(owner, "google")).toBe(true);
      expect(await s.socialIdentities.find("google", "1098765")).toBeNull();
      await s.socialIdentities.eraseCustomer("cus_s9");
      expect(await s.socialIdentities.listFor("cus_s9")).toEqual([]);
    });

    it("audit log: newest first, filters, no update path", async () => {
      for (const i of [1, 2, 3]) await s.audit.append({ actorId: "stf_a", actorEmail: "a@x", action: `test.${i}`, target: i === 2 ? "T2" : "T", details: { i }, ip: "10.0.0.1" }, new Date(Date.parse("2026-11-26T00:00:00Z") + i));
      const all = await s.audit.list({ actorId: "stf_a" });
      expect(all.map((a) => a.action)).toEqual(["test.3", "test.2", "test.1"]);
      expect((await s.audit.list({ target: "T2" })).map((a) => a.details.i)).toEqual([2]);
      expect(await s.audit.list({ actorId: "stf_a", limit: 1 })).toHaveLength(1);
      expect(Object.keys(s.audit)).toEqual(["append", "list"]);
    });

    it("rate counters: parallel hits count exactly; a new window starts after reset", async () => {
      const key = "a".repeat(64);
      const hits = await Promise.all(Array.from({ length: 12 }, () => s.rateCounters.hit(key, 60_000, 1_000_000)));
      expect(hits.map((h) => h.count).sort((x, y) => x - y)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
      expect(await s.rateCounters.peek(key, 1_000_000)).toMatchObject({ count: 12 });
      expect(await s.rateCounters.hit(key, 60_000, 1_060_001)).toMatchObject({ count: 1, resetAt: 1_120_001 });
      expect(await s.rateCounters.peek("b".repeat(64), 0)).toBeNull();
    });

    it("alerts: one open alert per product+size (racing creates), fires once (racing sweeps)", async () => {
      const a = { customerId: "cus_al", productId: "mock_011", size: "M", kind: "back_in_stock" as const, priceAtSet: 89_900 };
      const made = await Promise.all([1, 2, 3].map(() => s.alerts.create(a)));
      expect(new Set(made.map((x) => x.id)).size).toBe(1);
      const fired = await Promise.all([1, 2, 3].map(() => s.alerts.fire(made[0].id)));
      expect(fired.filter(Boolean)).toHaveLength(1);
      expect(await s.alerts.open("mock_011")).toEqual([]);
      const again = await s.alerts.create(a); // a fresh alert after the last one fired
      expect(again.id).not.toBe(made[0].id);
      expect(await s.alerts.remove("cus_other", again.id)).toBe(false);
      expect(await s.alerts.remove("cus_al", again.id)).toBe(true);
      await s.alerts.create({ ...a, kind: "price_drop", size: null });
      await s.alerts.erase("cus_al");
      expect(await s.alerts.listByCustomer("cus_al")).toEqual([]);
    });

    it("UGC: moderation is conditional (racing approve/reject → one wins), customer listing hides removed", async () => {
      const post = await s.ugc.create({ customerId: "cus_ugc", displayName: "Ravi", photoId: "img_" + "1".repeat(32), caption: "Fit check", productIds: ["mock_011"] });
      expect(post.status).toBe("pending");
      const race = await Promise.all([s.ugc.setStatus(post.id, ["pending"], "approved", "stf_a"), s.ugc.setStatus(post.id, ["pending"], "rejected", "stf_b")]);
      expect(race.filter(Boolean)).toHaveLength(1);
      expect((await s.ugc.list("approved")).length + (await s.ugc.list("rejected")).length).toBe(1);
      await s.ugc.setStatus(post.id, ["pending", "approved", "rejected"], "removed", null);
      expect(await s.ugc.listByCustomer("cus_ugc")).toEqual([]);
      expect(await s.ugc.get("../x")).toBeNull();
      await s.ugc.erase("cus_ugc");
      expect(await s.ugc.get(post.id)).toBeNull();
    });

    it("outbox: marketing counted per window; listing in order; erase", async () => {
      const base = Date.parse("2026-11-26T08:00:00Z");
      const msg = (template: "order_confirmed" | "abandoned_checkout_1h", t: number) => ({ customerId: "cus_ob", template, channels: ["email" as const], refs: { orderNumber: "AH1" }, createdAt: new Date(t).toISOString(), status: "queued" as const });
      await s.outbox.push(msg("order_confirmed", base));
      await s.outbox.push(msg("abandoned_checkout_1h", base + 1000));
      await s.outbox.push(msg("abandoned_checkout_1h", base + 2 * 86_400_000));
      expect(await s.outbox.marketingSince("cus_ob", new Date(base).toISOString())).toBe(2);
      expect(await s.outbox.marketingSince("cus_ob", new Date(base + 86_400_000).toISOString())).toBe(1);
      expect((await s.outbox.listFor("cus_ob")).map((m) => m.template)).toEqual(["order_confirmed", "abandoned_checkout_1h", "abandoned_checkout_1h"]);
      await s.outbox.erase("cus_ob");
      expect(await s.outbox.listFor("cus_ob")).toEqual([]);
    });

    it("outbox delivery: parallel workers claim each message once; retry back-off; stale claims re-offered; done is final", async () => {
      const t = Date.parse("2026-11-27T09:00:00Z");
      for (let i = 0; i < 6; i++) await s.outbox.push({ customerId: "cus_dl", template: "order_shipped", channels: ["sms"], refs: { orderNumber: `AH0000001${i}` }, createdAt: new Date(t + i).toISOString(), status: "queued" });
      const [a, b, c] = await Promise.all([s.outbox.claim(6, t), s.outbox.claim(6, t), s.outbox.claim(6, t)]);
      const all = [...a, ...b, ...c];
      expect(all).toHaveLength(6);
      expect(new Set(all.map((m) => m.id)).size).toBe(6);
      expect(all[0]).toMatchObject({ status: "sending", attempts: 0, results: {} });
      expect(await s.outbox.claim(6, t)).toEqual([]); // all held
      const [m1, m2, ...rest] = all;
      await s.outbox.finish(m1.id, { status: "done", results: { sms: "sent" } }, t);
      await s.outbox.finish(m1.id, { status: "failed", results: { sms: "failed" } }, t); // not claimed any more → ignored
      await s.outbox.finish(m2.id, { status: "queued", results: {}, nextAttemptAt: t + 60_000 }, t);
      expect(await s.outbox.claim(6, t + 1000)).toEqual([]); // backing off
      const again = await s.outbox.claim(6, t + 61_000);
      expect(again.map((m) => m.id)).toEqual([m2.id]);
      expect(again[0].attempts).toBe(1);
      // Crashed worker: its claims come back after STALE_CLAIM_MS.
      const reoffered = await s.outbox.claim(10, t + 61_000 + 11 * 60_000);
      expect(new Set(reoffered.map((m) => m.id))).toEqual(new Set([m2.id, ...rest.map((m) => m.id)]));
      expect((await s.outbox.listFor("cus_dl")).find((m) => m.refs.orderNumber === m1.refs.orderNumber)!.status).toBe("done");
      await s.outbox.erase("cus_dl");
    });

    it("flows: each reminder step and review request is claimed once, even by parallel sweeps", async () => {
      const startedAt = "2026-11-26T06:00:00.000Z";
      await s.flows.putCheckout({ customerId: "cus_fl", cartId: "cart_1", startedAt, sent: { h1: false, h24: false } });
      const h1 = await Promise.all([1, 2, 3].map(() => s.flows.claimStep("cus_fl", startedAt, "h1")));
      expect(h1.filter(Boolean)).toHaveLength(1);
      expect(await s.flows.claimStep("cus_fl", "2026-01-01T00:00:00.000Z", "h24")).toBe(false); // a newer checkout replaced it
      expect(await s.flows.claimStep("cus_fl", startedAt, "h24")).toBe(true);
      expect((await s.flows.getCheckout("cus_fl"))!.sent).toEqual({ h1: true, h24: true });
      expect((await Promise.all([1, 2].map(() => s.flows.claimReview("AH0000009")))).filter(Boolean)).toHaveLength(1);
      expect((await s.flows.listCheckouts()).map((c) => c.customerId)).toContain("cus_fl");
      await s.flows.deleteCheckout("cus_fl");
      expect(await s.flows.getCheckout("cus_fl")).toBeNull();
    });
  });
}
