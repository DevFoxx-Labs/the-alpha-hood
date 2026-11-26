import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveAudit } from "@/lib/admin/audit";
import { otpauthUri, totpAt, verifyTotp } from "@/lib/admin/crypto";
import { csvCell } from "@/lib/admin/ops";
import { can, ROLE_PERMISSIONS } from "@/lib/admin/permissions";
import { resolveStaffStore } from "@/lib/admin/staff";
import { MOCK_PRODUCTS } from "@/lib/commerce/mock/data";
import { rateLimiter } from "@/lib/http/rate-limit";
import { GET as auditGET } from "./admin/audit/route";
import { GET as categoriesGET, PUT as categoriesPUT } from "./admin/categories/route";
import { POST as collectionPreviewPOST } from "./admin/collections/preview/route";
import { GET as collectionsGET, PUT as collectionsPUT } from "./admin/collections/route";
import { GET as styleGET, PUT as stylePUT } from "./admin/styles/[styleId]/route";
import { POST as stylesPOST } from "./admin/styles/route";
import { POST as bulkPOST } from "./admin/catalog/bulk/route";
import { GET as exportGET } from "./admin/catalog/export/route";
import { POST as importPOST } from "./admin/catalog/import/route";
import { POST as creditPOST, GET as customerGET } from "./admin/customers/[id]/route";
import { GET as dashGET } from "./admin/dashboard/route";
import { POST as inventoryPOST } from "./admin/inventory/route";
import { PATCH as productPATCH } from "./admin/catalog/[id]/route";
import { GET as catalogGET, POST as catalogPOST } from "./admin/catalog/route";
import { POST as acceptPOST } from "./admin/invite/accept/route";
import { POST as loginPOST } from "./admin/login/route";
import { POST as actionPOST } from "./admin/orders/[number]/action/route";
import { GET as labelGET } from "./admin/orders/[number]/label/route";
import { GET as ordersGET } from "./admin/orders/route";
import { GET as csvGET } from "./admin/reports/orders/route";
import { POST as returnActionPOST } from "./admin/returns/[number]/action/route";
import { POST as setupPOST } from "./admin/setup/route";
import { PATCH as staffPATCH } from "./admin/staff/[id]/route";
import { POST as resetLinkPOST } from "./admin/staff/[id]/reset-link/route";
import { POST as forgotPOST } from "./admin/password/forgot/route";
import { GET as subscribersGET } from "./admin/subscribers/route";
import { GET as settingsGET } from "./admin/settings/route";
import { GET as smsGET, POST as smsPOST } from "./admin/sms-providers/route";
import { DELETE as smsDELETE, PATCH as smsPATCH } from "./admin/sms-providers/[id]/route";
import { POST as smsACTION } from "./admin/sms-providers/[id]/[action]/route";
import { resolveSms, setActiveSms } from "@/lib/notify/sms";
import { resolveProviderStore } from "@/lib/providers/store";
import { PUT as settingsPUT } from "./admin/settings/[group]/route";
import { resetSettingsRuntime } from "@/lib/settings/runtime";
import { resolveSettingsStore } from "@/lib/settings/store";
import { GET as subscribersExportGET } from "./admin/subscribers/export/route";
import { POST as newsletterPOST } from "./newsletter/route";
import { POST as resetPOST } from "./admin/password/reset/route";
import { requestResetCode } from "@/lib/admin/auth";
import { type DemoEmail, resolveEmail } from "@/lib/notify/email";

const demoMail = () => resolveEmail({ NODE_ENV: "test" }) as DemoEmail;
import { GET as staffGET, POST as invitePOST } from "./admin/staff/route";
import { POST as totpEnrol } from "./admin/totp/enrol/route";
import { POST as totpVerify } from "./admin/totp/verify/route";
import { POST as linePOST } from "./cart/lines/route";
import { POST as addressPOST } from "./checkout/addresses/route";
import { POST as placePOST } from "./checkout/place/route";
import { POST as quotePOST } from "./checkout/quote/route";
import { POST as otpSend } from "./otp/send/route";
import { POST as otpVerify } from "./otp/verify/route";

const ORIGIN = "http://localhost:3000";
let ip = 0;
function req(path: string, method: string, body?: unknown, { cookie, headers = {} }: { cookie?: string; headers?: Record<string, string> } = {}) {
  const h = new Headers({ "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": `100.64.0.${(ip % 250) + 1}`, ...headers });
  if (cookie) h.set("cookie", cookie);
  return new Request(`${ORIGIN}${path}`, { method, headers: h, body: method === "GET" ? undefined : JSON.stringify(body ?? {}) });
}
const cookieOf = (res: Response, name: string) => res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`))?.split(";")[0];
const p = <T extends object>(v: T) => ({ params: Promise.resolve(v) });

let clock = Date.parse("2026-11-23T06:00:00Z");
const tick = (ms = 31_000) => vi.setSystemTime((clock += ms));

/** Full admin sign-in: password → TOTP (enrolling on first sign-in) → cookie. */
async function adminSignIn(email: string, password: string) {
  const login = await loginPOST(req("/api/admin/login", "POST", { email, password }));
  const { ticket, step } = await login.json();
  let secret: string;
  if (step === "enrol") {
    secret = (await (await totpEnrol(req("/api/admin/totp/enrol", "POST", { ticket }))).json()).secret;
    secrets.set(email, secret);
  } else secret = secrets.get(email)!;
  tick();
  const code = totpAt(secret, Math.floor(Date.now() / 30_000));
  const res = await totpVerify(req("/api/admin/totp/verify", "POST", { ticket, code }));
  expect(res.status).toBe(200);
  return cookieOf(res, "ah_admin")!;
}
const secrets = new Map<string, string>();

let owner = "";
async function ensureOwner() {
  const store = resolveStaffStore();
  if ((await store.count()) === 0) {
    expect((await setupPOST(req("/api/admin/setup", "POST", { email: "owner@example.test", name: "Owner", password: "correct horse battery staple" }))).status).toBe(201);
  }
  owner = await adminSignIn("owner@example.test", "correct horse battery staple");
}

async function invite(email: string, role: string) {
  const res = await invitePOST(req("/api/admin/staff", "POST", { email, name: "Staff Person", role }, { cookie: owner }));
  expect(res.status).toBe(201);
  const token = (await res.json()).invitePath.split("/").pop();
  expect((await acceptPOST(req("/api/admin/invite/accept", "POST", { token, password: "another strong passphrase" }))).status).toBe(201);
  return adminSignIn(email, "another strong passphrase");
}

const product = MOCK_PRODUCTS.find((x) => x.category === "shirts" && x.sizes.filter((s) => s.stock >= 5).length >= 2)!;
const size = product.sizes.find((s) => s.stock >= 5)!.label;
const ADDRESS = { name: "Test Buyer", phone: "9876543210", pincode: "411045", line1: "Flat 12, Shanti Apartments, Baner Road", line2: "Baner", landmark: "Near park", city: "Pune", state: "Maharashtra", type: "home" };

async function codOrder(phone: string) {
  const sent = await (await otpSend(req("/api/otp/send", "POST", { phone }))).json();
  const session = cookieOf(await otpVerify(req("/api/otp/verify", "POST", { challengeId: sent.challengeId, code: sent.demoCode })), "ah_session")!;
  const cart = cookieOf(await linePOST(req("/api/cart/lines", "POST", { productId: product.id, size, quantity: 1 })), "ah_cart")!;
  const cookie = `${session}; ${cart}`;
  const address = (await (await addressPOST(req("/api/checkout/addresses", "POST", ADDRESS, { cookie }))).json()).address;
  const q = await (await quotePOST(req("/api/checkout/quote", "POST", { addressId: address.id, payment: "cod" }, { cookie }))).json();
  return (await (await placePOST(req("/api/checkout/place", "POST", { addressId: address.id, payment: "cod", expectedTotal: q.pricing.total }, { cookie, headers: { "idempotency-key": crypto.randomUUID() } }))).json()).orderNumber as string;
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  tick(60_000);
  rateLimiter.reset();
  ip++;
  vi.stubEnv("CHECKOUT_ENABLED", "true");
  vi.stubEnv("COD_ENABLED", "true");
  vi.stubEnv("ACCOUNTS_ENABLED", "true");
  await ensureOwner();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("guard: every admin route checks staff + permission", () => {
  it("each app/api/admin route uses requireStaff or adminWrite, except the sign-in steps", () => {
    const PUBLIC = ["setup", "login", join("totp", "enrol"), join("totp", "verify"), "logout", join("invite", "accept"), join("password", "forgot"), join("password", "reset")].map((x) => join("admin", x, "route.ts"));
    const files: string[] = [];
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const f = join(d, n);
        if (statSync(f).isDirectory()) walk(f);
        else if (n === "route.ts") files.push(f);
      }
    };
    walk(join(process.cwd(), "app", "api", "admin"));
    expect(files.length).toBeGreaterThan(20);
    for (const f of files) {
      if (PUBLIC.some((x) => f.endsWith(x))) continue;
      const src = readFileSync(f, "utf8");
      expect(/await requireStaff\(|await adminWrite\(/.test(src), f).toBe(true);
      // The guard is async: a call without `await` would be a Promise, never a refusal.
      expect(/(?<!await )\brequireStaff\(request/.test(src), f).toBe(false);
    }
  });

  it("one persistent admin shell: it lives in the (panel) layout, never inside a page (no remount per click)", () => {
    const panel = join(process.cwd(), "app", "admin", "(panel)");
    expect(readFileSync(join(panel, "layout.tsx"), "utf8")).toContain("<AdminShell");
    // A loading boundary makes sidebar clicks switch the page area at once (dynamic, personal pages).
    expect(readFileSync(join(panel, "loading.tsx"), "utf8")).toContain("aria-busy");
    const pages: string[] = [];
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const f = join(d, n);
        if (statSync(f).isDirectory()) walk(f);
        else if (n === "page.tsx") pages.push(f);
      }
    };
    walk(panel);
    expect(pages.length).toBeGreaterThan(15);
    for (const f of pages) expect(readFileSync(f, "utf8"), f).not.toContain("<AdminShell");
  });

  it("permission map: only owners manage staff or read the audit log", () => {
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
      if (role !== "owner") {
        expect(perms).not.toContain("staff.manage");
        expect(perms).not.toContain("audit.read");
      }
    }
    expect(can("warehouse", "orders.ship")).toBe(true);
    expect(can("warehouse", "refunds.issue")).toBe(false);
    expect(can("marketing", "customers.read")).toBe(false);
  });
});

describe("admin authentication (MFA mandatory)", () => {
  it("TOTP maths: RFC 6238 window and replay protection", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const now = 1_700_000_000_000;
    const step = Math.floor(now / 30_000);
    expect(verifyTotp(secret, totpAt(secret, step), now)).toBe(step);
    expect(verifyTotp(secret, totpAt(secret, step - 1), now)).toBe(step - 1);
    expect(verifyTotp(secret, totpAt(secret, step - 3), now)).toBeNull();
    expect(verifyTotp(secret, totpAt(secret, step), now, step)).toBeNull();
    expect(otpauthUri(secret, "a@b.c")).toContain("secret=JBSWY3DPEHPK3PXP");
  });

  it("setup closes once an owner exists", async () => {
    expect((await setupPOST(req("/api/admin/setup", "POST", { email: "x@example.test", name: "X", password: "correct horse battery staple" }))).status).toBe(403);
  });

  it("password alone never gives a session; wrong code fails; same error for unknown email", async () => {
    const r1 = await loginPOST(req("/api/admin/login", "POST", { email: "nobody@example.test", password: "whatever-whatever" }));
    const r2 = await loginPOST(req("/api/admin/login", "POST", { email: "owner@example.test", password: "wrong wrong wrong" }));
    expect(r1.status).toBe(401);
    expect((await r1.json()).error.message).toBe((await r2.json()).error.message);
    const ok = await loginPOST(req("/api/admin/login", "POST", { email: "owner@example.test", password: "correct horse battery staple" }));
    expect(cookieOf(ok, "ah_admin")).toBeUndefined();
    const { ticket } = await ok.json();
    expect((await totpVerify(req("/api/admin/totp/verify", "POST", { ticket, code: "000000" }))).status).toBe(401);
  });

  it("locks the account after 5 wrong passwords", async () => {
    for (let i = 0; i < 5; i++) await loginPOST(req("/api/admin/login", "POST", { email: "owner@example.test", password: `wrong-password-${i}` }));
    const locked = await loginPOST(req("/api/admin/login", "POST", { email: "owner@example.test", password: "correct horse battery staple" }));
    expect(locked.status).toBe(429);
    tick(16 * 60_000);
  });

  it("no cookie → 401; customer session cookie is not an admin session", async () => {
    expect((await ordersGET(req("/api/admin/orders", "GET"))).status).toBe(401);
    expect((await ordersGET(req("/api/admin/orders", "GET", undefined, { cookie: "ah_session=" + "a".repeat(43) }))).status).toBe(401);
  });

  it("idle sessions expire after 30 minutes", async () => {
    expect((await dashGET(req("/api/admin/dashboard", "GET", undefined, { cookie: owner }))).status).toBe(200);
    tick(31 * 60_000);
    expect((await dashGET(req("/api/admin/dashboard", "GET", undefined, { cookie: owner }))).status).toBe(401);
  });
});

describe("RBAC on the server", () => {
  it("warehouse can ship but not cancel, see customers or manage staff; role change signs them out", async () => {
    const wh = await invite(`wh-${ip}@example.test`, "warehouse");
    const number = await codOrder(`97100${String(ip).padStart(5, "0")}`);
    expect((await actionPOST(req(`/api/admin/orders/${number}/action`, "POST", { action: "packed" }, { cookie: wh }), p({ number }))).status).toBe(200);
    expect((await actionPOST(req(`/api/admin/orders/${number}/action`, "POST", { action: "cancel", reason: "test" }, { cookie: wh }), p({ number }))).status).toBe(403);
    expect((await staffGET(req("/api/admin/staff", "GET", undefined, { cookie: wh }))).status).toBe(403);
    expect((await customerGET(req("/api/admin/customers/cus_abcdefghijkl", "GET", undefined, { cookie: wh }), p({ id: "cus_abcdefghijkl" }))).status).toBe(403);

    const id = (await (await staffGET(req("/api/admin/staff", "GET", undefined, { cookie: owner }))).json()).staff.find((s: { email: string }) => s.email === `wh-${ip}@example.test`).id;
    expect((await staffPATCH(req(`/api/admin/staff/${id}`, "PATCH", { role: "support" }, { cookie: owner }), p({ id }))).status).toBe(200);
    expect((await dashGET(req("/api/admin/dashboard", "GET", undefined, { cookie: wh }))).status).toBe(401);
  });

  it("owner can't change themselves; the last owner can't be demoted", async () => {
    const me = (await (await staffGET(req("/api/admin/staff", "GET", undefined, { cookie: owner }))).json()).staff.find((s: { email: string }) => s.email === "owner@example.test");
    expect((await staffPATCH(req(`/api/admin/staff/${me.id}`, "PATCH", { role: "support" }, { cookie: owner }), p({ id: me.id }))).status).toBe(409);
  });

  it("product editing (ADM-01): catalog.write only; read-only unless the store runs on the own backend", async () => {
    for (const role of ["owner", "store_manager", "catalog_editor"] as const) expect(can(role, "catalog.write")).toBe(true);
    for (const role of ["support", "warehouse", "marketing", "finance"] as const) expect(can(role, "catalog.write")).toBe(false);
    const body = { title: "Probe Tee — Black", sku: "AH-PRB-1" };
    const wh = await invite(`wh-cat-${ip}@example.test`, "warehouse");
    expect((await catalogPOST(req("/api/admin/catalog", "POST", body, { cookie: wh }))).status).toBe(403);
    expect((await productPATCH(req("/api/admin/catalog/mock_011", "PATCH", body, { cookie: wh }), p({ id: "mock_011" }))).status).toBe(403);
    // Mock / platform catalogue: the owner may read but nothing can be written here.
    const list = await (await catalogGET(req("/api/admin/catalog", "GET", undefined, { cookie: owner }))).json();
    expect(list.editable).toBe(false);
    const res = await catalogPOST(req("/api/admin/catalog", "POST", body, { cookie: owner }));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("catalog_readonly");
    expect((await catalogPOST(req("/api/admin/catalog", "POST", body, { cookie: owner, headers: { origin: "https://evil.example" } }))).status).toBe(403);
  });

  it("password-reset links: owner only, never for yourself, one use, MFA still required, audited", async () => {
    const email = `forgot-${ip}@example.test`;
    const staffCookie = await invite(email, "support");
    const id = (await (await staffGET(req("/api/admin/staff", "GET", undefined, { cookie: owner }))).json()).staff.find((s: { email: string }) => s.email === email).id;
    const me = (await (await staffGET(req("/api/admin/staff", "GET", undefined, { cookie: owner }))).json()).staff.find((s: { email: string }) => s.email === "owner@example.test").id;
    const link = (cookie?: string, target = id, origin = ORIGIN) => resetLinkPOST(req(`/api/admin/staff/${target}/reset-link`, "POST", {}, { cookie, headers: { origin } }), p({ id: target }));

    expect((await link()).status).toBe(401);
    expect((await link(staffCookie)).status).toBe(403);
    expect((await link(owner, me)).status).toBe(409);
    expect((await link(owner, "stf_000000000000000000")).status).toBe(404);
    expect((await link(owner, id, "https://evil.example")).status).toBe(403);

    const res = await link(owner);
    expect(res.status).toBe(201);
    const { resetPath } = await res.json();
    expect(resetPath).toMatch(/^\/admin\/reset\/[A-Za-z0-9_-]{40,60}$/);
    const open = (await (await staffGET(req("/api/admin/staff", "GET", undefined, { cookie: owner }))).json()).invites;
    expect(open.find((i: { email: string; kind: string }) => i.email === email)).toMatchObject({ kind: "reset" });

    const token = resetPath.split("/").pop();
    const NEW = "my brand new passphrase";
    expect((await acceptPOST(req("/api/admin/invite/accept", "POST", { token, password: "short" }))).status).toBe(422);
    expect((await acceptPOST(req("/api/admin/invite/accept", "POST", { token, password: NEW }))).status).toBe(201);
    expect((await acceptPOST(req("/api/admin/invite/accept", "POST", { token, password: "someone elses passphrase" }))).status).toBe(410);
    // Old session is gone; old password fails; the new password alone still only gives a TOTP ticket.
    expect((await dashGET(req("/api/admin/dashboard", "GET", undefined, { cookie: staffCookie }))).status).toBe(401);
    expect((await loginPOST(req("/api/admin/login", "POST", { email, password: "another strong passphrase" }))).status).toBe(401);
    const login = await loginPOST(req("/api/admin/login", "POST", { email, password: NEW }));
    expect(cookieOf(login, "ah_admin")).toBeUndefined();
    expect((await login.json()).step).toBe("totp");
    expect(await adminSignIn(email, NEW)).toBeTruthy();
    const actions = (await resolveAudit().list({ target: id })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["staff.password_reset_link", "staff.password_reset"]));
  });

  it("forgot password by email code: works for an owner, same answer for unknown emails, code scoped + single use, MFA kept", async () => {
    const email = `owner-forgot-${ip}@example.test`;
    const oldCookie = await invite(email, "owner");
    const forgot = (body: unknown, headers: Record<string, string> = {}) => forgotPOST(req("/api/admin/password/forgot", "POST", body, { headers }));
    const resetCall = (body: unknown) => resetPOST(req("/api/admin/password/reset", "POST", body));

    // No enumeration: an unknown address gets the same 200 + challengeId shape (and no email goes out).
    const sentBefore = demoMail().sent.length;
    const unknown = await forgot({ email: `nobody-${ip}@example.test` });
    expect(unknown.status).toBe(200);
    expect(Object.keys(await unknown.json()).sort()).toEqual(["challengeId", "expiresInSeconds"]);
    expect(demoMail().sent.length).toBe(sentBefore);
    expect((await forgot({ email: "not-an-email" })).status).toBe(422);
    expect((await forgot({ email, extra: 1 })).status).toBe(422);
    expect((await forgot({ email }, { origin: "https://evil.example" })).status).toBe(403);

    rateLimiter.reset(); // the probes above used up this IP's 5 requests
    const res = await forgot({ email });
    expect(res.status).toBe(200);
    const { challengeId, demoCode } = await res.json();
    expect(demoCode).toMatch(/^\d{6}$/);
    expect(demoMail().sent.at(-1)).toMatchObject({ to: email });
    expect(demoMail().sent.at(-1)!.text).toContain(demoCode);

    // The admin code never signs anyone in on the customer OTP endpoint (purpose-scoped hash).
    expect((await otpVerify(req("/api/otp/verify", "POST", { challengeId, code: demoCode }))).status).not.toBe(200);

    const NEW = "owner chose a fresh passphrase";
    expect((await resetCall({ email, challengeId, code: demoCode, password: "short" })).status).toBe(422); // weak: code not burned
    expect((await resetCall({ email: `nobody-${ip}@example.test`, challengeId, code: demoCode, password: NEW })).status).toBe(400); // code is bound to its email
    // That wrong-email try consumed the code, so ask again (same flow a real person would follow).
    tick();
    const again = await (await forgot({ email })).json();
    expect((await resetCall({ email, challengeId: again.challengeId, code: again.demoCode === "000000" ? "111111" : "000000", password: NEW })).status).toBe(400);
    const ok = await resetCall({ email, challengeId: again.challengeId, code: again.demoCode, password: NEW });
    expect(ok.status).toBe(200);
    expect(cookieOf(ok, "ah_admin")).toBeUndefined(); // no session from a reset
    expect((await resetCall({ email, challengeId: again.challengeId, code: again.demoCode, password: "a third long passphrase" })).status).toBe(400); // single use

    expect((await dashGET(req("/api/admin/dashboard", "GET", undefined, { cookie: oldCookie }))).status).toBe(401); // old sessions revoked
    expect((await loginPOST(req("/api/admin/login", "POST", { email, password: "another strong passphrase" }))).status).toBe(401);
    expect((await (await loginPOST(req("/api/admin/login", "POST", { email, password: NEW }))).json()).step).toBe("totp"); // MFA still required
    expect(await adminSignIn(email, NEW)).toBeTruthy();
    expect(demoMail().sent.at(-1)).toMatchObject({ to: email, subject: expect.stringContaining("password was changed") });
    const id = (await resolveStaffStore().byEmail(email))!.id;
    expect((await resolveAudit().list({ target: id })).map((a) => a.action)).toContain("staff.password_reset");
  });

  it("forgot password fails closed without an email provider in production", async () => {
    const disabled = resolveEmail({ NODE_ENV: "production" });
    expect(disabled.enabled).toBe(false);
    await expect(requestResetCode("owner@example.test", { mailer: disabled })).rejects.toMatchObject({ status: 503, code: "email_unavailable" });
  });

  it("forgot password is rate-limited per IP", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await forgotPOST(req("/api/admin/password/forgot", "POST", { email: `rl-${i}@example.test` }))).status);
    expect(codes.slice(0, 5).every((c) => c === 200)).toBe(true);
    expect(codes[5]).toBe(429);
  });

  it("subscribers: footer sign-ups show up masked; only subscribers.read; CSV has full contacts, is formula-safe and audited", async () => {
    const tag = `sub${ip}x${Date.now().toString(36)}`;
    const join = (channel: string, contact: string) => newsletterPOST(req("/api/newsletter", "POST", { channel, contact, consent: true }));
    expect((await join("email", `${tag}@example.test`)).status).toBe(201);
    expect((await join("email", `=cmd${tag}@example.test`)).status).toBe(201);

    expect(can("marketing", "subscribers.read")).toBe(true);
    for (const role of ["warehouse", "support", "catalog_editor", "finance"] as const) expect(can(role, "subscribers.read")).toBe(false);
    expect((await subscribersGET(req("/api/admin/subscribers", "GET"))).status).toBe(401);
    const wh = await invite(`wh-sub-${ip}@example.test`, "warehouse");
    expect((await subscribersGET(req("/api/admin/subscribers", "GET", undefined, { cookie: wh }))).status).toBe(403);
    expect((await subscribersExportGET(req("/api/admin/subscribers/export", "GET", undefined, { cookie: wh }))).status).toBe(403);

    const list = await (await subscribersGET(req(`/api/admin/subscribers?q=${tag}&channel=email&status=bogus&page=-3`, "GET", undefined, { cookie: owner }))).json();
    expect(list.total).toBe(2);
    expect(list.page).toBe(1);
    for (const r of list.rows) {
      expect(r.contact).not.toContain(tag); // masked on screen
      expect(r.contact).toMatch(/^.{2}\*+@example\.test$/);
    }

    const csvRes = await subscribersExportGET(req(`/api/admin/subscribers/export?q=${tag}`, "GET", undefined, { cookie: owner }));
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers.get("content-type")).toContain("text/csv");
    const csv = await csvRes.text();
    expect(csv).toContain(`"${tag}@example.test"`);
    expect(csv).toContain(`"'=cmd${tag}@example.test"`); // formula neutralised
    const audits = await resolveAudit().list({ target: "newsletter" });
    expect(audits[0]).toMatchObject({ action: "subscribers.export_csv", details: { count: 2 } });
  });

  it("cross-site admin writes are refused (CSRF)", async () => {
    const res = await actionPOST(req("/api/admin/orders/AH12345678/action", "POST", { action: "packed" }, { cookie: owner, headers: { origin: "https://evil.example" } }), p({ number: "AH12345678" }));
    expect(res.status).toBe(403);
  });
});

describe("operations", () => {
  it("hold blocks packing; ship issues AWB + invoice; label is audited; everything lands in the audit log", async () => {
    const number = await codOrder(`97200${String(ip).padStart(5, "0")}`);
    const act = (action: string, extra: Record<string, unknown> = {}) => actionPOST(req(`/api/admin/orders/${number}/action`, "POST", { action, ...extra }, { cookie: owner }), p({ number }));
    expect((await act("hold")).status).toBe(422);
    expect((await act("hold", { reason: "Confirm by phone" })).status).toBe(200);
    expect((await act("packed")).status).toBe(409);
    expect((await act("release")).status).toBe(200);
    expect((await act("packed")).status).toBe(200);
    expect((await act("delivered")).status).toBe(409);
    expect((await act("shipped")).status).toBe(200);
    const label = await (await labelGET(req(`/api/admin/orders/${number}/label`, "GET", undefined, { cookie: owner }), p({ number }))).json();
    expect(label.label.awb).toMatch(/^\d{12}$/);
    expect(label.label.cod).toBeGreaterThan(0);
    const log = (await (await auditGET(req(`/api/admin/audit?target=${number}`, "GET", undefined, { cookie: owner }))).json()).rows.map((r: { action: string }) => r.action);
    expect(log).toEqual(expect.arrayContaining(["order.hold", "order.release", "order.packed", "order.shipped", "order.label_viewed"]));
  });

  it("admin cancel after packing refunds stock; credit adjustments respect role limits", async () => {
    const number = await codOrder(`97300${String(ip).padStart(5, "0")}`);
    await actionPOST(req(`/api/admin/orders/${number}/action`, "POST", { action: "packed" }, { cookie: owner }), p({ number }));
    expect((await actionPOST(req(`/api/admin/orders/${number}/action`, "POST", { action: "cancel", reason: "Customer called to cancel" }, { cookie: owner }), p({ number }))).status).toBe(200);

    const support = await invite(`sup-${ip}@example.test`, "support");
    const mgr = await invite(`mgr-${ip}@example.test`, "store_manager");
    const list = await (await import("@/lib/customers/store")).resolveCustomers().search(`97300${String(ip).padStart(5, "0")}`.slice(-6));
    const cid = list[0].id;
    expect((await creditPOST(req(`/api/admin/customers/${cid}`, "POST", { action: "credit", amount: 10_000, reason: "Goodwill" }, { cookie: support }), p({ id: cid }))).status).toBe(403);
    expect((await creditPOST(req(`/api/admin/customers/${cid}`, "POST", { action: "credit", amount: 500_000, reason: "Goodwill" }, { cookie: mgr }), p({ id: cid }))).status).toBe(403);
    expect((await creditPOST(req(`/api/admin/customers/${cid}`, "POST", { action: "credit", amount: 10_000, reason: "Goodwill" }, { cookie: mgr }), p({ id: cid }))).status).toBe(200);
    expect((await creditPOST(req(`/api/admin/customers/${cid}`, "POST", { action: "credit", amount: -50_000, reason: "Oops" }, { cookie: owner }), p({ id: cid }))).status).toBe(422);
  });

  it("inventory adjustments are validated, never negative, and audited", async () => {
    const res = await inventoryPOST(req("/api/admin/inventory", "POST", { productId: product.id, size, delta: 3, reason: "Cycle count" }, { cookie: owner }));
    expect(res.status).toBe(200);
    expect((await inventoryPOST(req("/api/admin/inventory", "POST", { productId: product.id, size, delta: -100_000, reason: "x" }, { cookie: owner }))).status).toBe(422);
    expect((await inventoryPOST(req("/api/admin/inventory", "POST", { productId: product.id, size, delta: 1 }, { cookie: owner }))).status).toBe(422);
    expect((await resolveAudit().list({ target: `${product.id}:${size}` })).length).toBeGreaterThan(0);
  });

  it("returns: unknown steps rejected; CSV export neutralises formulas", async () => {
    expect((await returnActionPOST(req("/api/admin/returns/RT0000000000/action", "POST", { to: "refund_everything" }, { cookie: owner }), p({ number: "RT0000000000" }))).status).toBe(422);
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("+91")).toBe("\"'+91\"");
    const csv = await csvGET(req("/api/admin/reports/orders?days=30", "GET", undefined, { cookie: owner }));
    expect(csv.headers.get("content-disposition")).toContain("attachment");
    expect(await csv.text()).not.toContain("9876543210");
  });
});

describe("categories & collections: authorization (lib/catalog/taxonomy.ts)", () => {
  it("no session → 401; no catalog.read → 403; read-only roles can't save; cross-origin refused; mock catalogue is read-only", async () => {
    expect((await categoriesGET(req("/api/admin/categories", "GET"))).status).toBe(401);
    expect((await categoriesPUT(req("/api/admin/categories", "PUT", { revision: 0, tree: [] }))).status).toBe(401);

    const support = await invite(`support-tax-${ip}@example.test`, "support");
    expect((await categoriesGET(req("/api/admin/categories", "GET", undefined, { cookie: support }))).status).toBe(403);
    expect((await collectionsGET(req("/api/admin/collections", "GET", undefined, { cookie: support }))).status).toBe(403);

    const marketing = await invite(`mkt-tax-${ip}@example.test`, "marketing");
    expect((await categoriesPUT(req("/api/admin/categories", "PUT", { revision: 0, tree: [] }, { cookie: marketing }))).status).toBe(403);
    expect((await collectionsPUT(req("/api/admin/collections", "PUT", { revision: 0, collections: [] }, { cookie: marketing }))).status).toBe(403);

    const evil = await categoriesPUT(req("/api/admin/categories", "PUT", { revision: 0, tree: [] }, { cookie: owner, headers: { origin: "https://evil.example" } }));
    expect(evil.status).toBe(403);

    // COMMERCE_PROVIDER is not "own" here: the catalogue belongs to its platform and nothing can be written.
    expect((await categoriesGET(req("/api/admin/categories", "GET", undefined, { cookie: owner }))).status).toBe(409);
    expect((await categoriesPUT(req("/api/admin/categories", "PUT", { revision: 0, tree: [] }, { cookie: owner }))).status).toBe(409);
    expect((await collectionPreviewPOST(req("/api/admin/collections/preview", "POST", { builder: {} }, { cookie: owner }))).status).toBe(409);
  });
});

describe("style editor routes: authorization", () => {
  it("401 without a session, 403 without catalog permissions, cross-origin refused, read-only provider 409", async () => {
    const sp = p({ styleId: "style_abc" });
    expect((await styleGET(req("/api/admin/styles/style_abc", "GET"), sp)).status).toBe(401);
    expect((await stylesPOST(req("/api/admin/styles", "POST", {}))).status).toBe(401);
    expect((await stylePUT(req("/api/admin/styles/style_abc", "PUT", {}), sp)).status).toBe(401);

    const support = await invite(`support-style-${ip}@example.test`, "support");
    expect((await styleGET(req("/api/admin/styles/style_abc", "GET", undefined, { cookie: support }), sp)).status).toBe(403);
    const marketing = await invite(`mkt-style-${ip}@example.test`, "marketing");
    expect((await stylesPOST(req("/api/admin/styles", "POST", {}, { cookie: marketing }))).status).toBe(403);
    expect((await stylePUT(req("/api/admin/styles/style_abc", "PUT", {}, { cookie: marketing }), sp)).status).toBe(403);

    expect((await stylesPOST(req("/api/admin/styles", "POST", {}, { cookie: owner, headers: { origin: "https://evil.example" } }))).status).toBe(403);
    expect((await stylesPOST(req("/api/admin/styles", "POST", {}, { cookie: owner }))).status).toBe(409);
    expect((await styleGET(req("/api/admin/styles/style_abc", "GET", undefined, { cookie: owner }), sp)).status).toBe(409);
  });
});

describe("catalogue bulk / CSV routes: authorization", () => {
  it("401 without a session, 403 without catalog.write (read-only roles may export, not import), cross-origin refused", async () => {
    expect((await bulkPOST(req("/api/admin/catalog/bulk", "POST", {}))).status).toBe(401);
    expect((await importPOST(req("/api/admin/catalog/import", "POST", {}))).status).toBe(401);
    expect((await exportGET(req("/api/admin/catalog/export", "GET"))).status).toBe(401);

    const support = await invite(`support-csv-${ip}@example.test`, "support");
    expect((await exportGET(req("/api/admin/catalog/export", "GET", undefined, { cookie: support }))).status).toBe(403);
    const marketing = await invite(`mkt-csv-${ip}@example.test`, "marketing");
    expect((await bulkPOST(req("/api/admin/catalog/bulk", "POST", { action: "archive", styleIds: ["style_a"] }, { cookie: marketing }))).status).toBe(403);
    expect((await importPOST(req("/api/admin/catalog/import", "POST", { csv: "x", apply: true }, { cookie: marketing }))).status).toBe(403);

    const evil = { cookie: owner, headers: { origin: "https://evil.example" } };
    expect((await bulkPOST(req("/api/admin/catalog/bulk", "POST", {}, evil))).status).toBe(403);
    expect((await importPOST(req("/api/admin/catalog/import", "POST", {}, evil))).status).toBe(403);

    // Mock / platform catalogue: read-only.
    expect((await bulkPOST(req("/api/admin/catalog/bulk", "POST", { action: "archive", styleIds: ["style_a"] }, { cookie: owner }))).status).toBe(409);
    expect((await importPOST(req("/api/admin/catalog/import", "POST", { csv: "x", apply: false }, { cookie: owner }))).status).toBe(409);
    expect((await exportGET(req("/api/admin/catalog/export", "GET", undefined, { cookie: owner }))).status).toBe(409);
  });
});

describe("settings (owner only, lib/settings)", () => {
  const put = (group: string, body: unknown, cookie?: string, headers?: Record<string, string>) =>
    settingsPUT(req(`/api/admin/settings/${group}`, "PUT", body, { cookie, headers }), p({ group }));
  const wipe = async () => {
    const store = resolveSettingsStore();
    await store.write({ set: {}, clear: (await store.all()).map((r) => r.key) }, "test");
    resetSettingsRuntime();
  };

  it("401 without a session; 403 for every role but the owner; cross-origin refused; unknown group and field rejected", async () => {
    try {
      expect((await settingsGET(req("/api/admin/settings", "GET"))).status).toBe(401);
      expect((await put("general", { fields: { SUPPORT_HOURS: "x" } })).status).toBe(401);
      for (const role of Object.keys(ROLE_PERMISSIONS)) if (role !== "owner") expect(can(role as never, "settings.manage"), role).toBe(false);
      const manager = await invite(`mgr-${ip}@example.test`, "store_manager");
      expect((await settingsGET(req("/api/admin/settings", "GET", undefined, { cookie: manager }))).status).toBe(403);
      expect((await put("checkout", { fields: { CHECKOUT_ENABLED: false } }, manager)).status).toBe(403);
      expect((await put("general", { fields: { SUPPORT_HOURS: "x" } }, owner, { origin: "https://evil.example" })).status).toBe(403);
      expect((await put("nope", { fields: {} }, owner)).status).toBe(404);
      expect((await put("general", { fields: { ALLOW_MOCK_PAYMENTS: "true" } }, owner)).status).toBe(422);
      expect((await put("general", { fields: { DATABASE_URL: "mysql://x" } }, owner)).status).toBe(422);
      expect(await resolveSettingsStore().all()).toEqual([]);
    } finally {
      await wipe();
    }
  });

  it("owner saves a group: in use at once, field errors returned, audit names the fields but never the values", async () => {
    try {
      const bad = await put("general", { fields: { SUPPORT_EMAIL: "nope", SOCIAL_INSTAGRAM_URL: "javascript:alert(1)" } }, owner);
      expect(bad.status).toBe(422);
      expect(Object.keys((await bad.json()).error.fields).sort()).toEqual(["SOCIAL_INSTAGRAM_URL", "SUPPORT_EMAIL"]);

      const ok = await put("general", { fields: { SUPPORT_EMAIL: "care@example.test" } }, owner);
      expect(ok.status).toBe(200);
      expect(ok.headers.get("cache-control")).toContain("no-store");
      expect((await ok.json()).changed).toEqual(["SUPPORT_EMAIL"]);
      expect(process.env.SUPPORT_EMAIL).toBe("care@example.test");

      // Kill switch: checkout off stops new orders on the very next request.
      expect((await put("checkout", { fields: { CHECKOUT_ENABLED: false } }, owner)).status).toBe(200);
      expect(process.env.CHECKOUT_ENABLED).toBe("false");

      const audits = await resolveAudit().list({ target: "settings:general" });
      expect(audits[0]).toMatchObject({ action: "settings.update", details: { fields: "SUPPORT_EMAIL", count: 1 } });
      expect(JSON.stringify(audits)).not.toContain("care@example.test");
    } finally {
      await wipe();
    }
  });

  it("payment keys need a fresh authenticator code (step-up), are never sent back, and wrong codes are limited", async () => {
    try {
      const secret = "rzp-secret-value-ABCDEFGH123";
      const body = { fields: { RAZORPAY_KEY_SECRET: secret } };
      expect((await put("payments", body, owner)).status).toBe(401); // no code
      expect((await put("payments", { ...body, code: "000000" }, owner)).status).toBe(401);
      // The code that signed this session in can't be replayed for the step-up.
      const used = totpAt(secrets.get("owner@example.test")!, Math.floor(Date.now() / 30_000));
      expect((await put("payments", { ...body, code: used }, owner)).status).toBe(401);
      expect(await resolveSettingsStore().all()).toEqual([]);

      tick();
      const code = totpAt(secrets.get("owner@example.test")!, Math.floor(Date.now() / 30_000));
      const ok = await put("payments", { ...body, code }, owner);
      expect(ok.status).toBe(200);
      const text = await ok.text();
      expect(text).not.toContain(secret);
      const page = await (await settingsGET(req("/api/admin/settings", "GET", undefined, { cookie: owner }))).text();
      expect(page).not.toContain(secret);
      expect(JSON.stringify(await resolveAudit().list({ target: "settings:payments" }))).not.toContain(secret);

      // Guessing is capped per staff member (10 per 10 minutes), whatever the IP.
      let last = 0;
      for (let i = 0; i < 11; i++) last = (await put("payments", { ...body, code: "111111" }, owner, { "x-forwarded-for": `100.70.0.${i + 1}` })).status;
      expect(last).toBe(429);
    } finally {
      await wipe();
    }
  });
});

describe("SMS providers (owner only, lib/providers)", () => {
  const KEY = "abcDEF1234567890abcd";
  const BODY = { name: "MSG91 main", driver: "msg91", credentials: { auth_key: KEY }, senderId: "ALPHAH", otpTemplate: "tmpl_otp_1", templates: {} };
  const act = (id: string, action: string, body: unknown, cookie?: string, headers?: Record<string, string>) =>
    smsACTION(req(`/api/admin/sms-providers/${id}/${action}`, "POST", body, { cookie, headers }), p({ id, action }));
  const freshCode = () => (tick(), totpAt(secrets.get("owner@example.test")!, Math.floor(Date.now() / 30_000)));
  const wipe = async () => {
    const store = resolveProviderStore();
    await store.setActive("sms", null);
    for (const r of await store.list("sms")) await store.remove("sms", r.id);
    setActiveSms(null);
    vi.unstubAllGlobals();
  };

  it("401 without a session, 403 for non-owners, cross-origin refused, on every route", async () => {
    try {
      const manager = await invite(`sms-${ip}@example.test`, "store_manager");
      const id = "prv_00000000000000000000";
      for (const [cookie, status] of [[undefined, 401], [manager, 403]] as const) {
        expect((await smsGET(req("/api/admin/sms-providers", "GET", undefined, { cookie }))).status).toBe(status);
        expect((await smsPOST(req("/api/admin/sms-providers", "POST", BODY, { cookie }))).status).toBe(status);
        expect((await smsPATCH(req(`/api/admin/sms-providers/${id}`, "PATCH", BODY, { cookie }), p({ id }))).status).toBe(status);
        expect((await smsDELETE(req(`/api/admin/sms-providers/${id}`, "DELETE", {}, { cookie }), p({ id }))).status).toBe(status);
        for (const action of ["test", "activate", "deactivate"]) expect((await act(id, action, {}, cookie)).status).toBe(status);
      }
      expect((await smsPOST(req("/api/admin/sms-providers", "POST", BODY, { cookie: owner, headers: { origin: "https://evil.example" } }))).status).toBe(403);
      expect(await resolveProviderStore().list("sms")).toEqual([]);
    } finally {
      await wipe();
    }
  });

  it("add → test → make live (fresh TOTP) → sign-in codes go through it; keys never come back; audited without keys", async () => {
    try {
      const sent: string[] = [];
      vi.stubGlobal("fetch", async (url: string) => (sent.push(String(url)), new Response(JSON.stringify({ type: "success", request_id: "r1" }))));
      const made = await smsPOST(req("/api/admin/sms-providers", "POST", BODY, { cookie: owner }));
      expect(made.status).toBe(201);
      const { provider } = await made.json();
      const id = provider.id as string;
      expect(JSON.stringify(provider)).not.toContain(KEY);
      expect((await smsPOST(req("/api/admin/sms-providers", "POST", { ...BODY, driver: "http://evil" }, { cookie: owner }))).status).toBe(422);

      // Not tested yet → can't go live, even with a valid code.
      expect((await act(id, "activate", { code: freshCode() }, owner)).status).toBe(409);
      expect((await act(id, "test", { to: "12345" }, owner)).status).toBe(422);
      const tested = await act(id, "test", { to: "9876543210" }, owner);
      expect(await tested.json()).toMatchObject({ ok: true, provider: { verified: true } });
      expect(sent[0]).toContain("https://control.msg91.com/api/v5/otp?");

      // Going live needs a fresh authenticator code.
      expect((await act(id, "activate", {}, owner)).status).toBe(401);
      expect((await act(id, "activate", { code: "000000" }, owner)).status).toBe(401);
      expect(resolveSms().name).toBe("demo");
      expect((await act(id, "activate", { code: freshCode() }, owner)).status).toBe(200);
      expect(resolveSms().name).toBe("msg91");

      // A customer sign-in code now leaves through the live provider — and is not echoed back.
      sent.length = 0;
      const otp = await (await otpSend(req("/api/otp/send", "POST", { phone: `98111${String(ip).padStart(5, "0")}` }))).json();
      expect(otp.demoCode).toBeUndefined();
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatch(/^https:\/\/control\.msg91\.com\/api\/v5\/otp\?template_id=tmpl_otp_1&mobile=9198111\d{5}&otp=\d{6}$/);

      // Live: can't be deleted; editing needs a code; page and audit never hold the key.
      expect((await smsDELETE(req(`/api/admin/sms-providers/${id}`, "DELETE", {}, { cookie: owner }), p({ id }))).status).toBe(409);
      expect((await smsPATCH(req(`/api/admin/sms-providers/${id}`, "PATCH", { ...BODY, name: "Renamed", credentials: {} }, { cookie: owner }), p({ id }))).status).toBe(401);
      expect((await smsPATCH(req(`/api/admin/sms-providers/${id}`, "PATCH", { ...BODY, name: "Renamed", credentials: {}, code: freshCode() }, { cookie: owner }), p({ id }))).status).toBe(200);
      const page = await (await smsGET(req("/api/admin/sms-providers", "GET", undefined, { cookie: owner }))).text();
      expect(page).not.toContain(KEY);
      expect(page).toContain("abcD••••cd");
      const audits = await resolveAudit().list({ target: `sms_provider:${id}` });
      expect(audits.map((a) => a.action)).toEqual(expect.arrayContaining(["sms_provider.create", "sms_provider.test", "sms_provider.activate", "sms_provider.update"]));
      expect(JSON.stringify(audits)).not.toContain(KEY);

      expect((await act(id, "deactivate", { code: freshCode() }, owner)).status).toBe(200);
      expect(resolveSms().name).toBe("demo");
      expect((await act(id, "wipe", { code: "123456" }, owner)).status).toBe(404);
    } finally {
      await wipe();
    }
  });

  it("test SMS is capped per staff member (paid API)", async () => {
    try {
      vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ type: "success" })));
      const id = (await (await smsPOST(req("/api/admin/sms-providers", "POST", BODY, { cookie: owner }))).json()).provider.id as string;
      let last = 0;
      for (let i = 0; i < 6; i++) last = (await act(id, "test", { to: "9876543210" }, owner, { "x-forwarded-for": `100.71.0.${i + 1}` })).status;
      expect(last).toBe(429);
    } finally {
      await wipe();
    }
  });
});
