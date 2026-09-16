/**
 * Auth provider selection and the route/page helpers the rest of the app
 * uses — SERVER-ONLY.
 *
 * Portal access is two independent layers, both required:
 *   1. Staging gate  — the shared PORTAL_ACCESS_KEY cookie (portal-auth.ts).
 *                      Applies to the stub and solo providers only: with
 *                      Microsoft sign-in the tenant is the gate and the key
 *                      is not asked for (stagingGateApplies()).
 *   2. Identity      — a ConsultantIdentity from the active provider, which
 *                      is what ownership is recorded and checked against.
 * Once both pass, the identity is resolved to its consultant RECORD
 * (consultant-session.ts): matched on object ID, then email, else created.
 * Pages and the routes that need the record use getPortalPageState() and
 * requireConsultantSession(); routes that only need the identity keep the
 * synchronous requirePortalSession().
 *
 * Roles: one owner (PORTAL_OWNER_EMAIL) plus a per-consultant isAdmin flag,
 * resolved per request by resolvePortalRole() in ./role.ts and nowhere else.
 * Nothing here decides a role of its own; every guard below asks that one
 * function, so moving to an Entra group claim later is a change to that
 * module alone.
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
import type { ConsultantRecord, PortalRole } from "@/lib/consultant-types";
import { resolveConsultant } from "../consultant-session";
import { legacyAdminListConfigured, ownerEmail, resolvePortalRole, roleIsAdmin } from "./role";
import { findConsultantByEmail, normaliseEmail } from "../consultants.mjs";
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
    microsoft: p.name === "microsoft",
    locked: Boolean(p.lockedReason),
    lockedReason: p.lockedReason,
    stagingGate: stagingGateApplies(),
  };
}

/** The PORTAL_ACCESS_KEY gate stands in front of every provider except Microsoft, where the tenant is the gate. */
export function stagingGateApplies(): boolean {
  return authProvider().name !== "microsoft";
}

/** Whether a signed-in identity with no consultant record may have one created from its claims (never under Microsoft). */
function createRecordsOnSignIn(): boolean {
  return authProvider().name !== "microsoft";
}

export function selectableIdentities(): ConsultantIdentity[] {
  return authProvider().selectableIdentities();
}

/** Cookie a stub sign-in should set for `id`, or null if unsupported. */
export function stubSignInCookie(id: string): { name: string; value: string } | null {
  const p = authProvider();
  return p.isStub ? p.makeSessionCookie(id) : null;
}

export { isOwnerEmail, ownerEmail, resolvePortalRole, roleIsAdmin } from "./role";

/**
 * Whether anyone can administer this environment at all: an owner is
 * named, or the retired PORTAL_ADMIN_EMAILS list still names someone. For
 * telling an admin page's "you cannot open this" message apart from "no
 * administrator is configured here"; the guard itself is the role.
 */
export function adminAccessConfigured(): boolean {
  return Boolean(ownerEmail()) || legacyAdminListConfigured();
}

/**
 * Which role variables this deployment actually has, for /api/health. No
 * addresses — only whether each is set — so it says nothing a signed-in
 * consultant may not know. This is how you tell "I am an admin because the
 * owner ticked me" from "I am an admin because PORTAL_ADMIN_EMAILS still
 * names me and no owner is configured here", which otherwise look
 * identical from the outside.
 */
export function roleDiagnostics() {
  return {
    ownerConfigured: Boolean(ownerEmail()),
    legacyAdminEmailsStillSet: legacyAdminListConfigured(),
  };
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
  /** Owner or admin: sees, opens and edits every consultant's selections */
  isAdmin: boolean;
}

/** The role is already resolved on the session or page state; never re-decided here. */
export function selectionAccess(session: { identity: ConsultantIdentity; consultant: ConsultantRecord; isAdmin: boolean }): SelectionAccess {
  return { consultantId: session.consultant.id, identity: session.identity, isAdmin: session.isAdmin };
}

export type ConsultantSession =
  | { ok: true; identity: ConsultantIdentity; consultant: ConsultantRecord; role: PortalRole; isAdmin: boolean }
  | { ok: false; response: NextResponse };

/**
 * An admin-route session. The consultant record is null for an OWNER with
 * no record of their own: the owner administers the list without appearing
 * in it, so nothing here may require, or create, a row for them.
 */
export type AdminSession =
  | { ok: true; identity: ConsultantIdentity; consultant: ConsultantRecord | null; role: PortalRole }
  | { ok: false; response: NextResponse };

/**
 * Require BOTH the staging gate and a valid identity for an API route.
 * Returns the identity on success, or a JSON error response.
 */
export function requirePortalSession(request: NextRequest): PortalSession {
  if (stagingGateApplies() && !isPortalAuthed(request)) {
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
  const consultant = await resolveConsultant(session.identity, { createIfMissing: createRecordsOnSignIn() });
  const role = await resolvePortalRole(session.identity);
  return { ok: true, identity: session.identity, consultant, role, isAdmin: roleIsAdmin(role) };
}

/** The record for this identity if one already exists — never created. Owners have none. */
async function existingRecordFor(identity: ConsultantIdentity): Promise<ConsultantRecord | null> {
  const email = normaliseEmail(identity.email) as string;
  return email ? ((await findConsultantByEmail(email)) as ConsultantRecord | null) : null;
}

/**
 * Server-side guard for the admin routes: staging gate, identity, and a
 * role of owner or admin, resolved from the stored record on THIS request.
 * Hiding navigation is not a guard, so every admin route calls this.
 *
 * The consultant record is looked up but never created here: an owner with
 * no record still passes, and administering the list never adds a row for
 * the person doing it.
 */
export async function requireAdminSession(request: NextRequest): Promise<AdminSession> {
  const session = requirePortalSession(request);
  if (!session.ok) return session;
  const role = await resolvePortalRole(session.identity);
  if (!roleIsAdmin(role)) {
    return { ok: false, response: NextResponse.json({ error: "Admin access required." }, { status: 403 }) };
  }
  return { ok: true, identity: session.identity, consultant: await existingRecordFor(session.identity), role };
}

/**
 * Guard for the few things only the owner may do — granting and revoking
 * admin, and removing a record. An admin passes requireAdminSession but is
 * refused here: admins see who is an admin and cannot change it.
 *
 * `action` completes "Only the portal owner may …" so the refusal names
 * what was actually refused rather than whichever owner-only route was
 * written first.
 */
export async function requireOwnerSession(request: NextRequest, action = "do this"): Promise<AdminSession> {
  const session = await requireAdminSession(request);
  if (!session.ok) return session;
  if (session.role !== "owner") {
    return { ok: false, response: NextResponse.json({ error: `Only the portal owner may ${action}.` }, { status: 403 }) };
  }
  return session;
}

/**
 * Server-component gate: returns where to redirect ('login' for the staging
 * gate, 'signin' for identity) or the identity and its consultant record
 * when both pass.
 */
export async function getPortalPageState(): Promise<
  { redirect: "login" | "signin" } | { identity: ConsultantIdentity; consultant: ConsultantRecord; role: PortalRole; isAdmin: boolean }
> {
  if (stagingGateApplies() && !(await isPortalAuthedServer())) return { redirect: "login" };
  const identity = await getIdentityServer();
  if (!identity) return { redirect: "signin" };
  const consultant = await resolveConsultant(identity, { createIfMissing: createRecordsOnSignIn() });
  const role = await resolvePortalRole(identity);
  return { identity, consultant, role, isAdmin: roleIsAdmin(role) };
}

/**
 * Page-level counterpart of requireAdminSession, for the two admin screens.
 * Unlike getPortalPageState it never resolves-or-creates a consultant
 * record, so opening the consultant list as the owner does not add the
 * owner to that list. `consultant` is null when they have no record.
 */
export async function getAdminPageState(): Promise<
  { redirect: "login" | "signin" } | { identity: ConsultantIdentity; consultant: ConsultantRecord | null; role: PortalRole; isAdmin: boolean }
> {
  if (stagingGateApplies() && !(await isPortalAuthedServer())) return { redirect: "login" };
  const identity = await getIdentityServer();
  if (!identity) return { redirect: "signin" };
  const role = await resolvePortalRole(identity);
  return { identity, consultant: await existingRecordFor(identity), role, isAdmin: roleIsAdmin(role) };
}
