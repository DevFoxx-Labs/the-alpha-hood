import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE as unlinkDELETE, GET as socialAccountGET } from "@/app/api/account/social/route";
import { GET as callbackGET } from "@/app/api/auth/social/[provider]/callback/route";
import { GET as startGET } from "@/app/api/auth/social/[provider]/start/route";
import { GET as providersGET } from "@/app/api/auth/social/route";
import { POST as otpSend } from "@/app/api/otp/send/route";
import { POST as otpVerify } from "@/app/api/otp/verify/route";
import { rateLimiter } from "@/lib/http/rate-limit";
import { finishSignIn, LINK_COOKIE, OAUTH_COOKIE, openPendingLink, safeNext, sealPendingLink, SocialError, startSignIn } from "./social";
import { resolveSocialIdentities } from "./social-identities";
import { resolveLedger } from "@/lib/consent/ledger";
import { resolveCustomers } from "@/lib/customers/store";

// `connection()` only works inside a Next.js request; outside one (tests) it is a no-op here.
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => undefined }));

const GOOGLE_ID = "1234567890-abcdefghijklmnopqrstuvwxyz012345.apps.googleusercontent.com";
const GOOGLE_SECRET = ["GOCSPX", "test-only-not-a-secret00"].join("-"); // built at runtime: no key-shaped literal in git
const FB_ID = "1234567890123";
const FB_SECRET = "0123456789abcdef0123456789abcdef";
const ENV = { NODE_ENV: "test", SITE_URL: "https://shop.example.in", GOOGLE_CLIENT_ID: GOOGLE_ID, GOOGLE_CLIENT_SECRET: GOOGLE_SECRET, FACEBOOK_APP_ID: FB_ID, FACEBOOK_APP_SECRET: FB_SECRET };

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const idToken = (claims: Record<string, unknown>) => `${b64({ alg: "RS256" })}.${b64(claims)}.sig`;

function begin(provider: "google" | "facebook", next = "/account") {
  const { url, cookie } = startSignIn(provider, next, ENV);
  const q = new URL(url).searchParams;
  return { url: new URL(url), state: q.get("state")!, nonce: q.get("nonce"), cookie };
}

/** Fake Google: token endpoint returns an ID token with these claims (merged over valid ones). */
function google(nonce: string, over: Record<string, unknown> = {}) {
  const calls: { url: string; body: string }[] = [];
  const fetcher = async (url: string, init: RequestInit) => {
    calls.push({ url, body: String(init.body ?? "") });
    const claims = { iss: "https://accounts.google.com", aud: GOOGLE_ID, sub: "109876543210", email: "buyer@gmail.com", email_verified: true, name: "Asha Buyer", exp: Math.floor(Date.now() / 1000) + 600, nonce, ...over };
    return new Response(JSON.stringify({ id_token: idToken(claims), access_token: "ya29.x" }));
  };
  return { calls, fetcher };
}

describe("OAuth flow (lib/auth/social.ts)", () => {
  it("start: Google gets state + nonce + PKCE S256 and the exact redirect URI; Facebook gets state; the cookie is sealed", () => {
    const g = begin("google");
    expect(g.url.origin + g.url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(g.url.searchParams)).toMatchObject({ client_id: GOOGLE_ID, redirect_uri: "https://shop.example.in/api/auth/social/google/callback", response_type: "code", scope: "openid email profile", code_challenge_method: "S256" });
    expect(g.url.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(g.cookie).not.toContain(g.state); // state is inside the sealed cookie, not readable
    const f = begin("facebook");
    expect(f.url.origin + f.url.pathname).toBe("https://www.facebook.com/dialog/oauth");
    expect(f.url.searchParams.get("redirect_uri")).toBe("https://shop.example.in/api/auth/social/facebook/callback");
    expect(f.url.searchParams.has("client_secret")).toBe(false);
    expect(g.url.toString()).not.toContain(GOOGLE_SECRET);
    expect(() => startSignIn("google", "/", { NODE_ENV: "test" })).toThrow(SocialError);
  });

  it("next: same-site paths only (no open redirect)", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "/x\r\nSet-Cookie: a=b", ""]) expect(safeNext(bad), bad).toBe("/account");
    expect(safeNext("/checkout?step=address")).toBe("/checkout?step=address");
  });

  it("callback refuses a missing / foreign / expired state (login CSRF) before any provider call", async () => {
    const g = begin("google");
    const other = begin("google");
    const f = google(g.nonce!);
    const q = (state: string) => new URLSearchParams({ state, code: "4/0AbCdEfGhIjKlMnOp" });
    await expect(finishSignIn("google", q(g.state), undefined, ENV, f.fetcher)).rejects.toMatchObject({ code: "state" });
    await expect(finishSignIn("google", q(g.state), other.cookie, ENV, f.fetcher)).rejects.toMatchObject({ code: "state" });
    await expect(finishSignIn("google", q(g.state), "tampered" + g.cookie.slice(8), ENV, f.fetcher)).rejects.toMatchObject({ code: "state" });
    await expect(finishSignIn("facebook", q(g.state), g.cookie, ENV, f.fetcher)).rejects.toMatchObject({ code: "state" });
    await expect(finishSignIn("google", q(g.state), g.cookie, ENV, f.fetcher, Date.now() + 11 * 60_000)).rejects.toMatchObject({ code: "state" });
    await expect(finishSignIn("google", new URLSearchParams({ state: g.state, error: "access_denied" }), g.cookie, ENV, f.fetcher)).rejects.toMatchObject({ code: "denied" });
    expect(f.calls).toEqual([]);
  });

  it("Google: code + PKCE verifier exchanged with the secret on the server; ID token checked (iss, aud, exp, nonce)", async () => {
    const g = begin("google");
    const ok = google(g.nonce!);
    const p = await finishSignIn("google", new URLSearchParams({ state: g.state, code: "4/0AbCdEfGhIjKlMnOp" }), g.cookie, ENV, ok.fetcher);
    expect(p).toEqual({ provider: "google", subject: "109876543210", email: "buyer@gmail.com", name: "Asha Buyer", next: "/account" });
    expect(ok.calls[0].url).toBe("https://oauth2.googleapis.com/token");
    const sent = Object.fromEntries(new URLSearchParams(ok.calls[0].body));
    expect(sent).toMatchObject({ client_secret: GOOGLE_SECRET, grant_type: "authorization_code", redirect_uri: "https://shop.example.in/api/auth/social/google/callback" });
    expect(sent.code_verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);

    for (const bad of [{ aud: "someone-else.apps.googleusercontent.com" }, { iss: "https://evil.example" }, { nonce: "replayed" }, { exp: Math.floor(Date.now() / 1000) - 3600 }, { sub: "../x" }]) {
      const again = begin("google");
      await expect(finishSignIn("google", new URLSearchParams({ state: again.state, code: "4/0AbCdEfGhIjKlMnOp" }), again.cookie, ENV, google(again.nonce!, bad).fetcher), JSON.stringify(bad)).rejects.toBeInstanceOf(SocialError);
    }
    const unverified = begin("google");
    const u = await finishSignIn("google", new URLSearchParams({ state: unverified.state, code: "4/0AbCdEfGhIjKlMnOp" }), unverified.cookie, ENV, google(unverified.nonce!, { email_verified: false }).fetcher);
    expect(u.email).toBeNull(); // an unverified email is never used
  });

  it("Facebook: appsecret_proof on the profile call; the email is never asked for or used", async () => {
    const f = begin("facebook");
    const calls: string[] = [];
    const fetcher = async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify(url.includes("/oauth/access_token") ? { access_token: "EAAGtoken1234567890abcdef" } : { id: "10220011223344", name: "Ravi Buyer", email: "ravi@example.com" }));
    };
    const p = await finishSignIn("facebook", new URLSearchParams({ state: f.state, code: "AQBxyz0123456789" }), f.cookie, ENV, fetcher);
    expect(p).toMatchObject({ subject: "10220011223344", name: "Ravi Buyer", email: null });
    expect(new URL(calls[0]).origin).toBe("https://graph.facebook.com");
    const me = new URL(calls[1]);
    expect(me.searchParams.get("fields")).toBe("id,name");
    expect(me.searchParams.get("appsecret_proof")).toBe(createHmac("sha256", FB_SECRET).update("EAAGtoken1234567890abcdef").digest("hex"));
  });

  it("pending link: sealed, expires after 10 minutes, tampering is ignored", () => {
    const sealed = sealPendingLink({ provider: "google", subject: "109876543210", email: "a@b.co", name: null }, ENV);
    expect(openPendingLink(sealed, ENV)).toMatchObject({ provider: "google", subject: "109876543210" });
    expect(openPendingLink(sealed, ENV, Date.now() + 11 * 60_000)).toBeNull();
    expect(openPendingLink(`x${sealed.slice(1)}`, ENV)).toBeNull();
    expect(openPendingLink("not-base64!", ENV)).toBeNull();
  });
});

describe("social sign-in routes", () => {
  let n = 0;
  const req = (url: string, init: { method?: string; body?: unknown; cookie?: string } = {}) =>
    new Request(`http://localhost:3000${url}`, {
      method: init.method ?? "GET",
      headers: { "content-type": "application/json", origin: "http://localhost:3000", "x-forwarded-for": `100.90.0.${(++n % 250) + 1}`, ...(init.cookie ? { cookie: init.cookie } : {}) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  const p = <T extends object>(v: T) => ({ params: Promise.resolve(v) });
  const cookieOf = (res: Response, name: string) => res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`))?.split(";")[0];

  beforeEach(() => {
    rateLimiter.reset();
    for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
    vi.stubEnv("CHECKOUT_ENABLED", "true");
    vi.stubEnv("ACCOUNTS_ENABLED", "true");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  /** Runs start → (fake Google) → callback and returns the callback response. */
  async function googleSignIn(sub: string, cookie = "", over: Record<string, unknown> = {}) {
    const start = await startGET(req("/api/auth/social/google/start?next=/account/orders"), p({ provider: "google" }));
    expect(start.status).toBe(303);
    const to = new URL(start.headers.get("location")!);
    const oauth = cookieOf(start, OAUTH_COOKIE)!;
    vi.stubGlobal("fetch", google(to.searchParams.get("nonce")!, { sub, ...over }).fetcher);
    const cb = await callbackGET(req(`/api/auth/social/google/callback?state=${to.searchParams.get("state")}&code=4%2F0AbCdEfGhIjKl`, { cookie: [oauth, cookie].filter(Boolean).join("; ") }), p({ provider: "google" }));
    vi.unstubAllGlobals();
    return cb;
  }
  async function phoneSignIn(phone: string, cookie = "") {
    const sent = await (await otpSend(req("/api/otp/send", { method: "POST", body: { phone } }))).json();
    return otpVerify(req("/api/otp/verify", { method: "POST", body: { challengeId: sent.challengeId, code: sent.demoCode }, cookie }));
  }

  it("buttons only for configured providers; unknown or unconfigured provider → 404", async () => {
    expect(await (await providersGET()).json()).toEqual({ providers: ["google", "facebook"] });
    vi.stubEnv("FACEBOOK_APP_SECRET", "");
    expect(await (await providersGET()).json()).toEqual({ providers: ["google"] });
    expect((await startGET(req("/api/auth/social/facebook/start"), p({ provider: "facebook" }))).status).toBe(404);
    expect((await startGET(req("/api/auth/social/apple/start"), p({ provider: "apple" }))).status).toBe(404);
    vi.stubEnv("CHECKOUT_ENABLED", "false");
    vi.stubEnv("ACCOUNTS_ENABLED", "false");
    expect(await (await providersGET()).json()).toEqual({ providers: [] });
  });

  it("Google without a verified email: verify the mobile once, then the Google account is linked and signs straight in", async () => {
    const sub = `1${Date.now()}`;
    const first = await googleSignIn(sub, "", { email_verified: false });
    expect(first.headers.get("location")).toBe("http://localhost:3000/account?link=google");
    expect(cookieOf(first, "ah_session")).toBeUndefined(); // the social account alone never opens an account
    const pending = cookieOf(first, LINK_COOKIE)!;
    expect(pending).toBeTruthy();
    expect(await resolveSocialIdentities().find("google", sub)).toBeNull();

    const verified = await phoneSignIn("9822200011", pending);
    expect(await verified.json()).toMatchObject({ ok: true, linked: "google" });
    expect(cookieOf(verified, LINK_COOKIE)).toBe(`${LINK_COOKIE}=`); // cleared
    const link = await resolveSocialIdentities().find("google", sub);
    expect(link).toMatchObject({ provider: "google", email: null });

    const again = await googleSignIn(sub, "", { email_verified: false });
    expect(again.headers.get("location")).toBe("http://localhost:3000/account/orders");
    expect(cookieOf(again, "ah_session")).toBeTruthy();
    expect(cookieOf(again, OAUTH_COOKIE)).toBe(`${OAUTH_COOKIE}=`);
  });

  it("signed in: links to the current customer; a social account linked elsewhere is refused; unlink works", async () => {
    const session = cookieOf(await phoneSignIn("9822200022"), "ah_session")!;
    const sub = `2${Date.now()}`;
    const linked = await googleSignIn(sub, session);
    expect(linked.headers.get("location")).toBe("http://localhost:3000/account/settings?social=linked");
    const mine = await (await socialAccountGET(req("/api/account/social", { cookie: session }))).json();
    expect(mine.linked.map((l: { provider: string }) => l.provider)).toEqual(["google"]);
    expect(JSON.stringify(mine)).not.toContain(sub);

    // Someone else, signed in, tries to link the same Google account.
    const other = cookieOf(await phoneSignIn("9822200033"), "ah_session")!;
    expect((await googleSignIn(sub, other)).headers.get("location")).toBe("http://localhost:3000/account/settings?social=other_account");

    expect((await unlinkDELETE(req("/api/account/social", { method: "DELETE", body: { provider: "google" }, cookie: session }))).status).toBe(200);
    expect(await resolveSocialIdentities().find("google", sub)).toBeNull();
    expect((await unlinkDELETE(req("/api/account/social", { method: "DELETE", body: { provider: "google" } }))).status).toBe(401);
    expect((await unlinkDELETE(req("/api/account/social", { method: "DELETE", body: { provider: "x" }, cookie: session }))).status).toBe(422);
  });

  it("ACC-01 Google sign-up: a Google-verified email creates the account (consent recorded); next time signs straight in", async () => {
    const sub = `3${Date.now()}`;
    const email = `g${sub}@gmail.com`;
    const first = await googleSignIn(sub, "", { email });
    expect(first.headers.get("location")).toBe("http://localhost:3000/account/orders");
    const session = cookieOf(first, "ah_session")!;
    expect(session).toBeTruthy();
    const me = await (await socialAccountGET(req("/api/account/social", { cookie: session }))).json();
    expect(me.methods).toEqual({ phone: null, email, password: false });
    const link = (await resolveSocialIdentities().find("google", sub))!;
    expect((await resolveLedger().listByUser(link.customerId)).map((r) => [r.purpose, r.status, r.method])).toEqual([["terms_privacy", "granted", "signup_notice"]]);
    // Google + its verified email are two ways in. Remove the email → Google is the last one and can't be unlinked.
    const { PATCH: mePATCH } = await import("@/app/api/account/me/route");
    expect((await mePATCH(req("/api/account/me", { method: "PATCH", body: { email: "" }, cookie: session }))).status).toBe(200);
    const last = await unlinkDELETE(req("/api/account/social", { method: "DELETE", body: { provider: "google" }, cookie: session }));
    expect(last.status).toBe(409);
    expect((await last.json()).error.code).toBe("last_method");
    const again = await googleSignIn(sub, "", { email });
    expect(cookieOf(again, "ah_session")).toBeTruthy();
    expect((await resolveSocialIdentities().find("google", sub))!.customerId).toBe(link.customerId);
  });

  it("account takeover: a Google account never opens an existing account that signs in with the same email", async () => {
    const email = `victim${Date.now()}@example.com`;
    const { customer: victim } = await resolveCustomers().findOrCreateByEmail(email);
    const sub = `4${Date.now()}`;
    const res = await googleSignIn(sub, "", { email });
    expect(res.headers.get("location")).toBe("http://localhost:3000/account?social=email_in_use");
    expect(cookieOf(res, "ah_session")).toBeUndefined();
    expect(await resolveSocialIdentities().find("google", sub)).toBeNull();
    expect(await resolveSocialIdentities().listFor(victim.id)).toEqual([]);
  });

  it("a forged callback (no cookie, wrong state) never signs anyone in", async () => {
    vi.stubGlobal("fetch", google("n").fetcher);
    const forged = await callbackGET(req("/api/auth/social/google/callback?state=abc&code=4%2F0AbCdEfGhIjKl"), p({ provider: "google" }));
    expect(forged.headers.get("location")).toBe("http://localhost:3000/account?social=expired");
    expect(cookieOf(forged, "ah_session")).toBeUndefined();
    expect(cookieOf(forged, LINK_COOKIE)).toBeUndefined();
  });
});
