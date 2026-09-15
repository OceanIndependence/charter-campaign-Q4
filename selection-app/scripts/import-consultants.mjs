#!/usr/bin/env node
/**
 * Local test harness for the consultant seed import.
 *
 *   npm run consultants:import                   import data/consultants-seed.csv
 *   npm run consultants:import -- --dry-run      read, check photos, write nothing
 *   npm run consultants:import -- --rebuild-index   instead: rebuild consultants/index.json from the records
 *
 * The import itself lives in src/server/consultant-import.mjs and is the
 * SAME function the portal's import page calls (POST
 * /api/admin/import-consultants), so the two cannot drift. In the deployed
 * app the button on /portal/admin/import-consultants is the way to run it,
 * where BLOB_READ_WRITE_TOKEN already is; this script exists for local
 * testing against .portal-store/ (or Blob, with a token in .env.local).
 *
 * Rows are parsed from the CSV here with the same parser the build step
 * uses to generate src/data/consultants-seed.ts. Writes a report to
 * docs/consultants-import-report.md.
 */

import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readSeed } from "./lib/seed-csv.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SEED = path.join(ROOT, "data", "consultants-seed.csv");
const REPORT = path.join(ROOT, "docs", "consultants-import-report.md");
const UPDATED_BY = "import:consultants-seed.csv";

/** Load KEY=value lines from .env.local into process.env when not already set (script use only). */
async function loadEnvLocal() {
  const file = path.join(ROOT, ".env.local");
  if (!existsSync(file)) return;
  for (const line of (await readFile(file, "utf8")).split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

function fmtDate(d) {
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = d.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
  return `${day} ${month} ${d.getUTCFullYear()}`;
}

export function renderReport(r) {
  const ranAt = new Date(r.ranAt);
  const lines = [];
  lines.push("# Consultant seed import report");
  lines.push("");
  lines.push(`Run on ${fmtDate(ranAt)} at ${r.ranAt.slice(11, 19)} UTC by \`npm run consultants:import\`${r.dryRun ? " (dry run: nothing written)" : ""}.`);
  lines.push(`Storage backend: ${r.backend}. Source: \`data/consultants-seed.csv\` (${r.total} rows).`);
  if (r.backend === "filesystem") {
    lines.push("");
    lines.push("This run wrote to the local `.portal-store/` directory (no Blob token was present): a local test only. The deployed store is seeded from the portal at `/portal/admin/import-consultants`, which runs the same function; this report is rewritten on every local run.");
  }
  lines.push("");
  lines.push("The import creates records only. Rows whose email already had a record were skipped; nothing existing was updated or deleted. From here on, records are edited through the admin screen.");
  lines.push("");
  lines.push(`## Records created (${r.created.length})`);
  lines.push("");
  if (r.created.length) {
    lines.push("| Display name | Job title | Email | Photo | Record id |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const c of r.created) lines.push(`| ${c.displayName} | ${c.jobTitle} | ${c.email} | ${c.photoStatus} | \`${c.id}\` |`);
  } else lines.push("None.");
  lines.push("");
  lines.push(`## Rows skipped (${r.skipped.length})`);
  lines.push("");
  if (r.skipped.length) {
    lines.push("| Line | Name | Email | Reason |");
    lines.push("| --- | --- | --- | --- |");
    for (const s of r.skipped) lines.push(`| ${s.line} | ${s.name} | ${s.email} | ${s.reason} |`);
  } else lines.push("None.");
  if (r.invalid.length) {
    lines.push("");
    lines.push(`## Rows not imported (${r.invalid.length})`);
    lines.push("");
    lines.push("| Line | Name | Email | Problem |");
    lines.push("| --- | --- | --- | --- |");
    for (const s of r.invalid) lines.push(`| ${s.line} | ${s.name} | ${s.email} | ${s.reason} |`);
  }
  lines.push("");
  lines.push(`## Photos that did not resolve (${r.photoFailures.length})`);
  lines.push("");
  if (r.photoFailures.length) {
    lines.push("These records were created with `photoStatus: \"missing\"`. Correct the URL on the admin screen, which re-runs the check.");
    lines.push("");
    lines.push("| Display name | Photo URL | HTTP status | Detail |");
    lines.push("| --- | --- | --- | --- |");
    for (const f of r.photoFailures) lines.push(`| ${f.displayName} | ${f.photoUrl || "(blank)"} | ${f.httpStatus ?? "—"} | ${f.error ?? ""} |`);
  } else lines.push("None: every photo URL answered a HEAD request with an image.");
  lines.push("");
  return lines.join("\n");
}

async function main() {
  await loadEnvLocal();
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  const storage = await import("../src/server/storage.mjs");
  const backend = storage.storageMode().data;

  if (args.includes("--rebuild-index")) {
    const { rebuildConsultantIndex } = await import("../src/server/consultants.mjs");
    const result = await rebuildConsultantIndex();
    console.log(`[consultants] index rebuilt from ${result.records} record(s) (${backend}).`);
    return;
  }

  const rows = readSeed(await readFile(SEED, "utf8"));
  console.log(`[consultants] ${rows.length} row(s) in ${path.relative(ROOT, SEED)}; storage: ${backend}${dryRun ? "; DRY RUN" : ""}`);

  const { importConsultantSeed } = await import("../src/server/consultant-import.mjs");
  const result = await importConsultantSeed(rows, { updatedBy: UPDATED_BY, dryRun, log: (l) => console.log(`[consultants] ${l}`) });

  await writeFile(REPORT, renderReport(result), "utf8");
  console.log(
    `[consultants] ${result.created.length} ${dryRun ? "would be created" : "created"}, ${result.skipped.length} skipped, ${result.invalid.length} not imported, ${result.photoFailures.length} photo(s) missing. Report: ${path.relative(ROOT, REPORT)}`
  );
}

main().catch((err) => {
  console.error(`[consultants] ${String(err?.message ?? err)}`);
  process.exitCode = 1;
});
