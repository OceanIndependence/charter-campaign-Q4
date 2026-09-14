"use client";

import { useCallback, useEffect, useState } from "react";
import type { ConsultantImportResult } from "@/lib/consultant-seed-types";
import type { ImportStatus } from "@/app/api/admin/import-consultants/route";
import { ADMIN_CONSULTANTS_PATH } from "@/lib/consultant-types";
import styles from "./PortalForm.module.css";

const ENV_LABEL: Record<string, string> = { production: "Production", preview: "Preview", development: "Development" };

/**
 * The import page body: where the writes go, what a press would do, the
 * button, and the outcome — created, skipped, photos that did not resolve.
 * Safe to press twice: every seed email that already has a record is
 * skipped by the import function itself.
 */
export default function ConsultantImport() {
  const [status, setStatus] = useState<ImportStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ConsultantImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/import-consultants");
      if (res.status === 401) {
        window.location.href = "/portal/login";
        return;
      }
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "The import status is unavailable.");
      setStatus(body as ImportStatus);
      setStatusError(null);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : "The import status is unavailable.");
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const run = async () => {
    if (running) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/import-consultants", { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "The import did not run.");
      setResult(body.result as ConsultantImportResult);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The import did not run.");
    } finally {
      setRunning(false);
    }
  };

  const isBlob = status?.backend.startsWith("blob") ?? false;
  const envLabel = status?.vercelEnv ? ENV_LABEL[status.vercelEnv] ?? status.vercelEnv : "outside Vercel";
  const toImport = status ? status.seedRows - status.alreadyImported : null;

  return (
    <main className={styles.main}>
      <div className={styles.eyebrow}>CHARTER PORTAL — ADMIN</div>
      <h1 className={styles.title}>Import consultants</h1>
      <p className={styles.intro}>
        Creates a consultant record for every row of the seed list that does not already have one. Rows whose email already has a record are
        skipped, and nothing existing is ever updated or deleted, so the button is safe to press again. Each photo URL is checked as the record
        is created.
      </p>

      <section className={`${styles.card} ${styles.cardFirst}`}>
        <div className={styles.sectionHead}>01 — WHERE THIS WRITES</div>
        {statusError && <p className={styles.fetchWarning}>{statusError}</p>}
        {status && (
          <div className={styles.grid}>
            <Value label="DEPLOYMENT" value={envLabel} />
            <Value label="DATA STORE" value={status.backend} warn={!isBlob} />
            <Value label="BLOB STORE ID" value={status.blobStoreId ?? "—"} hint="the same id on Production and a preview means both write to one store" />
            <Value label="SEED ROWS" value={String(status.seedRows)} />
            <Value label="RECORDS IN STORE" value={String(status.existingRecords)} />
            <Value label="WOULD CREATE" value={toImport === null ? "—" : String(toImport)} hint={`${status.alreadyImported} already imported`} />
          </div>
        )}
        {status && !isBlob && (
          <p className={styles.fetchWarning} style={{ marginTop: 22 }}>
            This deployment has no Blob token, so the import would write to a local filesystem that Vercel discards. Press it on a deployment
            whose data store reads &ldquo;blob (private)&rdquo;.
          </p>
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.sectionHeadRow}>
          <div className={styles.sectionHead}>02 — RUN THE IMPORT</div>
          <span style={{ display: "flex", gap: 12 }}>
            <a href={ADMIN_CONSULTANTS_PATH} className={styles.previewBtn}>
              CONSULTANT LIST
            </a>
            <button type="button" className={styles.publishBtn} onClick={run} disabled={running || !status}>
              {running ? "IMPORTING…" : result ? "RUN AGAIN" : "IMPORT SEED LIST"}
            </button>
          </span>
        </div>
        <p className={styles.sectionNote}>
          The source is <code>data/consultants-seed.csv</code>, compiled into the app at build time. To change the seed list, edit the CSV, commit,
          and deploy; then press again and only the new rows are created.
        </p>
        {error && <p className={styles.dashError}>{error}</p>}

        {result && (
          <>
            <div className={styles.grid} style={{ marginTop: 8 }}>
              <Value label="CREATED" value={String(result.created.length)} />
              <Value label="SKIPPED" value={String(result.skipped.length)} />
              <Value label="NOT IMPORTED" value={String(result.invalid.length)} warn={result.invalid.length > 0} />
              <Value label="PHOTOS NOT RESOLVED" value={String(result.photoFailures.length)} warn={result.photoFailures.length > 0} />
              <Value label="WRITTEN TO" value={result.backend} warn={!result.backend.startsWith("blob")} />
            </div>

            {result.created.length > 0 && (
              <Table
                title="Records created"
                head={["Name", "Job title", "Email", "Photo"]}
                rows={result.created.map((c) => [c.displayName, c.jobTitle, c.email, c.photoStatus])}
              />
            )}
            {result.skipped.length > 0 && (
              <Table title="Rows skipped" head={["Line", "Name", "Email", "Reason"]} rows={result.skipped.map((s) => [String(s.line), s.name, s.email, s.reason])} />
            )}
            {result.invalid.length > 0 && (
              <Table title="Rows not imported" head={["Line", "Name", "Email", "Problem"]} rows={result.invalid.map((s) => [String(s.line), s.name, s.email, s.reason])} />
            )}
            {result.photoFailures.length > 0 && (
              <Table
                title="Photos that did not resolve"
                head={["Name", "Photo URL", "HTTP", "Detail"]}
                rows={result.photoFailures.map((f) => [f.displayName, f.photoUrl || "(blank)", f.httpStatus == null ? "—" : String(f.httpStatus), f.error ?? ""])}
              />
            )}
            {result.photoFailures.length === 0 && result.created.length > 0 && (
              <p className={styles.sectionNote} style={{ marginTop: 22 }}>
                Every photo URL answered with an image.
              </p>
            )}
          </>
        )}
      </section>
    </main>
  );
}

function Value({ label, value, hint, warn }: { label: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>
        {label}
        {hint && <span className={styles.fieldLabelHint}> — {hint}</span>}
      </span>
      <span className={styles.readValue} style={warn ? { color: "#8a5a2b" } : undefined}>
        {value}
      </span>
    </div>
  );
}

function Table({ title, head, rows }: { title: string; head: string[]; rows: string[][] }) {
  return (
    <div style={{ marginTop: 28 }}>
      <div className={styles.fieldLabel} style={{ marginBottom: 10 }}>
        {title.toUpperCase()} ({rows.length})
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              {head.map((h) => (
                <th key={h}>{h.toUpperCase()}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={styles.row}>
                {r.map((c, j) => (
                  <td key={j} className={styles.tdWrap}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
