#!/usr/bin/env node
/**
 * Builder-field diagnostic — where `builder` sits in the Yachtfolio brochure
 * and what the in-use yachts return for it. Read-only against Yachtfolio;
 * writes nothing to Blob. Prints a Markdown fragment for
 * builder-field-report.md (repo root).
 *
 *   YACHTFOLIO_PASSKEY=… node scripts/builder-field-report.mjs
 *   YACHTFOLIO_PASSKEY=… node scripts/builder-field-report.mjs 12683 12901 …
 *
 * With no ids on the command line the in-use index (selections/in-use.json)
 * is read through the storage module, which needs PORTAL_DATA_READ_WRITE_TOKEN
 * (or BLOB_READ_WRITE_TOKEN). The passkey is redacted from every line.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchBrochure, loadPasskey, redact, REQUEST_DELAY_MS, sleep } from "../src/server/yachtfolio/client.mjs";
import { specBlocks } from "../src/server/yachtfolio/normalise.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Every key path in the brochure whose last segment mentions "builder", with its raw value. */
function builderPaths(value, prefix = "", out = [], seen = new Set()) {
  if (value == null || typeof value !== "object" || seen.has(value)) return out;
  seen.add(value);
  for (const [k, v] of Object.entries(value)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (/builder|shipyard|yard/i.test(k)) out.push([p, v]);
    if (v && typeof v === "object") builderPaths(v, p, out, seen);
  }
  return out;
}

/** Key paths that look like build country / hull / flag fields, for the "sits alongside" question. */
function adjacentPaths(value, prefix = "", out = [], seen = new Set()) {
  if (value == null || typeof value !== "object" || seen.has(value)) return out;
  seen.add(value);
  for (const [k, v] of Object.entries(value)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (/country|hull|material|flag|naval|designer|architect/i.test(k)) out.push([p, v]);
    if (v && typeof v === "object") adjacentPaths(v, p, out, seen);
  }
  return out;
}

const show = (v) => (v === undefined ? "∅ (absent)" : JSON.stringify(v));

async function main() {
  const passkey = await loadPasskey([ROOT, path.join(ROOT, "..")]);
  if (!passkey) {
    console.error("YACHTFOLIO_PASSKEY is not set — nothing can be fetched.");
    process.exit(2);
  }
  let ids = process.argv.slice(2).map((v) => Number.parseInt(v, 10)).filter((n) => Number.isInteger(n) && n > 0);
  let source = "command line";
  if (!ids.length) {
    const { inUseYachtIds } = await import("../src/server/in-use.mjs");
    ids = await inUseYachtIds();
    source = "selections/in-use.json";
  }

  const rows = [];
  const pathCounts = new Map();
  const adjacent = new Map();
  for (const [i, id] of ids.entries()) {
    if (i) await sleep(REQUEST_DELAY_MS);
    try {
      const { json: brochure } = await fetchBrochure(passkey, id);
      const { ds, detail, spec } = specBlocks(brochure);
      const paths = builderPaths(brochure);
      for (const [p, v] of paths) {
        const c = pathCounts.get(p) ?? { present: 0, nonEmpty: 0 };
        c.present += 1;
        if (String(v ?? "").trim()) c.nonEmpty += 1;
        pathCounts.set(p, c);
      }
      for (const [p, v] of adjacentPaths(brochure)) {
        const c = adjacent.get(p) ?? { present: 0, nonEmpty: 0, sample: undefined };
        c.present += 1;
        if (String(v ?? "").trim()) {
          c.nonEmpty += 1;
          c.sample ??= v;
        }
        adjacent.set(p, c);
      }
      rows.push({
        id,
        ds: ds ?? "∅",
        spec: spec.builder,
        detail: detail.builder,
        general: brochure?.general?.builder,
        // What normalise.mjs produces today: `spec.builder ?? detail.builder`
        // — a blank string in specifications counts as present and masks
        // the detail block's value.
        current: String(spec.builder ?? detail.builder ?? "").trim(),
        // What a first-non-empty rule would produce.
        best: [spec.builder, detail.builder, brochure?.general?.builder].map((v) => String(v ?? "").trim()).find(Boolean) ?? "",
      });
    } catch (err) {
      rows.push({ id, error: redact(String(err?.message ?? err), passkey) });
    }
  }

  const ok = rows.filter((r) => !r.error);
  const byDs = new Map();
  for (const r of ok) {
    const c = byDs.get(r.ds) ?? { yachts: 0, current: 0, best: 0, specOnly: 0, detailOnly: 0, both: 0, masked: 0, disagree: 0 };
    c.yachts += 1;
    if (r.current) c.current += 1;
    if (r.best) c.best += 1;
    const s = String(r.spec ?? "").trim(), d = String(r.detail ?? "").trim();
    if (s && d) c.both += 1;
    else if (s) c.specOnly += 1;
    else if (d) c.detailOnly += 1;
    if (r.spec !== undefined && r.spec !== null && !s && d) c.masked += 1;
    if (s && d && s !== d) c.disagree += 1;
    byDs.set(r.ds, c);
  }
  const currentCount = ok.filter((r) => r.current).length;
  const bestCount = ok.filter((r) => r.best).length;

  const out = [];
  out.push(`Generated ${new Date().toISOString()} — ${ids.length} yacht id(s) from ${source}; ${ok.length} brochure(s) read, ${rows.length - ok.length} failed.`, "");
  out.push("### Where `builder` appears (key paths across every brochure read)", "", "| Path | Present in | Non-empty in |", "|---|---|---|");
  for (const [p, c] of [...pathCounts.entries()].sort()) out.push(`| \`${p}\` | ${c.present} | ${c.nonEmpty} |`);
  out.push(
    "", "### By `general.data_source`", "",
    "Current = what normalise.mjs returns today (`specifications.builder ?? <detail>.builder`). Any block = first non-empty of specifications, detail block, general. Masked = specifications.builder present but blank while the detail block has a value (the current rule returns nothing). Disagree = both non-empty and different.", "",
    "| data_source | Yachts | Non-empty (current) | Non-empty (any block) | specifications only | detail block only | Both | Masked | Disagree |",
    "|---|---|---|---|---|---|---|---|---|"
  );
  for (const [ds, c] of byDs) out.push(`| ${ds} | ${c.yachts} | ${c.current} | ${c.best} | ${c.specOnly} | ${c.detailOnly} | ${c.both} | ${c.masked} | ${c.disagree} |`);
  out.push("", `### Non-empty builder: ${currentCount} of ${ok.length} yacht(s) read with the current rule; ${bestCount} of ${ok.length} taking the first non-empty block`, "");
  out.push("### Raw values (every yacht, unmodified — quotes show whitespace)", "", "| YF id | data_source | specifications.builder | detail block builder | general.builder |", "|---|---|---|---|---|");
  for (const r of rows) {
    if (r.error) out.push(`| ${r.id} | error | ${r.error} | | |`);
    else out.push(`| ${r.id} | ${r.ds} | ${show(r.spec)} | ${show(r.detail)} | ${show(r.general)} |`);
  }
  out.push("", "### Fields sitting alongside it (country / hull / material / flag / designer keys)", "");
  if (!adjacent.size) out.push("None found in any brochure read.");
  else {
    out.push("| Path | Present in | Non-empty in | Sample |", "|---|---|---|---|");
    for (const [p, c] of [...adjacent.entries()].sort()) out.push(`| \`${p}\` | ${c.present} | ${c.nonEmpty} | ${c.sample === undefined ? "" : show(c.sample)} |`);
  }
  console.log(redact(out.join("\n"), passkey));
}

main().catch((err) => {
  console.error(String(err?.stack ?? err));
  process.exit(1);
});
