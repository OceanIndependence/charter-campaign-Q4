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
 *   1. Match on objectId (ConsultantIdentity.id). An ACTIVE match is the
 *      answer. An inactive match is kept as the fallback and step 2 runs,
 *      so a retired stray record does not stop the seeded one being claimed.
 *   2. Match on email, lowercase on both sides, among active records. One
 *      not yet claimed takes this objectId (and the objectId is cleared from
 *      the inactive record of step 1, if any). One already claimed by a
 *      DIFFERENT objectId is left alone — claims never overwrite.
 *   3. The inactive record from step 1, if there was one: the consultant
 *      sees their inactive profile rather than gaining a new stray record.
 *   4. No match anywhere: create a record with source "sso", taking
 *      displayName and jobTitle from the claims, the email from the token,
 *      and a photo URL derived from the display name and HEAD-checked.
 *      An identity with NO email is refused instead of created: email is
 *      what step 2 matches on, so such a record could never be claimed or
 *      found again, and only litters the list under a duplicate name.
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
export async function resolveConsultant(identity: ConsultantIdentity, { createIfMissing = true }: { createIfMissing?: boolean } = {}): Promise<ConsultantRecord> {
  const objectId = String(identity.id ?? "").trim();
  if (!objectId) throw Object.assign(new Error("Signed-in identity has no object ID."), { code: "FORBIDDEN" });

  // 1. Already claimed. Active wins outright; inactive is only the fallback.
  const byOid = (await findConsultantByObjectId(objectId)) as ConsultantRecord | null;
  if (byOid?.status === "active") return byOid;
  const inactiveByOid = byOid; // null or an inactive record carrying this objectId

  // 2. Seeded or admin-created, active, not yet claimed.
  const email = normaliseEmail(identity.email);
  if (email) {
    const byEmail = (await findConsultantByEmail(email, { activeOnly: true })) as ConsultantRecord | null;
    if (byEmail && !byEmail.objectId) {
      if (inactiveByOid) {
        // The objectId moves to the record being claimed; the retired stray
        // keeps everything else, so the reconciliation stays visible.
        inactiveByOid.objectId = null;
        stampConsultant(inactiveByOid, signInStamp(identity));
        await writeConsultantRecord(inactiveByOid);
      }
      byEmail.objectId = objectId;
      stampConsultant(byEmail, signInStamp(identity));
      return (await writeConsultantRecord(byEmail)) as ConsultantRecord;
    }
    // byEmail claimed by another objectId: the seeded address is not the one
    // Microsoft signs this person in as. Fall through; a stray "sso" record
    // is created and the admin screen's release flow reconciles the two.
  }

  // 3. Retired: the consultant keeps resolving to their inactive record.
  if (inactiveByOid) return inactiveByOid;

  // 4. Unseeded. Under Microsoft sign-in the callback has already refused
  //    anyone without a record, so reaching here means the record vanished
  //    between the two requests: fail closed rather than mint a stray.
  if (!createIfMissing) {
    throw Object.assign(new Error("No consultant record for this account. Contact marketing."), { code: "FORBIDDEN" });
  }
  // A session with no email address cannot produce a usable record: email
  // is what step 2 matches on, so the record could never be claimed, never
  // be found again, and never be reconciled — it is litter that shows up
  // in the admin list and in the consultant picker under a duplicate name.
  // It happens whenever the provider yields no address (most easily
  // PORTAL_AUTH_PROVIDER=solo with PORTAL_SOLO_EMAIL unset), and a new one
  // is minted for every distinct object ID. Fail closed and name the cause.
  if (!email) {
    throw Object.assign(
      new Error(
        "This sign-in carries no email address, so no consultant record can be created for it. " +
          "Set the address for this environment (PORTAL_SOLO_EMAIL under the solo provider) and sign in again."
      ),
      { code: "FORBIDDEN" }
    );
  }
  const displayName = String(identity.name ?? "").trim();
  const photoUrl = derivedPhotoUrl(displayName);
  const record: ConsultantRecord = {
    ...(emptyConsultantRecord(newConsultantId()) as ConsultantRecord),
    objectId,
    // An address another ACTIVE record already carries cannot be stored
    // twice; the stray record then has no email until an admin sorts it out.
    email: email && !(await findConsultantByEmail(email, { activeOnly: true })) ? email : "",
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
