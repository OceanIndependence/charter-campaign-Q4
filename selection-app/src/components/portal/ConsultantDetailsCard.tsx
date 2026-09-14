"use client";

import { useEffect, useState } from "react";
import type { ConsultantRecord } from "@/lib/consultant-types";
import { CONTACT_MARKETING, PROFILE_PATH } from "@/lib/consultant-types";
import styles from "./PortalForm.module.css";

/**
 * The "YOUR DETAILS" card on both forms, read-only. What the client page
 * shows comes from the consultant's record, resolved live at render, so
 * there is nothing here to type: the numbers are edited on the profile
 * page, everything else by marketing through the admin screen.
 */
export default function ConsultantDetailsCard({ sectionHead }: { sectionHead: string }) {
  const [record, setRecord] = useState<ConsultantRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/consultants/me");
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error ?? "Your profile could not be loaded.");
        setRecord(body.consultant as ConsultantRecord);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Your profile could not be loaded.");
      }
    })();
  }, []);

  const value = (label: string, v: string | undefined, emptyText = "Not set") => (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className={`${styles.readValue} ${v ? "" : styles.readValueEmpty}`}>{v || emptyText}</span>
    </div>
  );

  const inactive = record?.status === "inactive";

  return (
    <section className={styles.card}>
      <div className={styles.sectionHeadRow}>
        <div className={styles.sectionHead}>{sectionHead}</div>
        <a href={PROFILE_PATH} className={styles.actionBtn}>
          EDIT YOUR NUMBERS
        </a>
      </div>
      <p className={styles.sectionNote}>
        Shown at the foot of the client page and kept live: a number corrected on your profile updates pages you have already published.
        {" "}
        {CONTACT_MARKETING}
      </p>
      {error && <p className={styles.fetchWarning}>{error}</p>}
      {record && (
        <div className={styles.profileRow}>
          {record.photoStatus === "ok" && record.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={record.photoUrl} alt={record.displayName} className={styles.profilePhoto} style={{ width: 96, height: 96, flexBasis: 96 }} />
          ) : null}
          <div className={styles.grid} style={{ flex: "1 1 280px" }}>
            {value("NAME", record.displayName)}
            {value("TITLE", record.jobTitle)}
            {value("EMAIL", record.email)}
            {value("PHONE", record.phone, "Not set — add it on your profile before publishing")}
            {value("WHATSAPP", record.whatsapp, "None")}
            {value("PHOTO", record.photoStatus === "ok" ? "Resolved" : "", "Not found — the page shows your details without one")}
          </div>
        </div>
      )}
      {inactive && (
        <p className={styles.fetchWarning} style={{ marginTop: 22 }}>
          Your profile is inactive: client pages show the charter desk in place of your details, and your numbers are read-only.
        </p>
      )}
    </section>
  );
}
