#!/usr/bin/env node
/**
 * Yachtfolio maintenance CLI — the diagnostic companion to the Charter
 * Portal's fleet services (which now own the data flow: nightly cron sync
 * plus on-demand per-yacht detail; see src/server/fleet.mjs).
 *
 *   npm run yachts:fetch            syncs the fleet cache and reports
 *   npm run yachts:fetch -- 12683   …then fetches those yacht ids through
 *                                   the same pipeline the form uses, saving
 *                                   a passkey-redacted brochure sample and a
 *                                   per-yacht report section
 *
 * Writes data/yachtfolio/fetch-report.md (including a "Blob operations"
 * section) and data/yachtfolio/samples/. Requires YACHTFOLIO_PASSKEY (env or
 * .env.local). FLEET_REFRESH_DRY_RUN=true makes every comparison but writes
 * nothing to Blob. Never returns a non-zero exit code; failures land in the
 * report instead.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchBrochure, loadPasskey, redact } from "../src/server/yachtfolio/client.mjs";
import { checkBrochureShape } from "../src/server/yachtfolio/normalise.mjs";
import { getYachtDetail, getYachtImages, syncFleet } from "../src/server/fleet.mjs";
import { blobOps, getJson, isDryRun } from "../src/server/storage.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const YF_DIR = path.join(ROOT, "data", "yachtfolio");
const REPORT_PATH = path.join(YF_DIR, "fetch-report.md");
const SAMPLES_DIR = path.join(YF_DIR, "samples");

async function main() {
  const yfIds = process.argv
    .slice(2)
    .map((v) => Number.parseInt(v, 10))
    .filter((n) => Number.isInteger(n) && n > 0);

  const lines = ["# Yachtfolio fetch report", "", `Generated: ${new Date().toISOString()}`, ""];
  const passkey = await loadPasskey([ROOT, path.join(ROOT, "..")]);
  const totals = { yachtsChecked: 0, yachtsWritten: 0, yachtsSkipped: 0, imagesChecked: 0, imagesWritten: 0, imagesSkipped: 0, imagesRemoved: [], manifest: null, notes: [] };
  const absorb = (b) => {
    if (!b) return;
    for (const k of ["yachtsChecked", "yachtsWritten", "yachtsSkipped", "imagesChecked", "imagesWritten", "imagesSkipped"]) totals[k] += b[k] ?? 0;
    totals.imagesRemoved.push(...(b.imagesRemoved ?? []));
    totals.manifest ??= b.manifest;
    for (const n of b.notes ?? []) if (!totals.notes.includes(n)) totals.notes.push(n);
  };

  if (!passkey) {
    lines.push(
      "## Warnings",
      "",
      "- YACHTFOLIO_PASSKEY is not set — nothing was fetched. The portal serves the last cached fleet data; demo pages are unaffected."
    );
  } else {
    process.env.YACHTFOLIO_PASSKEY ??= passkey;
    try {
      const sync = await syncFleet();
      totals.manifest = sync.manifest;
      for (const n of sync.notes ?? []) totals.notes.push(n);
      lines.push("## Fleet sync", "", `- Yachts in the public list: ${sync.count}`);
      lines.push(`- Recorded removals (no longer listed): ${sync.removedCount}`);
      lines.push(`- Synced at: ${sync.syncedAt}`);
      lines.push(`- Fleet list: ${sync.fleetWritten ? "changed — written" : "unchanged — not written"}; reference data: ${sync.referenceWritten ? "changed — written" : "unchanged — not written"}`, "");
      const fleet = await getJson("yachtfolio/fleet.json");
      const removed = Object.entries(fleet?.removed ?? {});
      if (removed.length) {
        lines.push("### Yachts no longer listed", "");
        for (const [id, r] of removed) lines.push(`- ${r.name} (YF-${id}) — since ${r.removedAt}`);
        lines.push("");
      }
    } catch (err) {
      lines.push("## Warnings", "", `- Fleet sync failed: ${redact(String(err?.message ?? err), passkey)}`, "");
    }

    for (const [index, yfId] of yfIds.entries()) {
      lines.push(`## Yacht YF-${yfId}`, "");
      try {
        const detail = await getYachtDetail(yfId, { forceRefresh: true });
        absorb(detail.blob);
        const images = await getYachtImages(yfId);
        absorb(images.blob);
        if (index === 0) {
          const { raw } = await fetchBrochure(passkey, yfId);
          await mkdir(SAMPLES_DIR, { recursive: true });
          const samplePath = path.join(SAMPLES_DIR, `brochure-${yfId}.json`);
          await writeFile(samplePath, redact(raw, passkey), "utf8");
          lines.push(`- Redacted sample: ${path.relative(ROOT, samplePath)}`);
          const shapeNotes = checkBrochureShape(JSON.parse(redact(raw, passkey)));
          lines.push(
            `- Shape vs v1.2 documentation: ${shapeNotes.length ? shapeNotes.join("; ") : "no differences"}`
          );
        }
        lines.push(`- Name: ${detail.name || "?"}`);
        lines.push(`- Length: ${detail.lengthM != null ? `${detail.lengthM} metres` : "missing"}`);
        lines.push(`- Builder: ${detail.builder || "missing"}`);
        lines.push(`- Guests: ${detail.guests ?? "missing"}`);
        lines.push(`- Staterooms: ${detail.staterooms || "missing"}`);
        lines.push(`- Year / refit: ${detail.yearRefit || "missing"}`);
        lines.push(`- Operating areas (${detail.targetSeason}): ${detail.cruisingArea || "missing"}`);
        lines.push(
          `- Weekly rate (${detail.targetSeason}): ${
            detail.weeklyRate != null
              ? `${detail.currency} ${Math.round(detail.weeklyRate).toLocaleString("en-GB")}${detail.weeklyRateIsFrom ? " (from — season rate is a range)" : ""}`
              : "missing"
          }`
        );
        lines.push(`- Data source: ${detail.dataSource ?? "missing"}`);
        lines.push(`- Images prepared: ${images.gallery.length} (${images.blob?.imagesWritten ?? 0} newly written, ${images.blob?.imagesSkipped ?? 0} reused)`);
        lines.push(`- Missing fields: ${detail.missing.length ? detail.missing.join(", ") : "none"}`);
        for (const w of [...detail.warnings, ...images.warnings]) lines.push(`- Note: ${w}`);
      } catch (err) {
        lines.push(`- ERROR: ${redact(String(err?.message ?? err), passkey)}`);
      }
      lines.push("");
    }
  }

  // Blob operations — what this run cost in Vercel "advanced operations"
  // (put/copy/del/list; reads are free).
  const ops = blobOps();
  lines.push("## Blob operations", "");
  if (isDryRun()) lines.push("- DRY RUN (FLEET_REFRESH_DRY_RUN=true): comparisons made, nothing written.");
  lines.push(`- Manifest: ${totals.manifest ?? "not loaded"}`);
  lines.push(`- Yachts checked: ${totals.yachtsChecked}; written: ${totals.yachtsWritten}; skipped (unchanged): ${totals.yachtsSkipped}`);
  lines.push(`- Images checked: ${totals.imagesChecked}; written: ${totals.imagesWritten}; skipped (already stored): ${totals.imagesSkipped}`);
  lines.push(`- Images no longer in Yachtfolio (kept, not deleted): ${totals.imagesRemoved.length ? totals.imagesRemoved.join(", ") : "none"}`);
  lines.push(`- Advanced operations used: ${ops.advanced} (put ${ops.puts}, delete ${ops.dels}, list ${ops.lists})`);
  if (ops.dryRunWrites) lines.push(`- Writes suppressed by dry run: ${ops.dryRunWrites}`);
  for (const n of totals.notes) lines.push(`- ${n}`);
  lines.push("");

  await mkdir(SAMPLES_DIR, { recursive: true });
  await writeFile(REPORT_PATH, lines.join("\n") + "\n", "utf8");
  console.log(`[yachtfolio] report written to ${path.relative(ROOT, REPORT_PATH)}`);
  console.log("[yachtfolio] ----- BEGIN FETCH REPORT -----");
  console.log(lines.join("\n"));
  console.log("[yachtfolio] ----- END FETCH REPORT -----");
}

main().catch((err) => {
  console.warn(`[yachtfolio] WARNING: ${String(err?.message ?? err)}`);
  process.exitCode = 0;
});
