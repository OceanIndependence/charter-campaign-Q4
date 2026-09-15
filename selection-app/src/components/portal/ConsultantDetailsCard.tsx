"use client";

import type { Consultant } from "@/lib/types";
import type { ConsultantStatus, PhotoStatus } from "@/lib/consultant-types";
import { CONTACT_MARKETING, PROFILE_PATH } from "@/lib/consultant-types";
import styles from "./PortalForm.module.css";

/** The selection's consultant as GET /api/selections/:id resolves it: the client-page block plus status. */
export interface SelectionConsultant extends Consultant {
  photoStatus: PhotoStatus;
  status: ConsultantStatus;
}

/**
 * The "YOUR DETAILS" card on both forms, read-only. The selection belongs
 * to one consultant record, fixed at creation; what the client page shows
 * is that record resolved live at render, so there is nothing here to type.
 * Numbers are edited on the profile page, everything else by marketing.
 */
export default function ConsultantDetailsCard({ sectionHead, consultant }: { sectionHead: string; consultant: SelectionConsultant | null | undefined }) {
  const value = (label: string, v: string | undefined, emptyText = "Not set") => (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className={`${styles.readValue} ${v ? "" : styles.readValueEmpty}`}>{v || emptyText}</span>
    </div>
  );

  const inactive = consultant?.status === "inactive";

  return (
    <section className={styles.card}>
      <div className={styles.sectionHeadRow}>
        <div className={styles.sectionHead}>{sectionHead}</div>
        <a href={PROFILE_PATH} className={styles.actionBtn}>
          YOUR PROFILE
        </a>
      </div>
      <p className={styles.sectionNote}>
        The consultant this selection belongs to, fixed when it was created. Shown at the foot of the client page and kept live: a number
        corrected on the profile page updates pages already published. {CONTACT_MARKETING}
      </p>
      {consultant === undefined && <p className={styles.sectionNote}>Loading…</p>}
      {consultant === null && (
        <p className={styles.sectionNote}>
          This selection has no consultant record attached, so its client page shows the contact details frozen when it was published.
        </p>
      )}
      {consultant && (
        <div className={styles.profileRow}>
          {consultant.photoStatus === "ok" && consultant.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={consultant.photoUrl} alt={consultant.name} className={styles.profilePhoto} style={{ width: 96, height: 96, flexBasis: 96 }} />
          ) : null}
          <div className={styles.grid} style={{ flex: "1 1 280px" }}>
            {value("NAME", consultant.name)}
            {value("TITLE", consultant.title)}
            {value("EMAIL", consultant.email)}
            {value("PHONE", consultant.phone, "Not set — publishing is blocked until it is")}
            {value("WHATSAPP", consultant.whatsapp, "None")}
            {value("PHOTO", consultant.photoStatus === "ok" ? "Resolved" : "", "Not found — the page shows the details without one")}
          </div>
        </div>
      )}
      {inactive && (
        <p className={styles.fetchWarning} style={{ marginTop: 22 }}>
          This consultant is inactive: the client page carries no contact block at all.
        </p>
      )}
    </section>
  );
}
