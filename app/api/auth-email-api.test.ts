import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryCredentialStore, customerPasswordProblem, isBreachedPassword, resolveCredentials } from "@/lib/auth/passwords";
import { emailAuthKey } from "@/lib/auth/email-auth";
import { resolveLedger } from "@/lib/consent/ledger";
import { resolveCustomers } from "@/lib/customers/store";
import { rateLimiter } from "@/lib/http/rate-limit";
import { POST as accountPassword } from "./account/password/route";
import { GET as meGET, PATCH as mePATCH } from "./account/me/route";
import { GET as methodsGET } from "./account/social/route";
import { POST as emailSend } from "./auth/email/send/route";
import { POST as emailVerify } from "./auth/email/verify/route";
import { POST as passwordLogin } from "./auth/password/route";
import { POST as resetPOST } from "./auth/password/reset/route";
import { POST as otpSend } from "./otp/send/route";
import { POST as otpVerify } from "./otp/verify/route";
import { POST as placePOST } from "./checkout/place/route";
import { POST as quotePOST } from "./checkout/quote/route";
import { POST as addressPOST } from "./checkout/addresses/route";
import { POST as linePOST } from "./cart/lines/route";
import { MOCK_PRODUCTS } from "@/lib/commerce/mock/data";

/**
 * ACC-01 email sign-in / sign-up / password — one test per abuse case (secure-development §0.3):
 * enumeration, brute force, code reuse / cross-address codes, consent, weak passwords, session revocation,
 * account takeover through an unverified email, IDOR between customers, and the last-sign-in-method guard.
 */
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => undefined }));

const ORIGIN = "http://localhost:3000";
let ip = 0;
function req(path: string, method: string, body?: unknown, { cookie, sameIp }: { cookie?: string; sameIp?: string } = {}) {
  const h = new Headers({ "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": sameIp ?? `198.51.${Math.floor(++ip / 250) % 250}.${(ip % 250) + 1}` });
  if (cookie) h.set("cookie", cookie);
  return new Request(`${ORIGIN}${path}`, { method, headers: h, body: method === "GET" ? undefined : JSON.stringify(body ?? {}) });
}
const cookieOf = (res: Response, name: string) => res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`))?.split(";")[0];
const STRONG = "correct horse battery staple";
let seq = 0;
const freshEmail = () => `buyer${Date.now()}${++seq}@example.com`;

async function sendCode(email: string) {
  const res = await emailSend(req("/api/auth/email/send", "POST", { email }));
  expect(res.status).toBe(200);
  return (await res.json()) as { challengeId: string; demoCode: string };
}
async function signUp(email: string, password = STRONG) {
  const sent = await sendCode(email);
  const res = await emailVerify(req("/api/auth/email/verify", "POST", { email, challengeId: sent.challengeId, code: sent.demoCode, intent: "signup", password, acceptTerms: true, name: "Asha Buyer" }));
  expect(res.status).toBe(200);
  return cookieOf(res, "ah_session")!;
}
const login = (email: string, password: string, sameIp?: string) => passwordLogin(req("/api/auth/password", "POST", { email, password }, { sameIp }));
const me = async (cookie: string) => meGET(req("/api/account/me", "GET", undefined, { cookie }));

/** Moves the clock past the 30 s per-address resend cooldown (only Date is faked). */
const later = (ms = 31_000) => vi.setSystemTime(Date.now() + ms);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  rateLimiter.reset();
  vi.stubEnv("CHECKOUT_ENABLED", "true");
  vi.stubEnv("COD_ENABLED", "true");
  vi.stubEnv("ACCOUNTS_ENABLED", "true");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("password policy (NIST 800-63B)", () => {
  it("length 8–128, no composition rules, common / repeated / own-email passwords refused", () => {
    expect(customerPasswordProblem("short")).toMatch(/at least 8/);
    expect(customerPasswordProblem("x".repeat(129))).toMatch(/at most 128/);
    expect(customerPasswordProblem("password123")).toMatch(/too easy/);
    expect(customerPasswordProblem("aaaaaaaaaa")).toMatch(/too easy/);
    expect(customerPasswordProblem("asha.buyer2026", ["asha.buyer@example.com"])).toMatch(/email or name/);
    expect(customerPasswordProblem(STRONG)).toBeNull();
    expect(customerPasswordProblem("सुरक्षित पासवर्ड")).toBeNull(); // any characters
  });

  it("breach check: k-anonymity (only 5 hash characters leave), fails open, off outside production", async () => {
    const urls: string[] = [];
    // SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
    const fetcher = async (url: string) => {
      urls.push(url);
      return new Response("1E4C9B93F3F0682250B6CF8331B7EE68FD8:3861493\r\n0000000000000000000000000000000000A:0");
    };
    expect(await isBreachedPassword("password", { NODE_ENV: "production" }, fetcher)).toBe(true);
    expect(urls).toEqual(["https://api.pwnedpasswords.com/range/5BAA6"]);
    expect(await isBreachedPassword("password", { NODE_ENV: "development" }, fetcher)).toBe(false);
    expect(await isBreachedPassword("password", { NODE_ENV: "production", PASSWORD_BREACH_CHECK: "off" }, fetcher)).toBe(false);
    const down = async () => {
      throw new Error("timeout");
    };
    expect(await isBreachedPassword("password", { NODE_ENV: "production" }, down)).toBe(false);
  });

  it("hashes are scrypt with a random salt; the same password hashes differently", async () => {
    const store = createMemoryCredentialStore();
    const { hashCustomerPassword } = await import("@/lib/auth/passwords");
    const [a, b] = await Promise.all([hashCustomerPassword(STRONG), hashCustomerPassword(STRONG)]);
    expect(a).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    expect(a).not.toBe(b);
    await store.set("x", a);
    expect((await store.get("x"))!.hash).not.toContain(STRONG);
  });
});

describe("email sign-up / sign-in / reset routes", () => {
  it("sign-up: code + password + ticked Terms → account, session, consent row with method checkbox", async () => {
    const email = freshEmail();
    const session = await signUp(email);
    const body = await (await me(session)).json();
    expect(body.customer).toMatchObject({ phone: null, email, emailVerified: true, loginEmail: email, name: "Asha Buyer" });
    const customer = (await resolveCustomers().findByLoginEmail(email))!;
    const rows = await resolveLedger().listByUser(customer.id);
    expect(rows.map((r) => [r.purpose, r.status, r.method])).toEqual([["terms_privacy", "granted", "checkbox"]]);
    expect(rows[0].notice_version).toMatch(/terms@.+;privacy@.+/);
    expect(JSON.stringify(body)).not.toMatch(/scrypt|password_hash/);
  });

  it("sign-up fails without the Terms checkbox (server-side) — and the code is NOT used up by the mistake", async () => {
    const email = freshEmail();
    const sent = await sendCode(email);
    for (const acceptTerms of [undefined, false, "true", 1]) {
      const res = await emailVerify(req("/api/auth/email/verify", "POST", { email, challengeId: sent.challengeId, code: sent.demoCode, intent: "signup", password: STRONG, ...(acceptTerms === undefined ? {} : { acceptTerms }) }));
      expect(res.status).toBe(422);
      expect((await res.json()).error.code).toBe("terms_required");
    }
    expect(await resolveCustomers().findByLoginEmail(email)).toBeNull();
    const weak = await emailVerify(req("/api/auth/email/verify", "POST", { email, challengeId: sent.challengeId, code: sent.demoCode, intent: "signup", password: "12345678", acceptTerms: true }));
    expect((await weak.json()).error.code).toBe("weak_password");
    const ok = await emailVerify(req("/api/auth/email/verify", "POST", { email, challengeId: sent.challengeId, code: sent.demoCode, intent: "signup", password: STRONG, acceptTerms: true }));
    expect(ok.status).toBe(200);
  });

  it("no enumeration: sending a code answers identically for new and existing addresses", async () => {
    const existing = freshEmail();
    await signUp(existing);
    later();
    const a = await emailSend(req("/api/auth/email/send", "POST", { email: existing }));
    const b = await emailSend(req("/api/auth/email/send", "POST", { email: freshEmail() }));
    const keys = (o: object) => Object.keys(o).sort();
    expect(a.status).toBe(b.status);
    expect(keys(await a.json())).toEqual(keys(await b.json()));
  });

  it("a code is single-use, bound to its address, and can't be replayed or used on another address", async () => {
    const email = freshEmail();
    const other = freshEmail();
    const sent = await sendCode(email);
    const cross = await emailVerify(req("/api/auth/email/verify", "POST", { email: other, challengeId: sent.challengeId, code: sent.demoCode, intent: "signin" }));
    expect(cross.status).toBe(422);
    expect(await resolveCustomers().findByLoginEmail(other)).toBeNull();
    // The cross-address attempt didn't consume it; the right address works once…
    const ok = await emailVerify(req("/api/auth/email/verify", "POST", { email, challengeId: sent.challengeId, code: sent.demoCode, intent: "signin" }));
    expect(ok.status).toBe(200);
    // …and never again.
    const replay = await emailVerify(req("/api/auth/email/verify", "POST", { email, challengeId: sent.challengeId, code: sent.demoCode, intent: "signin" }));
    expect(replay.status).toBe(422);
    expect(emailAuthKey(email)).toHaveLength(16);
    expect(emailAuthKey(email)).not.toContain(email.split("@")[0]);
  });

  it("wrong codes lock the challenge after 5 tries (brute force on a 6-digit code)", async () => {
    const email = freshEmail();
    const sent = await sendCode(email);
    const wrong = sent.demoCode === "000000" ? "111111" : "000000";
    const codes = [];
    for (let i = 0; i < 6; i++) codes.push((await (await emailVerify(req("/api/auth/email/verify", "POST", { email, challengeId: sent.challengeId, code: wrong, intent: "signin" }))).json()).error.code);
    expect(codes.at(-1)).toBe("locked");
    const late = await emailVerify(req("/api/auth/email/verify", "POST", { email, challengeId: sent.challengeId, code: sent.demoCode, intent: "signin" }));
    expect(late.status).toBe(422);
  });

  it("email bombing: 30 s cooldown and hourly cap per address; per-IP limit", async () => {
    const email = freshEmail();
    await sendCode(email);
    const again = await emailSend(req("/api/auth/email/send", "POST", { email }));
    expect(again.status).toBe(429);
    expect(again.headers.get("Retry-After")).toBeTruthy();
    const fixed = "203.0.113.77";
    const statuses = [];
    for (let i = 0; i < 6; i++) statuses.push((await emailSend(req("/api/auth/email/send", "POST", { email: freshEmail() }, { sameIp: fixed }))).status);
    expect(statuses.slice(0, 5).every((s) => s === 200)).toBe(true);
    expect(statuses[5]).toBe(429);
  });

  it("password sign-in: right password → session; wrong / unknown / no-password all get the same 401", async () => {
    const email = freshEmail();
    await signUp(email);
    const good = await login(email, STRONG);
    expect(good.status).toBe(200);
    expect(cookieOf(good, "ah_session")).toBeTruthy();
    expect(cookieOf(good, "ah_session")).toMatch(/HttpOnly|ah_session=/);

    const codeOnly = freshEmail(); // an account that signs in by code only (no password)
    const sent = await sendCode(codeOnly);
    await emailVerify(req("/api/auth/email/verify", "POST", { email: codeOnly, challengeId: sent.challengeId, code: sent.demoCode, intent: "signin" }));

    const bodies = [];
    for (const [e, pw] of [[email, "wrong password!"], [freshEmail(), STRONG], [codeOnly, STRONG], ["not-an-email", STRONG], [email, ""]] as const) {
      const res = await login(e, pw);
      expect(res.status, e).toBe(401);
      expect(cookieOf(res, "ah_session")).toBeUndefined();
      bodies.push(JSON.stringify(await res.json()));
    }
    expect(new Set(bodies).size).toBe(1);
  });

  it("brute force: 8 tries per address per 15 min even across many IPs; the limit looks the same for unknown addresses", async () => {
    const email = freshEmail();
    await signUp(email);
    const statuses = [];
    for (let i = 0; i < 9; i++) statuses.push((await login(email, `wrong guess ${i}`)).status);
    expect(statuses.slice(0, 8).every((s) => s === 401)).toBe(true);
    expect(statuses[8]).toBe(429);
    // Even the right password is refused while locked (the attacker can't confirm a guess).
    expect((await login(email, STRONG)).status).toBe(429);
    const unknown = freshEmail();
    for (let i = 0; i < 8; i++) await login(unknown, "x".repeat(10));
    expect((await login(unknown, "x".repeat(10))).status).toBe(429);
  });

  it("forgot password: code + new password resets it, signs out every other session, old password stops working", async () => {
    const email = freshEmail();
    const s1 = await signUp(email);
    const s2 = cookieOf(await login(email, STRONG), "ah_session")!;
    later();
    const sent = await sendCode(email);
    const reset = await emailVerify(req("/api/auth/email/verify", "POST", { email, challengeId: sent.challengeId, code: sent.demoCode, intent: "reset", password: "a brand new phrase 42" }));
    expect(reset.status).toBe(200);
    const s3 = cookieOf(reset, "ah_session")!;
    expect((await me(s1)).status).toBe(401);
    expect((await me(s2)).status).toBe(401);
    expect((await me(s3)).status).toBe(200);
    expect((await login(email, STRONG)).status).toBe(401);
    expect((await login(email, "a brand new phrase 42")).status).toBe(200);
  });

  it("forgot password in 3 steps: code verified FIRST (no sign-in yet), then the new password with a single-use ticket", async () => {
    const email = freshEmail();
    const old = await signUp(email);
    later();
    // Step 1: code to the email.
    const sent = await sendCode(email);
    // Step 2a: a wrong code gives no ticket.
    const wrong = sent.demoCode === "000000" ? "111111" : "000000";
    const bad = await emailVerify(req("/api/auth/email/verify", "POST", { email, challengeId: sent.challengeId, code: wrong, intent: "reset" }));
    expect(bad.status).toBe(422);
    expect(cookieOf(bad, "ah_reset")).toBeUndefined();
    // Step 2b: the right code → ticket cookie, nobody signed in, password unchanged.
    const ok = await emailVerify(req("/api/auth/email/verify", "POST", { email, challengeId: sent.challengeId, code: sent.demoCode, intent: "reset" }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true, step: "new_password" });
    const ticketHeader = ok.headers.getSetCookie().find((c) => c.startsWith("ah_reset="))!;
    expect(ticketHeader).toMatch(/HttpOnly/i);
    expect(ticketHeader).toMatch(/SameSite=Strict/i);
    expect(ticketHeader).toMatch(/Path=\/api\/auth\/password/);
    expect(cookieOf(ok, "ah_session")).toBeUndefined();
    expect((await login(email, STRONG)).status).toBe(200);
    // The code is used up by step 2.
    expect((await emailVerify(req("/api/auth/email/verify", "POST", { email, challengeId: sent.challengeId, code: sent.demoCode, intent: "reset" }))).status).toBe(422);

    const ticket = cookieOf(ok, "ah_reset")!;
    // Step 3: a weak password is refused and the ticket stays usable…
    expect((await resetPOST(req("/api/auth/password/reset", "POST", { password: "12345678" }, { cookie: ticket }))).status).toBe(422);
    // …a good one saves it, signs out every other session and signs this browser in.
    const done = await resetPOST(req("/api/auth/password/reset", "POST", { password: "fresh reset phrase 77" }, { cookie: ticket }));
    expect(done.status).toBe(200);
    expect(cookieOf(done, "ah_session")).toBeTruthy();
    expect((await me(old)).status).toBe(401);
    expect((await login(email, STRONG)).status).toBe(401);
    expect((await login(email, "fresh reset phrase 77")).status).toBe(200);
    // Single use: the same ticket can't set another password.
    const replay = await resetPOST(req("/api/auth/password/reset", "POST", { password: "attacker phrase 999" }, { cookie: ticket }));
    expect(replay.status).toBe(410);
    expect((await login(email, "attacker phrase 999")).status).toBe(401);
  });

  it("reset step 3 without a valid ticket does nothing (missing, forged, tampered)", async () => {
    for (const cookie of [undefined, "ah_reset=", `ah_reset=${"A".repeat(120)}`, "ah_reset=not-base64!!"]) {
      const res = await resetPOST(req("/api/auth/password/reset", "POST", { password: "some good phrase 1" }, { cookie }));
      expect(res.status, String(cookie)).toBe(410);
      expect(cookieOf(res, "ah_session")).toBeUndefined();
    }
    expect((await resetPOST(req("/api/auth/password/reset", "POST", { password: "x", customerId: "cus_victim" }))).status).toBe(422);
  });

  it("reset for an address without an account creates nothing", async () => {
    const email = freshEmail();
    const sent = await sendCode(email);
    const res = await emailVerify(req("/api/auth/email/verify", "POST", { email, challengeId: sent.challengeId, code: sent.demoCode, intent: "reset", password: STRONG }));
    expect(res.status).toBe(404);
    expect(await resolveCustomers().findByLoginEmail(email)).toBeNull();
  });

  it("change password: needs the current one; signs out other sessions; a stolen session alone can't change it", async () => {
    const email = freshEmail();
    const s1 = await signUp(email);
    const s2 = cookieOf(await login(email, STRONG), "ah_session")!;
    const wrong = await accountPassword(req("/api/account/password", "POST", { currentPassword: "guess guess", newPassword: "another fine phrase" }, { cookie: s2 }));
    expect(wrong.status).toBe(403);
    expect((await accountPassword(req("/api/account/password", "POST", { currentPassword: STRONG, newPassword: "another fine phrase" }))).status).toBe(401);
    const ok = await accountPassword(req("/api/account/password", "POST", { currentPassword: STRONG, newPassword: "another fine phrase" }, { cookie: s2 }));
    expect(ok.status).toBe(200);
    expect((await me(s1)).status).toBe(401);
    expect((await me(cookieOf(ok, "ah_session")!)).status).toBe(200);
    // 5 wrong current passwords per 15 min per account.
    const fresh = cookieOf(ok, "ah_session")!;
    const tries = [];
    for (let i = 0; i < 6; i++) tries.push((await accountPassword(req("/api/account/password", "POST", { currentPassword: `nope ${i}xxxx`, newPassword: "yet another phrase" }, { cookie: fresh }))).status);
    expect(tries.at(-1)).toBe(429);
  });

  it("unknown fields (role, customerId, verified…) are refused — nothing is taken from the client", async () => {
    const email = freshEmail();
    const sent = await sendCode(email);
    const res = await emailVerify(req("/api/auth/email/verify", "POST", { email, challengeId: sent.challengeId, code: sent.demoCode, intent: "signin", customerId: "cus_victim" }));
    expect(res.status).toBe(422);
    expect((await passwordLogin(req("/api/auth/password", "POST", { email, password: STRONG, role: "admin" }))).status).toBe(422);
    expect((await emailSend(req("/api/auth/email/send", "POST", { email, verified: true }))).status).toBe(422);
  });

  it("cross-site requests are refused (CSRF), oversized bodies too", async () => {
    const r = new Request(`${ORIGIN}/api/auth/password`, { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" }, body: JSON.stringify({ email: "a@b.co", password: STRONG }) });
    expect((await passwordLogin(r)).status).toBe(403);
    expect((await passwordLogin(req("/api/auth/password", "POST", { email: "a@b.co", password: "x".repeat(2000) }))).status).toBe(413);
  });

  it("sign-in switched off → 503 on every email route (fail closed)", async () => {
    vi.stubEnv("CHECKOUT_ENABLED", "false");
    vi.stubEnv("ACCOUNTS_ENABLED", "false");
    expect((await emailSend(req("/api/auth/email/send", "POST", { email: freshEmail() }))).status).toBe(503);
    expect((await passwordLogin(req("/api/auth/password", "POST", { email: freshEmail(), password: STRONG }))).status).toBe(503);
  });
});

describe("account takeover & data isolation", () => {
  it("an UNVERIFIED email typed into someone's profile never signs anyone in and can't block the real owner", async () => {
    // Attacker signs up by phone and types the victim's address into their profile.
    const victimEmail = freshEmail();
    const sent = await (await otpSend(req("/api/otp/send", "POST", { phone: "9811100001" }))).json();
    const attacker = cookieOf(await otpVerify(req("/api/otp/verify", "POST", { challengeId: sent.challengeId, code: sent.demoCode })), "ah_session")!;
    expect((await mePATCH(req("/api/account/me", "PATCH", { email: victimEmail }, { cookie: attacker }))).status).toBe(200);
    // Password / code sign-in for that address do not reach the attacker's account…
    expect((await login(victimEmail, STRONG)).status).toBe(401);
    // …and the real owner can still create their own account with it.
    const victim = await signUp(victimEmail);
    const v = await (await me(victim)).json();
    const a = await (await me(attacker)).json();
    expect(v.customer.loginEmail).toBe(victimEmail);
    expect(a.customer.loginEmail ?? null).toBeNull();
  });

  it("each session sees only its own account (no IDOR through any client-sent ID)", async () => {
    const s1 = await signUp(freshEmail());
    const s2 = await signUp(freshEmail());
    const a = await (await me(s1)).json();
    const b = await (await me(s2)).json();
    expect(a.customer.email).not.toBe(b.customer.email);
    // /api/account/me takes no ID at all; a forged or random cookie is just "signed out".
    expect((await me("ah_session=" + "A".repeat(43))).status).toBe(401);
    expect((await me("")).status).toBe(401);
  });

  it("phoneless account: adding a verified mobile attaches it; a mobile owned by another account switches nothing", async () => {
    const email = freshEmail();
    const session = await signUp(email);
    // Another customer already owns this number.
    const taken = await (await otpSend(req("/api/otp/send", "POST", { phone: "9811100002" }))).json();
    await otpVerify(req("/api/otp/verify", "POST", { challengeId: taken.challengeId, code: taken.demoCode }));

    const mine = await (await otpSend(req("/api/otp/send", "POST", { phone: "9811100003" }))).json();
    const attached = await otpVerify(req("/api/otp/verify", "POST", { challengeId: mine.challengeId, code: mine.demoCode }, { cookie: session }));
    expect(await attached.json()).toMatchObject({ ok: true, attached: true });
    const after = await (await me(cookieOf(attached, "ah_session")!)).json();
    expect(after.customer).toMatchObject({ loginEmail: email, phone: "+91 ••••••0003" });

    const methods = await (await methodsGET(req("/api/account/social", "GET", undefined, { cookie: cookieOf(attached, "ah_session")! }))).json();
    expect(methods.methods).toMatchObject({ phone: "+91 ••••••0003", email, password: true });
  });

  it("checkout refuses to place an order for an account without a verified mobile", async () => {
    const session = await signUp(freshEmail());
    const product = MOCK_PRODUCTS.find((x) => x.sizes.some((s) => s.stock >= 5))!;
    const size = product.sizes.find((s) => s.stock >= 5)!.label;
    const cart = cookieOf(await linePOST(req("/api/cart/lines", "POST", { productId: product.id, size, quantity: 1 })), "ah_cart")!;
    const cookie = `${session}; ${cart}`;
    const ADDRESS = { name: "Test Buyer", phone: "9876543210", pincode: "411045", line1: "Flat 12, Shanti Apartments, Baner Road", line2: "Baner", landmark: "", city: "Pune", state: "Maharashtra", type: "home" };
    const address = (await (await addressPOST(req("/api/checkout/addresses", "POST", ADDRESS, { cookie }))).json()).address;
    const q = await (await quotePOST(req("/api/checkout/quote", "POST", { addressId: address.id, payment: "cod" }, { cookie }))).json();
    const place = req("/api/checkout/place", "POST", { addressId: address.id, payment: "cod", expectedTotal: q.pricing.total }, { cookie });
    place.headers.set("idempotency-key", crypto.randomUUID());
    const res = await placePOST(place);
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("phone_required");
  });

  it("the last way in can't be removed: email-only account can't clear its email", async () => {
    const session = await signUp(freshEmail());
    const res = await mePATCH(req("/api/account/me", "PATCH", { email: "" }, { cookie: session }));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("last_method");
  });

  it("account deletion erases the password hash and frees the email", async () => {
    const email = freshEmail();
    const session = await signUp(email);
    const customer = (await resolveCustomers().findByLoginEmail(email))!;
    expect(await resolveCredentials().get(customer.id)).not.toBeNull();
    const { POST: deletePOST } = await import("./account/delete/route");
    expect((await deletePOST(req("/api/account/delete", "POST", { confirm: "DELETE" }, { cookie: session }))).status).toBe(200);
    expect(await resolveCredentials().get(customer.id)).toBeNull();
    expect(await resolveCustomers().findByLoginEmail(email)).toBeNull();
    expect((await login(email, STRONG)).status).toBe(401);
    expect((await me(session)).status).toBe(401);
  });
});
