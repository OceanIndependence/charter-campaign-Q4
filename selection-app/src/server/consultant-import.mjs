/**
 * The seed import — SERVER-ONLY, one function shared by the portal's import
 * page (POST /api/admin/import-consultants) and the local test script
 * (scripts/import-consultants.mjs), so the two cannot drift.
 *
 * An import, not a sync, and safe to run any number of times: a row whose
 * email already has a record (active or inactive) is skipped and reported;
 * nothing existing is ever updated or deleted. Each new record's photo URL
 * is HEAD-checked and the result written to photoStatus; a missing photo is
 * reported, never fatal. Writes go to whatever DATA store storage.mjs is
 * configured for — on Vercel that is the Blob store behind
 * BLOB_READ_WRITE_TOKEN (or PORTAL_DATA_READ_WRITE_TOKEN).
 *
 * Rows come from the caller: the generated src/data/consultants-seed.ts in
 * the app, the parsed CSV in the script. Nothing here touches the
 * filesystem.
 */

import { storageMode } from "./storage.mjs";
import { checkPhotoDetail, emptyConsultantRecord, findConsultantIdByEmail, newConsultantId, stampConsultant, writeConsultantRecord } from "./consultants.mjs";

/**
 * One import at a time per process: two presses of the button in the same
 * function instance queue behind each other instead of racing on the
 * email check. (Separate instances can still race; the second run's rows
 * are skipped on the next press, and the admin screen shows any duplicate.)
 */
let running = null;

/**
 * @param {ReadonlyArray<{ line: number, name: string, jobTitle: string, phone: string, email: string, whatsapp: string, photoUrl: string }>} rows
 * @param {{ updatedBy: string, dryRun?: boolean, log?: (line: string) => void }} opts
 */
export async function importConsultantSeed(rows, { updatedBy, dryRun = false, log = () => {} }) {
  if (running) await running.catch(() => {});
  running = run(rows, { updatedBy, dryRun, log });
  try {
    return await running;
  } finally {
    running = null;
  }
}

async function run(rows, { updatedBy, dryRun, log }) {
  const created = [];
  const skipped = [];
  const invalid = [];
  const photoFailures = [];
  const seenEmails = new Set();

  for (const row of rows) {
    const email = String(row.email ?? "").trim().toLowerCase();
    const name = String(row.name ?? "").trim();
    const label = `${name || "(no name)"} <${email || "no email"}>`;
    if (!email || !email.includes("@")) {
      invalid.push({ line: row.line, name, email, reason: "No usable email address." });
      log(`line ${row.line}: ${label} — not imported (no usable email)`);
      continue;
    }
    if (!name) {
      invalid.push({ line: row.line, name, email, reason: "No name." });
      log(`line ${row.line}: ${label} — not imported (no name)`);
      continue;
    }
    if (seenEmails.has(email)) {
      skipped.push({ line: row.line, name, email, reason: "Duplicate email earlier in the seed list." });
      log(`line ${row.line}: ${label} — skipped (duplicate in seed list)`);
      continue;
    }
    seenEmails.add(email);

    // Any existing record, active or inactive, wins: the import never touches it.
    const existingId = await findConsultantIdByEmail(email);
    if (existingId) {
      skipped.push({ line: row.line, name, email, reason: `A record already exists (${existingId}).` });
      log(`line ${row.line}: ${label} — skipped (record ${existingId} exists)`);
      continue;
    }

    const photoUrl = String(row.photoUrl ?? "").trim();
    const photo = await checkPhotoDetail(photoUrl);
    const record = stampConsultant(
      {
        ...emptyConsultantRecord(newConsultantId()),
        objectId: null,
        email,
        displayName: name,
        jobTitle: String(row.jobTitle ?? "").trim(),
        phone: String(row.phone ?? "").trim(),
        whatsapp: String(row.whatsapp ?? "").trim(),
        photoUrl,
        photoStatus: photo.status,
        source: "csv",
        status: "active",
      },
      updatedBy
    );
    if (!dryRun) await writeConsultantRecord(record);
    created.push({ id: record.id, displayName: record.displayName, jobTitle: record.jobTitle, email: record.email, photoStatus: record.photoStatus });
    if (photo.status !== "ok") photoFailures.push({ displayName: record.displayName, photoUrl, httpStatus: photo.httpStatus, error: photo.error });
    log(`line ${row.line}: ${label} — ${dryRun ? "would create" : "created"} ${record.id} (photo ${photo.status}${photo.httpStatus ? ` ${photo.httpStatus}` : ""})`);
  }

  return {
    ranAt: new Date().toISOString(),
    backend: storageMode().data,
    dryRun,
    total: rows.length,
    created,
    skipped,
    invalid,
    photoFailures,
  };
}
