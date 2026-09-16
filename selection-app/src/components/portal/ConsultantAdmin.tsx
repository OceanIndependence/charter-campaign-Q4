"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ConsultantSummary, PhotoStatus, PortalRole } from "@/lib/consultant-types";
import { fmtDateShort } from "@/lib/format";
import styles from "./PortalForm.module.css";

type PhotoCheck = { status: PhotoStatus; httpStatus: number | null; error: string | null } | null;

const SOURCE_LABEL: Record<ConsultantSummary["source"], string> = {
  csv: "Seed list",
  sso: "Created at sign-in",
  admin: "Added by admin",
};

/**
 * Every consultant record: display name, job title, email, status, admin
 * access, source, photo status and the last change. An admin edits display
 * name, job title, email and photo URL, sets active or inactive, adds a
 * consultant ahead of their first sign-in, and releases a record for
 * re-claiming. Never phone or WhatsApp (those stay with the consultant),
 * never deletion.
 *
 * The ADMIN column is the owner's alone to change, and it is a column
 * rather than a field in the edit drawer so that every row's access reads
 * at a glance. `role` and `ownerEmail` come from the server with the list;
 * the server refuses the write regardless of what this component renders.
 */
export default function ConsultantAdmin() {
  const [rows, setRows] = useState<ConsultantSummary[] | null>(null);
  /** The caller's own role, from the server. Only an owner may toggle admin access. */
  const [role, setRole] = useState<PortalRole>("consultant");
  /** The owner's address, so their row (if they have one) shows a fixed chip. */
  const [ownerEmail, setOwnerEmail] = useState("");
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
      setRole((body.role as PortalRole) ?? "consultant");
      setOwnerEmail(String(body.ownerEmail ?? "").trim().toLowerCase());
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
      admins: all.filter((r) => r.isAdmin && r.status === "active").length,
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
        <span style={{ display: "flex", gap: 12 }}>
          <a href="/portal/admin/import-consultants" className={styles.previewBtn}>
            IMPORT SEED LIST
          </a>
          <button type="button" className={styles.publishBtn} onClick={() => setAdding((a) => !a)}>
            {adding ? "CANCEL" : "ADD CONSULTANT"}
          </button>
        </span>
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
            {visible.length} OF {counts.total} · {counts.inactive} INACTIVE · {counts.admins} ADMIN · {counts.sso} CREATED AT SIGN-IN · {counts.unclaimed} NOT YET SIGNED IN ·{" "}
            {counts.photosMissing} WITHOUT PHOTO
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
                  <th>ADMIN</th>
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
                    role={role}
                    ownerEmail={ownerEmail}
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

function Row({
  r,
  role,
  ownerEmail,
  editing,
  onToggle,
  onSaved,
}: {
  r: ConsultantSummary;
  role: PortalRole;
  ownerEmail: string;
  editing: boolean;
  onToggle: () => void;
  onSaved: (next: ConsultantSummary) => void;
}) {
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
        <AdminCell r={r} role={role} ownerEmail={ownerEmail} onSaved={onSaved} />
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
          <td colSpan={8} style={{ padding: "0 0 28px", whiteSpace: "normal" }}>
            <EditForm r={r} onSaved={onSaved} onClose={onToggle} />
          </td>
        </tr>
      )}
    </>
  );
}

/* ----------------------------------------------------------- admin cell */

/**
 * The ADMIN column for one row. Three renderings, decided by the server's
 * answer rather than by anything the browser knows:
 *
 *   - the owner's own row: a fixed OWNER chip and no control at all, so
 *     there is never a checkbox on screen that could remove the owner;
 *   - the owner viewing anyone else: a checkbox that writes immediately;
 *   - an admin viewing: the ADMIN badge on admin rows, nothing on the rest.
 *
 * The toggle is optimistic — the tick moves at once and the row is patched
 * in the parent's state, then replaced by the stored record when the write
 * returns. A failure puts the previous row back and shows the server's own
 * wording under the checkbox, so a refused grant (an inactive record, an
 * admin who is not the owner) explains itself where it happened.
 */
function AdminCell({
  r,
  role,
  ownerEmail,
  onSaved,
}: {
  r: ConsultantSummary;
  role: PortalRole;
  ownerEmail: string;
  onSaved: (next: ConsultantSummary) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOwnerRow = Boolean(ownerEmail) && r.email.trim().toLowerCase() === ownerEmail;
  const grantedTitle = r.isAdmin && r.adminGrantedAt ? `Granted ${fmtDateShort(r.adminGrantedAt)}${r.adminGrantedBy ? ` by ${r.adminGrantedBy}` : ""}` : undefined;

  if (isOwnerRow) {
    return (
      <td>
        <span className={styles.ssoTag} style={{ marginLeft: 0 }} title="Set by PORTAL_OWNER_EMAIL">
          OWNER
        </span>
      </td>
    );
  }

  if (role !== "owner") {
    return <td>{r.isAdmin ? <span className={`${styles.status} ${styles.status_published}`} title={grantedTitle}>admin</span> : null}</td>;
  }

  const toggle = async (next: boolean) => {
    const previous = r;
    setError(null);
    setBusy(true);
    onSaved({ ...r, isAdmin: next });
    try {
      const res = await fetch(`/api/admin/consultants/${encodeURIComponent(r.id)}/admin`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isAdmin: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Admin access could not be changed.");
      onSaved(body.consultant as ConsultantSummary);
    } catch (err) {
      onSaved(previous);
      setError(err instanceof Error ? err.message : "Admin access could not be changed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <td>
      <input
        type="checkbox"
        className={styles.checkbox}
        checked={r.isAdmin}
        disabled={busy}
        onChange={(e) => toggle(e.target.checked)}
        title={grantedTitle}
        aria-label={`Admin access for ${r.displayName || r.email || "this consultant"}`}
      />
      {error && (
        <span className={styles.dashError} style={{ display: "block", margin: "6px 0 0", maxWidth: 180, whiteSpace: "normal" }}>
          {error}
        </span>
      )}
    </td>
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
              <option value="inactive">Inactive — client pages show no contact block</option>
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
