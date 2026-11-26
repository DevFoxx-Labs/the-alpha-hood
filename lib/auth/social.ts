import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createSecretBox } from "@/lib/db/secret-box";
import type { Env } from "@/lib/mock-guard";
import { readSiteUrl } from "@/lib/seo/site";
import { normaliseEmail } from "@/lib/validation";
import { type SocialProvider, SOCIAL_PROVIDERS, SUBJECT_RE } from "./social-identities";

/**
 * Google and Facebook sign-in (OAuth 2.0 authorization code flow), keys from Admin → Settings → Social Sign-in.
 *
 * - `state` (random, bound to this browser in a sealed HttpOnly cookie) stops login CSRF: a code minted for
 *   someone else's browser is refused. Google also gets PKCE (S256) and an OpenID `nonce`.
 * - Every provider call goes to a fixed https host with a timeout and no redirects; the code is exchanged with the
 *   client secret on the server, so the browser never sees a token.
 * - Google's ID token is checked: issuer, audience = our client ID, expiry, nonce. It comes straight from Google's
 *   token endpoint over TLS, which OpenID Connect allows to stand in for a signature check.
 * - Facebook calls carry `appsecret_proof`, so a token stolen from elsewhere can't be used with our app.
 * - Only Google's `email_verified` email is ever trusted; Facebook's email is not used for anything.
 */
export class SocialError extends Error {
  constructor(
    public readonly code: "not_configured" | "state" | "denied" | "exchange" | "token" | "profile",
    message: string,
  ) {
    super(message);
    this.name = "SocialError";
  }
}

export interface SocialKeys {
  clientId: string;
  clientSecret: string;
}

const GOOGLE_ID_RE = /^[0-9]{6,20}-[0-9a-z]{20,40}\.apps\.googleusercontent\.com$/;
const KEY_RE = /^[0-9A-Za-z_-]{20,120}$/;

export function socialKeys(provider: SocialProvider, env: Env = process.env): SocialKeys | null {
  const id = (provider === "google" ? env.GOOGLE_CLIENT_ID : env.FACEBOOK_APP_ID)?.trim() ?? "";
  const secret = (provider === "google" ? env.GOOGLE_CLIENT_SECRET : env.FACEBOOK_APP_SECRET)?.trim() ?? "";
  const ok = provider === "google" ? GOOGLE_ID_RE.test(id) && KEY_RE.test(secret) : /^\d{10,20}$/.test(id) && /^[0-9a-f]{32}$/.test(secret);
  return ok ? { clientId: id, clientSecret: secret } : null;
}

export const enabledSocialProviders = (env: Env = process.env): SocialProvider[] => SOCIAL_PROVIDERS.filter((p) => socialKeys(p, env));
export const isSocialProvider = (v: unknown): v is SocialProvider => typeof v === "string" && (SOCIAL_PROVIDERS as readonly string[]).includes(v);

/** Must be registered exactly like this in the Google / Facebook console. */
export const redirectUri = (provider: SocialProvider, env: Env = process.env) => `${readSiteUrl(env)}/api/auth/social/${provider}/callback`;

/** Same-site relative paths only (no open redirect). */
export function safeNext(v: unknown): string {
  return typeof v === "string" && /^\/(?![/\\])[A-Za-z0-9/_\-?=&.%]{0,200}$/.test(v) ? v : "/account";
}

// ── Sealed short-lived cookies ──────────────────────────────────────────────────────────────

export const OAUTH_COOKIE = "ah_oauth";
export const LINK_COOKIE = "ah_social_link";
export const OAUTH_TTL_MS = 10 * 60_000;

function seal(value: unknown, env: Env): string {
  return Buffer.from(createSecretBox(env).seal(JSON.stringify(value))).toString("base64url");
}
function unseal<T>(raw: string | null | undefined, env: Env): T | null {
  if (!raw || raw.length > 4_000 || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  try {
    return JSON.parse(createSecretBox(env).open(Buffer.from(raw, "base64url").toString("utf8"))) as T;
  } catch {
    return null;
  }
}

interface OAuthState {
  p: SocialProvider;
  s: string;
  v: string;
  n: string;
  next: string;
  exp: number;
}

export interface PendingLink {
  provider: SocialProvider;
  subject: string;
  email: string | null;
  name: string | null;
  exp: number;
}

const b64url = (b: Buffer) => b.toString("base64url");

/** Where to send the browser, and the cookie that binds the flow to it. */
export function startSignIn(provider: SocialProvider, next: unknown, env: Env = process.env, now = Date.now()): { url: string; cookie: string } {
  const keys = socialKeys(provider, env);
  if (!keys) throw new SocialError("not_configured", "This sign-in option is not available.");
  const state: OAuthState = { p: provider, s: b64url(randomBytes(24)), v: b64url(randomBytes(32)), n: b64url(randomBytes(16)), next: safeNext(next), exp: now + OAUTH_TTL_MS };
  const params =
    provider === "google"
      ? new URLSearchParams({
          client_id: keys.clientId,
          redirect_uri: redirectUri(provider, env),
          response_type: "code",
          scope: "openid email profile",
          state: state.s,
          nonce: state.n,
          code_challenge: b64url(createHash("sha256").update(state.v).digest()),
          code_challenge_method: "S256",
          prompt: "select_account",
        })
      : new URLSearchParams({ client_id: keys.clientId, redirect_uri: redirectUri(provider, env), response_type: "code", scope: "email,public_profile", state: state.s });
  const base = provider === "google" ? "https://accounts.google.com/o/oauth2/v2/auth" : "https://www.facebook.com/dialog/oauth";
  return { url: `${base}?${params}`, cookie: seal(state, env) };
}

export interface SocialProfile {
  provider: SocialProvider;
  subject: string;
  /** Verified email (Google `email_verified` only), else null. */
  email: string | null;
  name: string | null;
  next: string;
}

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

async function getJson(fetcher: Fetcher, url: string, init: RequestInit, code: SocialError["code"]): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetcher(url, { ...init, redirect: "error", signal: AbortSignal.timeout(10_000), headers: { accept: "application/json", ...(init.headers as Record<string, string> | undefined) } });
  } catch {
    throw new SocialError(code, "Could not reach the sign-in provider.");
  }
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !data || typeof data !== "object") throw new SocialError(code, "The sign-in provider refused the request.");
  return data;
}

function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Checks the callback against the browser's cookie, exchanges the code and returns who signed in. */
export async function finishSignIn(
  provider: SocialProvider,
  query: URLSearchParams,
  cookie: string | null | undefined,
  env: Env = process.env,
  fetcher: Fetcher = fetch,
  now = Date.now(),
): Promise<SocialProfile> {
  const keys = socialKeys(provider, env);
  if (!keys) throw new SocialError("not_configured", "This sign-in option is not available.");
  const st = unseal<OAuthState>(cookie, env);
  const state = query.get("state") ?? "";
  if (!st || st.p !== provider || st.exp < now || !state || !sameText(state, st.s)) throw new SocialError("state", "This sign-in link has expired. Try again.");
  if (query.get("error")) throw new SocialError("denied", "Sign-in was cancelled.");
  const code = query.get("code") ?? "";
  if (!/^[0-9A-Za-z/_.%-]{10,2048}$/.test(code)) throw new SocialError("exchange", "The sign-in provider sent no code.");

  if (provider === "google") {
    const tok = await getJson(
      fetcher,
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code, client_id: keys.clientId, client_secret: keys.clientSecret, redirect_uri: redirectUri(provider, env), grant_type: "authorization_code", code_verifier: st.v }).toString(),
      },
      "exchange",
    );
    const idToken = typeof tok.id_token === "string" ? tok.id_token : "";
    const parts = idToken.split(".");
    if (parts.length !== 3) throw new SocialError("token", "Google sent an unreadable sign-in token.");
    let claims: Record<string, unknown>;
    try {
      claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
    } catch {
      throw new SocialError("token", "Google sent an unreadable sign-in token.");
    }
    const iss = claims.iss;
    const okIss = iss === "https://accounts.google.com" || iss === "accounts.google.com";
    const okAud = claims.aud === keys.clientId || (Array.isArray(claims.aud) && claims.aud.includes(keys.clientId) && claims.azp === keys.clientId);
    const exp = typeof claims.exp === "number" ? claims.exp * 1000 : 0;
    if (!okIss || !okAud || exp < now - 60_000 || typeof claims.nonce !== "string" || !sameText(claims.nonce, st.n)) throw new SocialError("token", "Google's sign-in token didn't match this sign-in.");
    const subject = typeof claims.sub === "string" ? claims.sub : "";
    if (!SUBJECT_RE.test(subject)) throw new SocialError("profile", "Google sent no account ID.");
    const email = claims.email_verified === true ? normaliseEmail(claims.email) : null;
    const name = typeof claims.name === "string" ? claims.name.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 80) || null : null;
    return { provider, subject, email, name, next: st.next };
  }

  const tokenUrl = `https://graph.facebook.com/oauth/access_token?${new URLSearchParams({ client_id: keys.clientId, client_secret: keys.clientSecret, redirect_uri: redirectUri(provider, env), code })}`;
  const tok = await getJson(fetcher, tokenUrl, { method: "GET" }, "exchange");
  const access = typeof tok.access_token === "string" ? tok.access_token : "";
  if (!/^[0-9A-Za-z_-]{20,1024}$/.test(access)) throw new SocialError("token", "Facebook sent no access token.");
  const proof = createHmac("sha256", keys.clientSecret).update(access).digest("hex");
  const me = await getJson(fetcher, `https://graph.facebook.com/me?${new URLSearchParams({ fields: "id,name", access_token: access, appsecret_proof: proof })}`, { method: "GET" }, "profile");
  const subject = typeof me.id === "string" ? me.id : "";
  if (!/^\d{1,40}$/.test(subject)) throw new SocialError("profile", "Facebook sent no account ID.");
  const name = typeof me.name === "string" ? me.name.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 80) || null : null;
  return { provider, subject, email: null, name, next: st.next };
}

export const sealPendingLink = (p: Omit<PendingLink, "exp">, env: Env = process.env, now = Date.now()) => seal({ ...p, exp: now + OAUTH_TTL_MS } satisfies PendingLink, env);

export function openPendingLink(raw: string | null | undefined, env: Env = process.env, now = Date.now()): PendingLink | null {
  const p = unseal<PendingLink>(raw, env);
  return p && p.exp >= now && (SOCIAL_PROVIDERS as readonly string[]).includes(p.provider) && SUBJECT_RE.test(p.subject) ? p : null;
}
