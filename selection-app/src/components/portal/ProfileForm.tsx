"use client";

import { useState } from "react";
import type { ConsultantRecord } from "@/lib/consultant-types";
import { CONTACT_MARKETING } from "@/lib/consultant-types";
import { fmtDateLong } from "@/lib/format";
import styles from "./PortalForm.module.css";

/**
 * Two parts. Display name, job title, email and photo are rendered as text
 * — not disabled inputs — with a line pointing at marketing, because the
 * consultant is not meant to change them. Phone and WhatsApp are editable
 * (WhatsApp optional). Where the photo has not resolved, a neutral
 * placeholder is shown with the same line and no upload control: they
 * cannot fix it themselves, so nothing here should imply they can.
 */
export default function ProfileForm({ initial, gated }: { initial: ConsultantRecord; gated: boolean }) {
  const [record, setRecord] = useState(initial);
  const [phone, setPhone] = useState(initial.phone);
  const [whatsapp, setWhatsapp] = useState(initial.whatsapp);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const inactive = record.status !== "active";
  const dirty = phone.trim() !== record.phone || whatsapp.trim() !== record.whatsapp;
  const initialLetter = (record.displayName || record.email || "?").slice(0, 1).toUpperCase();

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || inactive) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/consultants/me", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, whatsapp }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) {
        window.location.href = "/portal/sign-in";
        return;
      }
      if (!res.ok) throw new Error(body?.error ?? "Your numbers could not be saved — please try again.");
      const next = body.consultant as ConsultantRecord;
      setRecord(next);
      setPhone(next.phone);
      setWhatsapp(next.whatsapp);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your numbers could not be saved — please try again.");
    } finally {
      setBusy(false);
    }
  };

  const readOnly = (label: string, value: string, emptyText = "Not set") => (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className={`${styles.readValue} ${value ? "" : styles.readValueEmpty}`}>{value || emptyText}</span>
    </div>
  );

  return (
    <main className={styles.main}>
      <div className={styles.eyebrow}>RETAIL CHARTER PORTAL</div>
      <h1 className={styles.title}>Your Profile</h1>
      <p className={styles.intro}>
        What clients see beneath every page you publish: your photo, name, title and how to reach you. Your numbers are yours to keep
        current; the rest is looked after by marketing.
      </p>

      {gated && !record.phone && (
        <section className={`${styles.card} ${styles.cardFirst}`} style={{ paddingBottom: 28 }}>
          <p className={styles.gateNote} style={{ margin: 0 }}>
            Add your mobile number before continuing to your selections. It appears in the contact block of every client page you
            publish, and a page cannot be published without it.
          </p>
        </section>
      )}

      {/* 01 — read-only details */}
      <section className={`${styles.card} ${gated && !record.phone ? "" : styles.cardFirst}`}>
        <div className={styles.sectionHead}>01 — YOUR DETAILS</div>
        <div className={styles.profileRow}>
          {record.photoStatus === "ok" && record.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={record.photoUrl} alt={record.displayName} className={styles.profilePhoto} />
          ) : (
            <div className={styles.profilePhotoEmpty} aria-label="No photo found">
              {initialLetter}
            </div>
          )}
          <div className={styles.profileFields}>
            {readOnly("NAME", record.displayName)}
            {readOnly("JOB TITLE", record.jobTitle)}
            {readOnly("EMAIL", record.email, "No email on record")}
            {record.photoStatus !== "ok" && (
              <div className={styles.field}>
                <span className={styles.fieldLabel}>PHOTO</span>
                <span className={`${styles.readValue} ${styles.readValueEmpty}`}>Your team photo has not been found, so client pages show your details without one.</span>
              </div>
            )}
          </div>
        </div>
        <p className={styles.sectionNote} style={{ margin: "28px 0 0" }}>
          {CONTACT_MARKETING}
        </p>
      </section>

      {/* 02 — the two fields the consultant owns */}
      <form className={styles.card} onSubmit={save}>
        <div className={styles.sectionHead}>02 — YOUR NUMBERS</div>
        {inactive ? (
          <>
            <div className={styles.grid}>
              {readOnly("PHONE", record.phone)}
              {readOnly("WHATSAPP", record.whatsapp, "None")}
            </div>
            <p className={styles.sectionNote} style={{ margin: "28px 0 0" }}>
              This profile is inactive, so its numbers are read-only and client pages show no contact block for you. Contact marketing if
              that is wrong.
            </p>
          </>
        ) : (
          <>
            <div className={styles.grid}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>PHONE</span>
                <input
                  type="tel"
                  className={styles.input}
                  placeholder="Example – +41 44 000 00 00"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  autoFocus={gated && !record.phone}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>
                  WHATSAPP <span className={styles.fieldLabelHint}>— optional; leave blank for no WhatsApp button</span>
                </span>
                <input
                  type="tel"
                  className={styles.input}
                  placeholder="Example – +41 44 000 00 00"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                />
              </label>
            </div>
            <div className={styles.sectionHeadRow} style={{ marginTop: 30, marginBottom: 0 }}>
              <span className={styles.updatedLine}>
                {error ? <span className={styles.dashError} style={{ margin: 0 }}>{error}</span> : null}
                {!error && saved && <span className={styles.savedNote}>SAVED</span>}
                {!error && !saved && record.updatedAt && `Last updated ${fmtDateLong(record.updatedAt)}`}
              </span>
              <span style={{ display: "flex", gap: 12, alignItems: "center" }}>
                {gated && record.phone && (
                  <a href="/portal" className={styles.previewBtn}>
                    CONTINUE TO DASHBOARD
                  </a>
                )}
                <button type="submit" className={styles.publishBtn} disabled={busy || !dirty || !phone.trim()}>
                  {busy ? "SAVING…" : "SAVE NUMBERS"}
                </button>
              </span>
            </div>
          </>
        )}
      </form>
    </main>
  );
}
