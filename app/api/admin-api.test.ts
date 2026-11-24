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
    const PUBLIC = ["setup", "login", join("totp", "enrol"), join("totp", "verify"), "logout", join("invite", "accept")].map((x) => join("admin", x, "route.ts"));
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
    expect(readFileSync(join(panel, "layout.tsx"), "utf8")).toContain("<AdminShell>");
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
