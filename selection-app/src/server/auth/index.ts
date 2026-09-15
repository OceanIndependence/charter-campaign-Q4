/**
 * Auth provider selection and the route/page helpers the rest of the app
 * uses — SERVER-ONLY.
 *
 * Portal access is two independent layers, both required:
 *   1. Staging gate  — the shared PORTAL_ACCESS_KEY cookie (portal-auth.ts).
 *   2. Identity      — a ConsultantIdentity from the active provider, which
 *                      is what ownership is recorded and checked against.
 * Once both pass, the identity is resolved to its consultant RECORD
 * (consultant-session.ts): matched on object ID, then email, else created.
 * Pages and the routes that need the record use getPortalPageState() and
 * requireConsultantSession(); routes that only need the identity keep the
 * synchronous requirePortalSession().
 *
 * Admin: PORTAL_ADMIN_EMAILS (comma-separated) compared lowercase against
 * the signed-in identity's email, here and nowhere else, so moving to an
 * Entra group claim later is a change to isAdmin() alone. It checks the
 * environment variable only — never the consultant record's status — so an
 * admin who marks themself inactive cannot be locked out.
 *
 * Provider selection is fail-closed in production:
 *   - PORTAL_AUTH_PROVIDER=microsoft → the real provider, or a LOCKED
 *     provider if its env vars are missing.
 *   - PORTAL_AUTH_PROVIDER=stub → the dev stub in development; LOCKED in
 *     production.
 *   - unset/unknown → the dev stub in development (with a loud warning);
 *     LOCKED in production.
 * A LOCKED provider yields no identity, so every portal request is denied.
 */

import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import type { AuthProvider, ConsultantIdentity } from "./types";
import type { ConsultantRecord } from "@/lib/consultant-types";
import { resolveConsultant } from "../consultant-session";
import { stubProvider } from "./stub";
import { soloProvider } from "./solo";
import { microsoftProvider } from "./microsoft";
import { isPortalAuthed, isPortalAuthedServer } from "../portal-auth";

function lockedProvider(reason: string): AuthProvider {
  return {
    name: "locked",
    isStub: false,
    lockedReason: reason,
    cookieName: "oi_portal_identity",
    getIdentity: () => null,
    selectableIdentities: () => [],
    makeSessionCookie: () => null,
  };
}

let cached: AuthProvider | null = null;

function resolveProvider(): AuthProvider {
  const choice = (process.env.PORTAL_AUTH_PROVIDER || "").toLowerCase();
  const isProd = process.env.NODE_ENV === "production";

  if (choice === "microsoft") {
    return microsoftProvider() ?? lockedProvider("Microsoft sign-in is selected but not configured.");
  }

  // Single fixed consultant — a deliberate staging/internal choice, allowed
  // in production because it is one real person, not the fake dev stub.
  if (choice === "solo") {
    if (!process.env.PORTAL_ACCESS_KEY) {
      // Not a lock-out (that would close production until the variable is
      // set), but every visitor is now the solo consultant: say so once.
      console.warn(
        "[auth] PORTAL_AUTH_PROVIDER=solo with no PORTAL_ACCESS_KEY — the portal and its API accept every visitor as the solo consultant. Set PORTAL_ACCESS_KEY in Production."
      );
    }
    return soloProvider;
  }

  if (choice === "stub") {
    if (isProd) return lockedProvider("The development sign-in stub is disabled in production.");
    return stubProvider;
  }

  // Unset or unknown.
  if (isProd) return lockedProvider("No authentication provider is configured (set PORTAL_AUTH_PROVIDER).");
  if (typeof console !== "undefined") {
    console.warn(
      "[auth] PORTAL_AUTH_PROVIDER is unset — using the DEVELOPMENT sign-in stub. " +
        "Set PORTAL_AUTH_PROVIDER=microsoft for real sign-in; the stub cannot run in production."
    );
  }
  return stubProvider;
}

export function authProvider(): AuthProvider {
  if (!cached) cached = resolveProvider();
  return cached;
}

/** Provider status for /api/health and the sign-in UI (no secrets). */
export function authProviderInfo() {
  const p = authProvider();
  return {
    provider: p.name,
    isStub: p.isStub,
    singleConsultant: p.name === "solo",
    locked: Boolean(p.lockedReason),
    lockedReason: p.lockedReason,
  };
}

export function selectableIdentities(): ConsultantIdentity[] {
  return authProvider().selectableIdentities();
}

/** Cookie a stub sign-in should set for `id`, or null if unsupported. */
export function stubSignInCookie(id: string): { name: string; value: string } | null {
  const p = authProvider();
  return p.isStub ? p.makeSessionCookie(id) : null;
}

/** True when the identity's email is listed in PORTAL_ADMIN_EMAILS. Env var only; never the record. */
export function isAdmin(identity: ConsultantIdentity | null | undefined): boolean {
  const raw = process.env.PORTAL_ADMIN_EMAILS;
  if (!raw || !raw.trim()) return false;
  const email = String(identity?.email ?? "").trim().toLowerCase();
  if (!email) return false;
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(email);
}

export function identityCookieName(): string {
  return authProvider().cookieName;
}

/** Identity from a route request, or null. */
export function getIdentityFromRequest(request: NextRequest): ConsultantIdentity | null {
  const p = authProvider();
  return p.getIdentity(request.cookies.get(p.cookieName)?.value);
}

/** Identity from a server component (ambient cookies), or null. */
export async function getIdentityServer(): Promise<ConsultantIdentity | null> {
  const p = authProvider();
  const store = await cookies();
  return p.getIdentity(store.get(p.cookieName)?.value);
}

export type PortalSession =
  | { ok: true; identity: ConsultantIdentity }
  | { ok: false; response: NextResponse };

/**
 * What pages.mjs needs to scope every selection operation: the session
 * consultant's record id (the storage namespace) and the identity (audit,
 * manager check). Built here so no route assembles it by hand.
 */
export interface SelectionAccess {
  consultantId: string;
  identity: ConsultantIdentity;
}

export function selectionAccess(session: { identity: ConsultantIdentity; consultant: ConsultantRecord }): SelectionAccess {
  return { consultantId: session.consultant.id, identity: session.identity };
}

export type ConsultantSession =
  | { ok: true; identity: ConsultantIdentity; consultant: ConsultantRecord; isAdmin: boolean }
  | { ok: false; response: NextResponse };

/**
 * Require BOTH the staging gate and a valid identity for an API route.
 * Returns the identity on success, or a JSON error response.
 */
export function requirePortalSession(request: NextRequest): PortalSession {
  if (!isPortalAuthed(request)) {
    return { ok: false, response: NextResponse.json({ error: "Staging access required." }, { status: 401 }) };
  }
  const identity = getIdentityFromRequest(request);
  if (!identity) {
    const reason = authProvider().lockedReason ?? "Not signed in.";
    return { ok: false, response: NextResponse.json({ error: reason }, { status: 401 }) };
  }
  return { ok: true, identity };
}

/**
 * Staging gate, identity AND the resolved consultant record, for API routes
 * that read or write the record. Storage errors propagate to errorResponse.
 */
export async function requireConsultantSession(request: NextRequest): Promise<ConsultantSession> {
  const session = requirePortalSession(request);
  if (!session.ok) return session;
  const consultant = await resolveConsultant(session.identity);
  return { ok: true, identity: session.identity, consultant, isAdmin: isAdmin(session.identity) };
}

/**
 * Server-side guard for the admin routes: staging gate, identity, and the
 * identity listed in PORTAL_ADMIN_EMAILS. Hiding navigation is not a guard.
 */
export async function requireAdminSession(request: NextRequest): Promise<ConsultantSession> {
  const session = await requireConsultantSession(request);
  if (!session.ok) return session;
  if (!session.isAdmin) {
    return { ok: false, response: NextResponse.json({ error: "Admin access required." }, { status: 403 }) };
  }
  return session;
}

/**
 * Server-component gate: returns where to redirect ('login' for the staging
 * gate, 'signin' for identity) or the identity and its consultant record
 * when both pass.
 */
export async function getPortalPageState(): Promise<
  { redirect: "login" | "signin" } | { identity: ConsultantIdentity; consultant: ConsultantRecord; isAdmin: boolean }
> {
  if (!(await isPortalAuthedServer())) return { redirect: "login" };
  const identity = await getIdentityServer();
  if (!identity) return { redirect: "signin" };
  const consultant = await resolveConsultant(identity);
  return { identity, consultant, isAdmin: isAdmin(identity) };
}
