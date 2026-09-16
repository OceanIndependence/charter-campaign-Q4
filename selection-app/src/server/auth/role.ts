/**
 * Portal role resolution — SERVER-ONLY, and the only place a role is decided.
 *
 * One owner, named by PORTAL_OWNER_EMAIL, plus a per-consultant isAdmin flag
 * the owner ticks on the consultant admin list. Every guard — API route,
 * page, navigation — goes through resolvePortalRole() so there is a single
 * answer per request and no parallel auth path.
 *
 * Order, and the reasoning behind it:
 *
 *   1. PORTAL_OWNER_EMAIL, compared trimmed and lowercase. This returns
 *      BEFORE any storage read, so the owner needs no consultant record:
 *      they are not a consultant and must never need a row in the list to
 *      administer it. It also means the owner cannot lock themself out by
 *      editing records.
 *   2. The consultant record for that address: 'admin' only when isAdmin is
 *      true AND the record is active. Retiring someone removes their admin
 *      access with it — one switch, not two.
 *   3. PORTAL_ADMIN_EMAILS, the variable this model replaces, kept as a
 *      migration fallback (see below).
 *   4. Otherwise 'consultant'.
 *
 * The role is resolved per request from the stored record and is never
 * cached in the session or the cookie. That is what lets a consultant who
 * has never signed in be ticked as admin now and have it take effect at
 * their first sign-in, and an admin be revoked without waiting for a
 * session to expire.
 *
 * MIGRATION — TEMPORARY. Step 3 still honours PORTAL_ADMIN_EMAILS so that
 * nobody loses access the moment this deploys, and logs at info level
 * whenever that list is what granted access. Once the log is quiet and the
 * flags are ticked, delete resolveFromLegacyList(), its call in step 3 and
 * legacyAdminListConfigured(), then unset the variable. The removal steps
 * are written out in docs/portal-roles-report.md.
 */

import type { ConsultantRecord, PortalRole } from "@/lib/consultant-types";
import type { ConsultantIdentity } from "./types";
import { findConsultantByEmail, normaliseEmail } from "../consultants.mjs";

/** The single owner address, or "" when none is configured. */
export function ownerEmail(): string {
  return normaliseEmail(process.env.PORTAL_OWNER_EMAIL) as string;
}

/** True when this address is the owner. A blank address never matches a blank variable. */
export function isOwnerEmail(email: unknown): boolean {
  const owner = ownerEmail();
  const candidate = normaliseEmail(email) as string;
  return Boolean(owner) && Boolean(candidate) && owner === candidate;
}

/* ------------------------------------------------ migration fallback only */

/** Addresses still listed in PORTAL_ADMIN_EMAILS. Delete with the fallback. */
function legacyAdminList(): string[] {
  const raw = process.env.PORTAL_ADMIN_EMAILS;
  if (!raw || !raw.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Whether PORTAL_ADMIN_EMAILS still names anyone. Delete with the fallback. */
export function legacyAdminListConfigured(): boolean {
  return legacyAdminList().length > 0;
}

/**
 * The old grant, kept only so this change cannot lock anyone out. Logged at
 * info level with the address, so the people still relying on it can be
 * ticked in the UI and the variable retired.
 */
function resolveFromLegacyList(email: string, record: ConsultantRecord | null): boolean {
  if (!email || !legacyAdminList().includes(email)) return false;
  console.info(
    `[role] ${email} was granted admin by PORTAL_ADMIN_EMAILS, not by their record ` +
      `(isAdmin=${record ? String(record.isAdmin) : "no record"}${record && record.status !== "active" ? ", record inactive" : ""}). ` +
      "Tick this person on /portal/admin/consultants so the variable can be removed."
  );
  return true;
}

/* ------------------------------------------------------------- resolution */

/**
 * The role for a signed-in identity. Reads storage only when the identity
 * is not the owner. Storage errors propagate: a role that cannot be
 * established is not quietly downgraded to 'consultant'.
 */
export async function resolvePortalRole(identity: ConsultantIdentity | null | undefined): Promise<PortalRole> {
  const email = normaliseEmail(identity?.email) as string;

  // 1. The owner, before any storage read and without needing a record.
  if (isOwnerEmail(email)) return "owner";

  // 2. The stored flag. Inactive is never admin, however the flag reads.
  const record = email ? ((await findConsultantByEmail(email)) as ConsultantRecord | null) : null;
  if (record?.isAdmin === true && record.status === "active") return "admin";

  // 3. TEMPORARY: the variable this model replaces.
  if (resolveFromLegacyList(email, record)) return "admin";

  return "consultant";
}

/** Whether a role may reach the admin screens and the /api/admin routes. */
export function roleIsAdmin(role: PortalRole): boolean {
  return role === "owner" || role === "admin";
}
