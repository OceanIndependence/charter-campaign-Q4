/**
 * Microsoft 365 (Entra ID) sign-in provider — SERVER-ONLY.
 *
 * OpenID Connect authorization-code flow with PKCE against the Ocean
 * Independence tenant, implemented on Node's crypto and fetch with no auth
 * library:
 *
 *   GET /api/auth/microsoft            → beginSignIn(): redirect to Microsoft
 *   GET /api/auth/microsoft/callback   → completeSignIn(): exchange the code,
 *                                        validate the ID token, mint the cookie
 *
 * The session cookie holds { id: oid, email, name, jobTitle, iat, exp }
 * signed with PORTAL_SESSION_SECRET (HMAC-SHA256); getIdentity() verifies
 * the signature and expiry on every request and never trusts the payload
 * otherwise. Nothing else in the app changes: ownership and consultant
 * records are already keyed on ConsultantIdentity.id (the oid) and matched
 * on email (consultant-session.ts).
 *
 * Who may sign in: only people with a consultant record. completeSignIn()
 * looks the record up by object ID, then by email, and refuses everyone
 * else before any cookie is set — an Ocean Independence account alone is
 * not enough (see NO_RECORD_ERROR).
 *
 * Environment:
 *   AZURE_AD_TENANT_ID, AZURE_AD_CLIENT_ID, AZURE_AD_CLIENT_SECRET,
 *   PORTAL_SESSION_SECRET (≥ 32 chars recommended)
 *   Optional: AZURE_AD_AUTHORITY_BASE (default https://login.microsoftonline.com)
 *             MS_GRAPH_BASE (default https://graph.microsoft.com) — both exist
 *             so the flow can be exercised against a local mock authority.
 *
 * Redirect URI registered on the app: https://<host>/api/auth/microsoft/callback
 * for every host that signs in (Entra allows no wildcards).
 */

import { createHash, createHmac, createPublicKey, randomBytes, timingSafeEqual, verify as cryptoVerify } from "node:crypto";
import type { AuthProvider, ConsultantIdentity } from "./types";

export const MICROSOFT_COOKIE = "oi_portal_identity";
/** Short-lived cookie carrying state, nonce and PKCE verifier between the two legs. */
export const MICROSOFT_FLOW_COOKIE = "oi_ms_auth";
export const MICROSOFT_START_PATH = "/api/auth/microsoft";
export const MICROSOFT_CALLBACK_PATH = "/api/auth/microsoft/callback";
/** Query flag the callback appends when a tenant account has no consultant record. */
export const NO_RECORD_ERROR = "no-record";

const SESSION_TTL_S = 7 * 24 * 60 * 60;
const FLOW_TTL_S = 10 * 60;
const CLOCK_SKEW_S = 60;
const JWKS_TTL_MS = 60 * 60 * 1000;
const SCOPES = "openid profile email User.Read";

/* ------------------------------------------------------------ config */

export interface MicrosoftConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  sessionSecret: string;
  authorityBase: string;
  graphBase: string;
}

export function microsoftConfig(): MicrosoftConfig | null {
  const tenantId = (process.env.AZURE_AD_TENANT_ID ?? "").trim();
  const clientId = (process.env.AZURE_AD_CLIENT_ID ?? "").trim();
  const clientSecret = (process.env.AZURE_AD_CLIENT_SECRET ?? "").trim();
  const sessionSecret = (process.env.PORTAL_SESSION_SECRET ?? "").trim();
  if (!tenantId || !clientId || !clientSecret || !sessionSecret) return null;
  return {
    tenantId,
    clientId,
    clientSecret,
    sessionSecret,
    authorityBase: (process.env.AZURE_AD_AUTHORITY_BASE ?? "https://login.microsoftonline.com").replace(/\/+$/, ""),
    graphBase: (process.env.MS_GRAPH_BASE ?? "https://graph.microsoft.com").replace(/\/+$/, ""),
  };
}

const authorizeUrl = (c: MicrosoftConfig) => `${c.authorityBase}/${c.tenantId}/oauth2/v2.0/authorize`;
const tokenUrl = (c: MicrosoftConfig) => `${c.authorityBase}/${c.tenantId}/oauth2/v2.0/token`;
const jwksUrl = (c: MicrosoftConfig) => `${c.authorityBase}/${c.tenantId}/discovery/v2.0/keys`;
const expectedIssuer = (c: MicrosoftConfig) => `${c.authorityBase}/${c.tenantId}/v2.0`;

/* ------------------------------------------------------------ helpers */

const b64url = (buf: Buffer | string) => Buffer.from(buf).toString("base64url");
const fromB64url = (s: string) => Buffer.from(s, "base64url");

function sign(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** `<base64url json>.<hmac>` — the shape of both cookies. */
function seal(secret: string, payload: unknown): string {
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(secret, body)}`;
}

function open<T>(secret: string, value: string | undefined): T | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = value.slice(0, dot);
  const mac = value.slice(dot + 1);
  if (!safeEqual(mac, sign(secret, body))) return null;
  try {
    return JSON.parse(fromB64url(body).toString("utf8")) as T;
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------- session */

interface SessionPayload {
  id: string;
  email: string;
  name: string;
  jobTitle: string;
  iat: number;
  exp: number;
}

export function makeSessionCookieValue(c: MicrosoftConfig, identity: ConsultantIdentity, now = Math.floor(Date.now() / 1000)): string {
  const payload: SessionPayload = {
    id: identity.id,
    email: identity.email,
    name: identity.name,
    jobTitle: identity.jobTitle ?? "",
    iat: now,
    exp: now + SESSION_TTL_S,
  };
  return seal(c.sessionSecret, payload);
}

export function readSessionCookieValue(c: MicrosoftConfig, value: string | undefined, now = Math.floor(Date.now() / 1000)): ConsultantIdentity | null {
  const p = open<SessionPayload>(c.sessionSecret, value);
  if (!p || typeof p.id !== "string" || !p.id || typeof p.exp !== "number" || p.exp <= now) return null;
  return { id: p.id, email: String(p.email ?? ""), name: String(p.name ?? ""), jobTitle: String(p.jobTitle ?? "") };
}

/* ------------------------------------------------------- flow: leg 1 */

interface FlowPayload {
  state: string;
  nonce: string;
  verifier: string;
  next: string;
  exp: number;
}

/** Only same-origin portal paths may be the post-sign-in destination. */
export function safeNext(next: string | null | undefined): string {
  const v = String(next ?? "");
  return /^\/portal(\/|$|\?)/.test(v) && !v.startsWith("//") ? v : "/portal";
}

/**
 * Where to send the browser, and the flow cookie to set alongside. The
 * redirect URI is built from the request origin so each registered host
 * (production, a preview) calls back to itself.
 */
export function beginSignIn(c: MicrosoftConfig, origin: string, next: string | null | undefined) {
  const state = b64url(randomBytes(24));
  const nonce = b64url(randomBytes(24));
  const verifier = b64url(randomBytes(48));
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const redirectUri = `${origin}${MICROSOFT_CALLBACK_PATH}`;
  const params = new URLSearchParams({
    client_id: c.clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: SCOPES,
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  const flow: FlowPayload = { state, nonce, verifier, next: safeNext(next), exp: Math.floor(Date.now() / 1000) + FLOW_TTL_S };
  return {
    location: `${authorizeUrl(c)}?${params.toString()}`,
    flowCookie: { name: MICROSOFT_FLOW_COOKIE, value: seal(c.sessionSecret, flow), maxAge: FLOW_TTL_S },
  };
}

/* ------------------------------------------------------- flow: leg 2 */

interface IdTokenClaims {
  iss: string;
  aud: string;
  exp: number;
  nbf?: number;
  iat?: number;
  nonce?: string;
  tid?: string;
  oid?: string;
  sub?: string;
  name?: string;
  preferred_username?: string;
  email?: string;
  upn?: string;
}

type Jwk = { kid?: string; kty: string; n?: string; e?: string; x5c?: string[] };

let jwksCache: { at: number; url: string; keys: Jwk[] } | null = null;

async function fetchJwks(url: string, force = false): Promise<Jwk[]> {
  if (!force && jwksCache && jwksCache.url === url && Date.now() - jwksCache.at < JWKS_TTL_MS) return jwksCache.keys;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Microsoft signing keys unavailable (HTTP ${res.status}).`);
  const body = (await res.json()) as { keys?: Jwk[] };
  const keys = Array.isArray(body.keys) ? body.keys : [];
  jwksCache = { at: Date.now(), url, keys };
  return keys;
}

/**
 * Validate an ID token: RS256 signature against the tenant's published
 * keys (refetched once if the kid is unknown, so a key rollover does not
 * lock everyone out), then issuer, audience, tenant, expiry and nonce.
 */
export async function verifyIdToken(c: MicrosoftConfig, idToken: string, expectedNonce: string, now = Math.floor(Date.now() / 1000)): Promise<IdTokenClaims> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Malformed ID token.");
  const [h, p, s] = parts;
  const header = JSON.parse(fromB64url(h).toString("utf8")) as { alg?: string; kid?: string };
  if (header.alg !== "RS256" || !header.kid) throw new Error("Unexpected ID token algorithm.");

  let keys = await fetchJwks(jwksUrl(c));
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    keys = await fetchJwks(jwksUrl(c), true);
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) throw new Error("ID token signed with an unknown key.");
  const publicKey = createPublicKey({ key: jwk as never, format: "jwk" });
  const ok = cryptoVerify("RSA-SHA256", Buffer.from(`${h}.${p}`), publicKey, fromB64url(s));
  if (!ok) throw new Error("ID token signature invalid.");

  const claims = JSON.parse(fromB64url(p).toString("utf8")) as IdTokenClaims;
  if (claims.iss !== expectedIssuer(c)) throw new Error("ID token issuer mismatch.");
  if (claims.aud !== c.clientId) throw new Error("ID token audience mismatch.");
  if (claims.tid && claims.tid !== c.tenantId) throw new Error("ID token tenant mismatch.");
  if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_S <= now) throw new Error("ID token expired.");
  if (typeof claims.nbf === "number" && claims.nbf - CLOCK_SKEW_S > now) throw new Error("ID token not yet valid.");
  if (!claims.nonce || !safeEqual(claims.nonce, expectedNonce)) throw new Error("ID token nonce mismatch.");
  if (!claims.oid) throw new Error("ID token carries no object ID.");
  return claims;
}

/** Job title from Microsoft Graph, when the app has User.Read; blank on any failure. */
async function fetchJobTitle(c: MicrosoftConfig, accessToken: string | undefined): Promise<string> {
  if (!accessToken) return "";
  try {
    const res = await fetch(`${c.graphBase}/v1.0/me?$select=jobTitle`, {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) return "";
    const me = (await res.json()) as { jobTitle?: string | null };
    return String(me.jobTitle ?? "").trim();
  } catch {
    return "";
  }
}

export interface CompletedSignIn {
  identity: ConsultantIdentity;
  next: string;
}

/**
 * Second leg: check state against the flow cookie, exchange the code (with
 * the PKCE verifier and the client secret), validate the ID token and
 * return the identity the token asserts. The caller decides whether that
 * identity may have a session (it must have a consultant record).
 */
export async function completeSignIn(
  c: MicrosoftConfig,
  origin: string,
  query: URLSearchParams,
  flowCookieValue: string | undefined
): Promise<CompletedSignIn> {
  const flow = open<FlowPayload>(c.sessionSecret, flowCookieValue);
  if (!flow || flow.exp <= Math.floor(Date.now() / 1000)) throw new Error("The sign-in attempt has expired. Please try again.");
  const providerError = query.get("error");
  if (providerError) throw new Error(`Microsoft declined the sign-in (${providerError}${query.get("error_description") ? `: ${query.get("error_description")}` : ""}).`);
  const state = query.get("state") ?? "";
  const code = query.get("code") ?? "";
  if (!state || !safeEqual(state, flow.state)) throw new Error("Sign-in state mismatch. Please try again.");
  if (!code) throw new Error("Microsoft returned no authorization code.");

  const form = new URLSearchParams({
    client_id: c.clientId,
    client_secret: c.clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: `${origin}${MICROSOFT_CALLBACK_PATH}`,
    code_verifier: flow.verifier,
    scope: SCOPES,
  });
  const res = await fetch(tokenUrl(c), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    cache: "no-store",
  });
  const tokens = (await res.json().catch(() => ({}))) as { id_token?: string; access_token?: string; error?: string; error_description?: string };
  if (!res.ok || !tokens.id_token) {
    throw new Error(`Token exchange failed (${tokens.error ?? `HTTP ${res.status}`}${tokens.error_description ? `: ${tokens.error_description.split("\n")[0]}` : ""}).`);
  }

  const claims = await verifyIdToken(c, tokens.id_token, flow.nonce);
  const email = String(claims.preferred_username ?? claims.email ?? claims.upn ?? "")
    .trim()
    .toLowerCase();
  const identity: ConsultantIdentity = {
    id: String(claims.oid),
    email,
    name: String(claims.name ?? "").trim(),
    jobTitle: await fetchJobTitle(c, tokens.access_token),
  };
  return { identity, next: flow.next };
}

/* ---------------------------------------------------------- provider */

export function microsoftProvider(): AuthProvider | null {
  const c = microsoftConfig();
  if (!c) return null; // selector will lock
  return {
    name: "microsoft",
    isStub: false,
    lockedReason: null,
    cookieName: MICROSOFT_COOKIE,
    getIdentity(cookieValue) {
      return readSessionCookieValue(c, cookieValue);
    },
    selectableIdentities() {
      return [];
    },
    makeSessionCookie() {
      return null; // minted only by the callback after a validated token
    },
  };
}
