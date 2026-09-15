/**
 * The consultant block a client page shows — SERVER-ONLY.
 *
 * Deliberately different from the specifications: specs are frozen at
 * publish, the consultant is LIVE. A page carries the consultant's record
 * id (stamped on the selection at creation and onto the published record),
 * and every render resolves the current record, so a corrected phone
 * number reaches pages that were published before the correction.
 *
 *   - active record   → its current details; the photo only when it has
 *                        resolved (photoStatus "ok"), otherwise the text
 *                        block stands alone — never a placeholder on a
 *                        client page.
 *   - inactive record → null: the consultant is suppressed entirely and the
 *                        page carries no contact block at all.
 *   - no id, or no record for the id → the block frozen into the config at
 *                        publish (pages published before consultant records
 *                        existed, and the Harrington demo).
 *
 * A storage failure propagates so the route can show its holding page.
 */

import type { ConsultantRecord } from "@/lib/consultant-types";
import type { Consultant } from "@/lib/types";
import { getConsultantRecord } from "./consultant-session";

/** The client-page block for a record, regardless of status. */
export function consultantBlockOf(record: ConsultantRecord): Consultant {
  return {
    name: record.displayName,
    title: record.jobTitle,
    phone: record.phone,
    email: record.email,
    whatsapp: record.whatsapp,
    photoUrl: record.photoStatus === "ok" ? record.photoUrl : "",
  };
}

/** What the page shows for a record: the consultant while active, nothing once inactive. */
export function consultantForRecord(record: ConsultantRecord): Consultant | null {
  return record.status === "active" ? consultantBlockOf(record) : null;
}

/**
 * Resolve the block for a page from its consultant id, falling back to the
 * frozen block when there is no id or no record behind it.
 */
export async function consultantForPage(consultantId: string | null | undefined, frozen: Consultant | null): Promise<Consultant | null> {
  if (!consultantId) return frozen;
  const record = await getConsultantRecord(consultantId);
  return record ? consultantForRecord(record) : frozen;
}
