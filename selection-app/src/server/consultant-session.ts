/**
 * Consultant resolution for a signed-in identity — SERVER-ONLY.
 *
 * Microsoft Entra (or, for now, the auth stub) establishes WHO is signed in;
 * this module finds or creates the consultant RECORD that identity maps to.
 * It is provider-agnostic: swapping in real token claims is done in
 * src/server/auth/microsoft.ts alone, which produces the same
 * ConsultantIdentity this module consumes.
 *
 * Resolution order, on every portal request (reads are free; writes happen
 * only on the first sign-in that claims or creates a record):
 *
 *   1. Match on objectId (ConsultantIdentity.id).
 *   2. Match on email, lowercase on both sides. A record not yet claimed
 *      takes this objectId. A record already claimed by a DIFFERENT
 *      objectId is left alone — claims never overwrite — and step 3 runs.
 *   3. No match: create a record with source "sso", taking displayName and
 *      jobTitle from the claims, the email from the token, and a photo URL
 *      derived from the display name and HEAD-checked.
 *
 * Claims are used to create, never to update: a seeded displayName,
 * jobTitle or email is never touched by what the token says.
 */

import type { ConsultantRecord, PhotoStatus } from "@/lib/consultant-types";
import type { ConsultantIdentity } from "./auth/types";
import {
  checkPhoto,
  derivedPhotoUrl,
  emptyConsultantRecord,
  findConsultantByEmail,
  findConsultantByObjectId,
  newConsultantId,
  normaliseEmail,
  readConsultantRecord,
  stampConsultant,
  writeConsultantRecord,
} from "./consultants.mjs";

const signInStamp = (identity: ConsultantIdentity) => `sign-in:${normaliseEmail(identity.email) || identity.id}`;

/** The consultant record for this identity, claimed or created as needed. Storage errors propagate. */
export async function resolveConsultant(identity: ConsultantIdentity): Promise<ConsultantRecord> {
  const objectId = String(identity.id ?? "").trim();
  if (!objectId) throw Object.assign(new Error("Signed-in identity has no object ID."), { code: "FORBIDDEN" });

  // 1. Already claimed.
  const byOid = (await findConsultantByObjectId(objectId)) as ConsultantRecord | null;
  if (byOid) return byOid;

  // 2. Seeded or admin-created, not yet claimed.
  const email = normaliseEmail(identity.email);
  if (email) {
    const byEmail = (await findConsultantByEmail(email)) as ConsultantRecord | null;
    if (byEmail && !byEmail.objectId) {
      byEmail.objectId = objectId;
      stampConsultant(byEmail, signInStamp(identity));
      return (await writeConsultantRecord(byEmail)) as ConsultantRecord;
    }
    // byEmail claimed by another objectId: the seeded address is not the one
    // Microsoft signs this person in as. Fall through and create a stray
    // "sso" record; the admin screen's release flow reconciles the two.
  }

  // 3. Unseeded: create from the claims.
  const displayName = String(identity.name ?? "").trim();
  const photoUrl = derivedPhotoUrl(displayName);
  const record: ConsultantRecord = {
    ...(emptyConsultantRecord(newConsultantId()) as ConsultantRecord),
    objectId,
    // An address another record already carries cannot be stored twice; the
    // stray record then has no email until an admin sorts it out.
    email: email && !(await findConsultantByEmail(email)) ? email : "",
    displayName,
    jobTitle: String(identity.jobTitle ?? "").trim(),
    photoUrl,
    photoStatus: photoUrl ? ((await checkPhoto(photoUrl)) as PhotoStatus) : "missing",
    source: "sso",
    status: "active",
  };
  stampConsultant(record, signInStamp(identity));
  return (await writeConsultantRecord(record)) as ConsultantRecord;
}

/** A record by id, typed. */
export async function getConsultantRecord(id: string): Promise<ConsultantRecord | null> {
  return (await readConsultantRecord(id)) as ConsultantRecord | null;
}
