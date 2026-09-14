"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ConsultantSummary, PhotoStatus } from "@/lib/consultant-types";
import { fmtDateShort } from "@/lib/format";
import styles from "./PortalForm.module.css";

type PhotoCheck = { status: PhotoStatus; httpStatus: number | null; error: string | null } | null;

const SOURCE_LABEL: Record<ConsultantSummary["source"], string> = {
  csv: "Seed list",
  sso: "Created at sign-in",
  admin: "Added by admin",
};

/**
 * Every consultant record: display name, job title, email, status, source,
 * photo status and the last change. An admin edits display name, job
 * title, email and photo URL, sets active or inactive, adds a consultant
 * ahead of their first sign-in, and releases a record for re-claiming.
 * Never phone or WhatsApp (those stay with the consultant), never deletion.
 */
export default function ConsultantAdmin() {
  const [rows, setRows] = useState<ConsultantSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/consultants");
      if (res.status === 401) {
        window.location.href = "/portal/sign-in";
        return;
      }
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "The consultant list is unavailable.");
      setRows(body.consultants ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The consultant list is unavailable.");
      setRows([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => !needle || r.displayName.toLowerCase().includes(needle) || r.email.toLowerCase().includes(needle) || r.jobTitle.toLowerCase().includes(needle));
  }, [rows, q]);

  const counts = useMemo(() => {
    const all = rows ?? [];
    return {
      total: all.length,
      inactive: all.filter((r) => r.status === "inactive").length,
      sso: all.filter((r) => r.source === "sso").length,
      unclaimed: all.filter((r) => !r.objectId).length,
      photosMissing: all.filter((r) => r.photoStatus !== "ok").length,
    };
  }, [rows]);

  if (rows === null) {
    return (
      <main className={styles.main}>
        <div className={styles.eyebrow}>CHARTER PORTAL</div>
        <p className={styles.intro}>Loading consultants…</p>
      </main>
    );
  }

  return (
    <main className={`${styles.main} ${styles.dashMain}`}>
      <div className={styles.dashHead}>
        <div>
          <div className={styles.eyebrow}>CHARTER PORTAL — ADMIN</div>
          <h1 className={styles.title}>Consultants</h1>
          <p className={styles.intro}>
            Every consultant record and what client pages show for it. Names, titles, addresses, photos and status are yours to correct here;
            phone and WhatsApp numbers stay with each consultant on their profile.
          </p>
        </div>
        <button type="button" className={styles.publishBtn} onClick={() => setAdding((a) => !a)}>
          {adding ? "CANCEL" : "ADD CONSULTANT"}
        </button>
      </div>

      {error && <p className={styles.dashError}>{error}</p>}

      {adding && (
        <AddForm
          onDone={() => {
            setAdding(false);
            load();
          }}
        />
      )}

      <section className={`${styles.card} ${styles.cardFirst} ${styles.dashCard}`}>
        <div className={styles.toolbar}>
          <input type="search" className={`${styles.input} ${styles.search}`} placeholder="Search by name, title or email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search consultants" />
          <span className={styles.counter}>
            {visible.length} OF {counts.total} · {counts.inactive} INACTIVE · {counts.sso} CREATED AT SIGN-IN · {counts.unclaimed} NOT YET SIGNED IN · {counts.photosMissing} WITHOUT PHOTO
          </span>
        </div>

        {visible.length === 0 ? (
          <p className={styles.dashEmptyFilter}>No consultants match that search.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>CONSULTANT</th>
                  <th>EMAIL</th>
                  <th>STATUS</th>
                  <th>SOURCE</th>
                  <th>PHOTO</th>
                  <th>UPDATED</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <Row
                    key={r.id}
                    r={r}
                    editing={editing === r.id}
                    onToggle={() => setEditing((cur) => (cur === r.id ? null : r.id))}
                    onSaved={(next) => {
                      setRows((all) => (all ?? []).map((x) => (x.id === next.id ? next : x)));
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

/* ---------------------------------------------------------------- row */

function Row({ r, editing, onToggle, onSaved }: { r: ConsultantSummary; editing: boolean; onToggle: () => void; onSaved: (next: ConsultantSummary) => void }) {
  return (
    <>
      <tr className={styles.row}>
        <td className={styles.tdWrap}>
          <span className={styles.rowClient}>{r.displayName || <em>No name</em>}</span>
          <span className={styles.rowSub}>
            {r.jobTitle || "No job title"}
            {r.source === "sso" && <span className={styles.ssoTag}>CREATED AT SIGN-IN</span>}
            {!r.objectId && <span className={styles.ssoTag}>NOT YET SIGNED IN</span>}
          </span>
        </td>
        <td className={styles.tdWrap}>{r.email || <em>none</em>}</td>
        <td>
          <span className={`${styles.status} ${r.status === "active" ? styles.status_published : styles.status_unpublished}`}>{r.status}</span>
        </td>
        <td>{SOURCE_LABEL[r.source]}</td>
        <td>
          {r.photoStatus === "ok" && r.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.photoUrl} alt="" className={styles.avatar} style={{ objectFit: "cover", display: "block" }} title={r.photoUrl} />
          ) : (
            <span className={styles.status}>missing</span>
          )}
        </td>
        <td title={r.updatedBy ?? ""}>
          {fmtDateShort(r.updatedAt)}
          <span className={styles.rowSub}>{r.updatedBy ?? "—"}</span>
        </td>
        <td className={styles.rowActionsCell}>
          <button type="button" className={styles.openBtn} onClick={onToggle} aria-expanded={editing}>
            {editing ? "CLOSE" : "EDIT"}
          </button>
        </td>
      </tr>
      {editing && (
        <tr>
          <td colSpan={7} style={{ padding: "0 0 28px", whiteSpace: "normal" }}>
            <EditForm r={r} onSaved={onSaved} onClose={onToggle} />
          </td>
        </tr>
      )}
    </>
  );
}

/* ------------------------------------------------------------ edit form */

function EditForm({ r, onSaved, onClose }: { r: ConsultantSummary; onSaved: (next: ConsultantSummary) => void; onClose: () => void }) {
  const [displayName, setDisplayName] = useState(r.displayName);
  const [jobTitle, setJobTitle] = useState(r.jobTitle);
  const [email, setEmail] = useState(r.email);
  const [photoUrl, setPhotoUrl] = useState(r.photoUrl);
  const [status, setStatus] = useState(r.status);
  const [release, setRelease] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<PhotoCheck>(null);
  const [saved, setSaved] = useState(false);
  /** Whether the browser managed to load the URL as typed — a first, client-side sign before the server HEAD check on save. */
  const [previewFailed, setPreviewFailed] = useState(false);

  const trimmedUrl = photoUrl.trim();
  const dirty = displayName !== r.displayName || jobTitle !== r.jobTitle || email !== r.email || trimmedUrl !== r.photoUrl || status !== r.status || release;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/admin/consultants/${encodeURIComponent(r.id)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName, jobTitle, email, photoUrl: trimmedUrl, status, ...(release ? { releaseObjectId: true } : {}) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "The record could not be saved.");
      onSaved(body.consultant as ConsultantSummary);
      setPhoto(body.photo ?? null);
      setRelease(false);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The record could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const field = (label: string, value: string, set: (v: string) => void, type = "text", hint?: string) => (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>
        {label}
        {hint && <span className={styles.fieldLabelHint}> — {hint}</span>}
      </span>
      <input type={type} className={styles.input} value={value} onChange={(e) => set(e.target.value)} />
    </label>
  );

  return (
    <form className={styles.card} style={{ marginTop: 0, borderTop: 0 }} onSubmit={save}>
      <div className={styles.sectionHeadRow}>
        <div className={styles.sectionHead}>EDIT — {r.displayName.toUpperCase() || "CONSULTANT"}</div>
        <span className={styles.headerNote}>
          Record <code>{r.id}</code> · sign-in {r.objectId ? <code>{r.objectId}</code> : "not yet claimed"}
        </span>
      </div>
      <p className={styles.sectionNote}>
        Phone and WhatsApp are not shown or editable here: they belong to the consultant on their profile. Every change here is stamped with your
        address.
      </p>
      <div className={styles.profileRow}>
        <div>
          {trimmedUrl && !previewFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={trimmedUrl}
              src={trimmedUrl}
              alt=""
              className={styles.profilePhoto}
              onError={() => setPreviewFailed(true)}
              onLoad={() => setPreviewFailed(false)}
            />
          ) : (
            <div className={styles.profilePhotoEmpty}>{(displayName || "?").slice(0, 1).toUpperCase()}</div>
          )}
          <p className={styles.rowSub} style={{ maxWidth: 128, textAlign: "center" }}>
            {trimmedUrl === r.photoUrl
              ? `Stored check: ${r.photoStatus}`
              : previewFailed
                ? "Did not load in the browser"
                : trimmedUrl
                  ? "Checked on save"
                  : "No photo"}
          </p>
        </div>
        <div className={styles.grid} style={{ flex: "1 1 320px" }}>
          {field("DISPLAY NAME", displayName, setDisplayName)}
          {field("JOB TITLE", jobTitle, setJobTitle)}
          {field("EMAIL", email, setEmail, "email", "lowercase; the sign-in address and the one clients see")}
          <label className={styles.field}>
            <span className={styles.fieldLabel}>STATUS</span>
            <select className={styles.select} value={status} onChange={(e) => setStatus(e.target.value as ConsultantSummary["status"])}>
              <option value="active">Active</option>
              <option value="inactive">Inactive — client pages show the charter desk</option>
            </select>
          </label>
          <label className={`${styles.field} ${styles.fieldFull}`}>
            <span className={styles.fieldLabel}>
              PHOTO URL <span className={styles.fieldLabelHint}>— https only; HEAD-checked when it changes</span>
            </span>
            <input
              type="url"
              className={styles.input}
              value={photoUrl}
              onChange={(e) => {
                setPhotoUrl(e.target.value);
                setPreviewFailed(false);
              }}
              placeholder="Example – https://cdn.oceanindependence.com/Team%20Images/first-last.jpg"
            />
          </label>
          {r.objectId && (
            <label className={`${styles.checkRow} ${styles.fieldFull}`}>
              <input type="checkbox" className={styles.checkbox} checked={release} onChange={(e) => setRelease(e.target.checked)} />
              <span className={styles.checkLabel}>
                Release for re-claiming: clear the sign-in link so this record is claimed by the next sign-in whose address matches the email above.
                Use it when a seeded address turns out not to be the one Microsoft signs the person in as, then mark the stray record inactive.
              </span>
            </label>
          )}
        </div>
      </div>
      <div className={styles.sectionHeadRow} style={{ marginTop: 28, marginBottom: 0 }}>
        <span className={styles.updatedLine}>
          {error && <span className={styles.dashError} style={{ margin: 0 }}>{error}</span>}
          {!error && saved && (
            <span className={styles.savedNote}>
              SAVED
              {photo && ` · PHOTO ${photo.status.toUpperCase()}${photo.httpStatus ? ` (HTTP ${photo.httpStatus})` : ""}${photo.error ? ` — ${photo.error}` : ""}`}
            </span>
          )}
          {!error && !saved && r.updatedAt && `Last changed ${fmtDateShort(r.updatedAt)} by ${r.updatedBy ?? "—"}`}
        </span>
        <span style={{ display: "flex", gap: 12 }}>
          <button type="button" className={styles.previewBtn} onClick={onClose}>
            CLOSE
          </button>
          <button type="submit" className={styles.publishBtn} disabled={busy || !dirty}>
            {busy ? "SAVING…" : "SAVE CHANGES"}
          </button>
        </span>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------- add form */

function AddForm({ onDone }: { onDone: () => void }) {
  const [displayName, setDisplayName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/consultants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName, jobTitle, email }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "The consultant could not be added.");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The consultant could not be added.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={`${styles.card} ${styles.cardFirst}`} onSubmit={submit}>
      <div className={styles.sectionHead}>ADD A CONSULTANT WHO HAS NOT YET SIGNED IN</div>
      <p className={styles.sectionNote}>
        The record is created without a sign-in link and claimed the first time someone signs in with this email address. They add their own
        phone number on first sign-in; you can set a photo URL afterwards from the list.
      </p>
      <div className={styles.grid}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>DISPLAY NAME</span>
          <input type="text" className={styles.input} value={displayName} onChange={(e) => setDisplayName(e.target.value)} required placeholder="Example – Lucy Oliver" />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>JOB TITLE</span>
          <input type="text" className={styles.input} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Example – Charter Consultant" />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>EMAIL</span>
          <input type="email" className={styles.input} value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="Example – lucy@ocyachts.com" />
        </label>
      </div>
      <div className={styles.sectionHeadRow} style={{ marginTop: 28, marginBottom: 0 }}>
        <span className={styles.updatedLine}>{error && <span className={styles.dashError} style={{ margin: 0 }}>{error}</span>}</span>
        <button type="submit" className={styles.publishBtn} disabled={busy}>
          {busy ? "ADDING…" : "ADD CONSULTANT"}
        </button>
      </div>
    </form>
  );
}
