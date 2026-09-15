/**
 * Consultant record shape, shared by the server module
 * (src/server/consultants.mjs), the portal UI and the API routes.
 */

export type ConsultantStatus = "active" | "inactive";
/** csv: the seed import; sso: created from a sign-in; admin: added on the admin screen before first sign-in */
export type ConsultantSource = "csv" | "sso" | "admin";
export type PhotoStatus = "ok" | "missing";

export interface ConsultantRecord {
  version: 1;
  /** Internal, stable, assigned at creation — the filename under consultants/ */
  id: string;
  /** Entra object ID; null until the record is claimed by a sign-in */
  objectId: string | null;
  /** Lowercase. The sign-in address and the address shown to clients. */
  email: string;
  displayName: string;
  jobTitle: string;
  /** Consultant-editable */
  phone: string;
  /** Consultant-editable; optional */
  whatsapp: string;
  photoUrl: string;
  photoStatus: PhotoStatus;
  source: ConsultantSource;
  status: ConsultantStatus;
  updatedAt: string | null;
  updatedBy: string | null;
}

/** The index row: everything the admin list and sign-in look-ups need, minus the two consultant-owned fields. */
export type ConsultantSummary = Omit<ConsultantRecord, "phone" | "whatsapp" | "version">;

/** Where a consultant edits their phone and WhatsApp numbers. */
export const PROFILE_PATH = "/portal/profile";
/** The consultant admin screen (PORTAL_ADMIN_EMAILS only). */
export const ADMIN_CONSULTANTS_PATH = "/portal/admin/consultants";

/** True while an active consultant has no phone number. */
export function consultantNeedsPhone(c: Pick<ConsultantRecord, "status" | "phone"> | null | undefined): boolean {
  return Boolean(c) && c!.status === "active" && !String(c!.phone ?? "").trim();
}

/**
 * Whether the portal redirects a consultant with no phone number to their
 * profile. Tied to CONSULTANT_SCOPING: until real sign-in lands, the session
 * consultant is a stand-in record and the gate would fire on every visit, so
 * it is off while scoping is off. Server-only (reads the environment).
 */
export function profileGateEnabled(): boolean {
  return /^(on|true|1|yes)$/i.test(String(process.env.CONSULTANT_SCOPING ?? "").trim());
}

/** Wording shown wherever a read-only detail may be wrong. */
export const CONTACT_MARKETING = "These details are managed by the marketing team. Contact marketing if something is wrong.";
