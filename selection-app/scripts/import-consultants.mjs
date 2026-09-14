#!/usr/bin/env node
/**
 * One-off import of the consultant seed list into consultants/<id>.json.
 *
 *   npm run consultants:import                   import data/consultants-seed.csv
 *   npm run consultants:import -- --dry-run      read, check photos, write nothing
 *   npm run consultants:import -- --rebuild-index   instead: rebuild consultants/index.json from the records
 *
 * This is an import, not a sync. A row whose email already has a record is
 * skipped and reported; nothing existing is ever updated or deleted — after
 * the import, records are edited through the admin screen. Each photo URL
 * is HEAD-checked and the result written to photoStatus; a missing photo is
 * reported, never fatal. Run deliberately, by hand: nothing here runs on
 * build or deploy.
 *
 * Columns: Name,Job title,Mobile phone,Email,WhatsApp,Photo URL (Sirv)
 * (the file carries a UTF-8 BOM; the photos are on cdn.oceanindependence.com
 * despite the column name).
 *
 * Writes to the private DATA store — Vercel Blob when
 * PORTAL_DATA_READ_WRITE_TOKEN (or BLOB_READ_WRITE_TOKEN) is in the
 * environment or a git-ignored .env.local, otherwise .portal-store/ for
 * local development — and a report to docs/consultants-import-report.md.
 */

import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SEED = path.join(ROOT, "data", "consultants-seed.csv");
const REPORT = path.join(ROOT, "docs", "consultants-import-report.md");
const UPDATED_BY = "import:consultants-seed.csv";

const COLUMNS = {
  name: "Name",
  jobTitle: "Job title",
  phone: "Mobile phone",
  email: "Email",
  whatsapp: "WhatsApp",
  photoUrl: "Photo URL (Sirv)",
};

/** Load KEY=value lines from .env.local into process.env when not already set (script use only). */
async function loadEnvLocal() {
  const file = path.join(ROOT, ".env.local");
  if (!existsSync(file)) return;
  for (const line of (await readFile(file, "utf8")).split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

/** Minimal RFC 4180 parser: quoted fields, doubled quotes, CRLF or LF. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

/** Rows as objects keyed by header, after stripping the BOM. */
export function readSeed(text) {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const [header, ...rows] = parseCsv(clean);
  const heads = (header ?? []).map((h) => h.trim());
  for (const wanted of Object.values(COLUMNS)) {
    if (!heads.includes(wanted)) throw new Error(`Seed CSV is missing the "${wanted}" column (found: ${heads.join(", ")}).`);
  }
  const at = (row, key) => (row[heads.indexOf(COLUMNS[key])] ?? "").trim();
  return rows.map((row, i) => ({
    line: i + 2,
    name: at(row, "name"),
    jobTitle: at(row, "jobTitle"),
    phone: at(row, "phone"),
    email: at(row, "email").toLowerCase(),
    whatsapp: at(row, "whatsapp"),
    photoUrl: at(row, "photoUrl"),
  }));
}

function fmtDate(d) {
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = d.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
  return `${day} ${month} ${d.getUTCFullYear()}`;
}

function renderReport({ ranAt, backend, dryRun, created, skipped, invalid, photoFailures, total }) {
  const lines = [];
  lines.push("# Consultant seed import report");
  lines.push("");
  lines.push(`Run on ${fmtDate(ranAt)} at ${ranAt.toISOString().slice(11, 19)} UTC by \`npm run consultants:import\`${dryRun ? " (dry run: nothing written)" : ""}.`);
  lines.push(`Storage backend: ${backend}. Source: \`data/consultants-seed.csv\` (${total} rows).`);
  if (backend === "filesystem") {
    lines.push("");
    lines.push("This run wrote to the local `.portal-store/` directory (no Blob token was present). To seed the deployed store, put `PORTAL_DATA_READ_WRITE_TOKEN` in `.env.local` and run the command again; the report is rewritten on every run.");
  }
  lines.push("");
  lines.push("The import creates records only. Rows whose email already had a record were skipped; nothing existing was updated or deleted. From here on, records are edited through the admin screen.");
  lines.push("");
  lines.push(`## Records created (${created.length})`);
  lines.push("");
  if (created.length) {
    lines.push("| Display name | Job title | Email | Photo | Record id |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const r of created) lines.push(`| ${r.displayName} | ${r.jobTitle} | ${r.email} | ${r.photoStatus} | \`${r.id}\` |`);
  } else lines.push("None.");
  lines.push("");
  lines.push(`## Rows skipped (${skipped.length})`);
  lines.push("");
  if (skipped.length) {
    lines.push("| Line | Name | Email | Reason |");
    lines.push("| --- | --- | --- | --- |");
    for (const s of skipped) lines.push(`| ${s.line} | ${s.name} | ${s.email} | ${s.reason} |`);
  } else lines.push("None.");
  if (invalid.length) {
    lines.push("");
    lines.push(`## Rows not imported (${invalid.length})`);
    lines.push("");
    lines.push("| Line | Name | Email | Problem |");
    lines.push("| --- | --- | --- | --- |");
    for (const s of invalid) lines.push(`| ${s.line} | ${s.name} | ${s.email} | ${s.reason} |`);
  }
  lines.push("");
  lines.push(`## Photos that did not resolve (${photoFailures.length})`);
  lines.push("");
  if (photoFailures.length) {
    lines.push("These records were created with `photoStatus: \"missing\"`. Correct the URL on the admin screen, which re-runs the check.");
    lines.push("");
    lines.push("| Display name | Photo URL | HTTP status | Detail |");
    lines.push("| --- | --- | --- | --- |");
    for (const f of photoFailures) lines.push(`| ${f.displayName} | ${f.photoUrl || "(blank)"} | ${f.httpStatus ?? "—"} | ${f.error ?? ""} |`);
  } else lines.push("None: every photo URL answered a HEAD request with an image.");
  lines.push("");
  return lines.join("\n");
}

async function main() {
  await loadEnvLocal();
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  if (dryRun) process.env.FLEET_REFRESH_DRY_RUN = "true";

  const storage = await import("../src/server/storage.mjs");
  const consultants = await import("../src/server/consultants.mjs");
  const backend = storage.storageMode().data;

  if (args.includes("--rebuild-index")) {
    const result = await consultants.rebuildConsultantIndex();
    console.log(`[consultants] index rebuilt from ${result.records} record(s) (${backend}).`);
    return;
  }

  const rows = readSeed(await readFile(SEED, "utf8"));
  console.log(`[consultants] ${rows.length} row(s) in ${path.relative(ROOT, SEED)}; storage: ${backend}${dryRun ? "; DRY RUN" : ""}`);

  const created = [];
  const skipped = [];
  const invalid = [];
  const photoFailures = [];
  const seenEmails = new Set();

  for (const row of rows) {
    const label = `${row.name || "(no name)"} <${row.email || "no email"}>`;
    if (!row.email || !row.email.includes("@")) {
      invalid.push({ ...row, reason: "No usable email address." });
      console.log(`[consultants] line ${row.line}: ${label} — not imported (no usable email)`);
      continue;
    }
    if (!row.name) {
      invalid.push({ ...row, reason: "No name." });
      console.log(`[consultants] line ${row.line}: ${label} — not imported (no name)`);
      continue;
    }
    if (seenEmails.has(row.email)) {
      skipped.push({ ...row, reason: "Duplicate email earlier in the file." });
      console.log(`[consultants] line ${row.line}: ${label} — skipped (duplicate in file)`);
      continue;
    }
    seenEmails.add(row.email);

    const existingId = await consultants.findConsultantIdByEmail(row.email);
    if (existingId) {
      skipped.push({ ...row, reason: `A record already exists (\`${existingId}\`).` });
      console.log(`[consultants] line ${row.line}: ${label} — skipped (record ${existingId} exists)`);
      continue;
    }

    const photo = await consultants.checkPhotoDetail(row.photoUrl);
    const record = consultants.stampConsultant(
      {
        ...consultants.emptyConsultantRecord(consultants.newConsultantId()),
        objectId: null,
        email: row.email,
        displayName: row.name,
        jobTitle: row.jobTitle,
        phone: row.phone,
        whatsapp: row.whatsapp,
        photoUrl: row.photoUrl,
        photoStatus: photo.status,
        source: "csv",
        status: "active",
      },
      UPDATED_BY
    );
    await consultants.writeConsultantRecord(record);
    created.push(record);
    if (photo.status !== "ok") photoFailures.push({ displayName: record.displayName, photoUrl: record.photoUrl, httpStatus: photo.httpStatus, error: photo.error });
    console.log(`[consultants] line ${row.line}: ${label} — created ${record.id} (photo ${photo.status}${photo.httpStatus ? ` ${photo.httpStatus}` : ""})`);
  }

  const report = renderReport({ ranAt: new Date(), backend, dryRun, created, skipped, invalid, photoFailures, total: rows.length });
  await writeFile(REPORT, report, "utf8");
  console.log(`[consultants] ${created.length} created, ${skipped.length} skipped, ${invalid.length} not imported, ${photoFailures.length} photo(s) missing. Report: ${path.relative(ROOT, REPORT)}`);
}

main().catch((err) => {
  console.error(`[consultants] ${String(err?.message ?? err)}`);
  process.exitCode = 1;
});
