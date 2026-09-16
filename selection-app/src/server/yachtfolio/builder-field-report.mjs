/**
 * TEMPORARY — Phase 0 diagnostic for the BUILDER field. Delete with
 * src/app/api/admin/builder-field-report/route.ts once the report is in
 * builder-field-report.md.
 *
 * Where `builder` sits in the Yachtfolio brochure and what each in-use yacht
 * returns for it. Read-only: one brochure call per yacht, sequential, with
 * the client's usual delay, through the same memo the image pipeline uses
 * (a repeat within five minutes on the same instance costs no calls).
 * Nothing is written to Blob. The passkey is redacted from the output.
 */

import { REQUEST_DELAY_MS, redact, sleep, yachtfolioOps } from "./client.mjs";
import { brochureFor } from "./gallery.mjs";
import { specBlocks } from "./normalise.mjs";

/** Every key path whose last segment names a builder or yard, with its raw value. */
export function builderPaths(value, prefix = "", out = [], seen = new Set()) {
  if (value == null || typeof value !== "object" || seen.has(value)) return out;
  seen.add(value);
  for (const [k, v] of Object.entries(value)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (/builder|shipyard|yard/i.test(k)) out.push([p, v]);
    if (v && typeof v === "object") builderPaths(v, p, out, seen);
  }
  return out;
}

/** Key paths that look like build country, hull, flag or designer fields. */
export function adjacentPaths(value, prefix = "", out = [], seen = new Set()) {
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
const clean = (v) => String(v ?? "").trim();

/** One yacht's builder facts from its brochure (pure). */
export function inspectBrochure(id, brochure) {
  const { ds, detail, spec } = specBlocks(brochure);
  return {
    id,
    ds: ds ?? "∅",
    spec: spec.builder,
    detail: detail.builder,
    general: brochure?.general?.builder,
    // What normalise.mjs returns today: specifications first, `??` fallback.
    current: clean(spec.builder ?? detail.builder),
    builderPaths: builderPaths(brochure),
    adjacentPaths: adjacentPaths(brochure),
  };
}

/** The Markdown report for a set of inspected rows (pure). */
export function renderReport(rows, { source, calls }) {
  const ok = rows.filter((r) => !r.error);
  const pathCounts = new Map();
  const adjacent = new Map();
  const byDs = new Map();
  for (const r of ok) {
    for (const [p, v] of r.builderPaths) {
      const c = pathCounts.get(p) ?? { present: 0, nonEmpty: 0 };
      c.present += 1;
      if (clean(v)) c.nonEmpty += 1;
      pathCounts.set(p, c);
    }
    for (const [p, v] of r.adjacentPaths) {
      const c = adjacent.get(p) ?? { present: 0, nonEmpty: 0, sample: undefined };
      c.present += 1;
      if (clean(v)) {
        c.nonEmpty += 1;
        c.sample ??= v;
      }
      adjacent.set(p, c);
    }
    const c = byDs.get(r.ds) ?? { yachts: 0, current: 0, specOnly: 0, detailOnly: 0, both: 0, neither: 0, masked: 0, disagree: 0 };
    c.yachts += 1;
    if (r.current) c.current += 1;
    const s = clean(r.spec);
    const d = clean(r.detail);
    if (s && d) c.both += 1;
    else if (s) c.specOnly += 1;
    else if (d) c.detailOnly += 1;
    else c.neither += 1;
    if (r.spec != null && !s && d) c.masked += 1;
    if (s && d && s !== d) c.disagree += 1;
    byDs.set(r.ds, c);
  }
  const currentCount = ok.filter((r) => r.current).length;
  const anyCount = ok.filter((r) => clean(r.spec) || clean(r.detail) || clean(r.general)).length;

  const out = [];
  out.push(`Generated ${new Date().toISOString()} — ${rows.length} yacht id(s) from ${source}; ${ok.length} brochure(s) read, ${rows.length - ok.length} failed; Yachtfolio calls this request: ${calls}.`, "");
  out.push("### Where `builder` appears (key paths across every brochure read)", "", "| Path | Present in | Non-empty in |", "|---|---|---|");
  for (const [p, c] of [...pathCounts.entries()].sort()) out.push(`| \`${p}\` | ${c.present} | ${c.nonEmpty} |`);
  out.push(
    "", "### By `general.data_source`", "",
    "Current = what normalise.mjs returns today (`specifications.builder`, else the detail block). Masked = `specifications.builder` present but blank while the detail block has a value. Disagree = both non-empty and different.", "",
    "| data_source | Yachts | Non-empty (current rule) | specifications only | detail block only | Both | Neither | Masked | Disagree |",
    "|---|---|---|---|---|---|---|---|---|"
  );
  for (const [ds, c] of byDs) out.push(`| ${ds} | ${c.yachts} | ${c.current} | ${c.specOnly} | ${c.detailOnly} | ${c.both} | ${c.neither} | ${c.masked} | ${c.disagree} |`);
  out.push("", `### Non-empty builder: ${currentCount} of ${ok.length} yacht(s) read with the current rule; ${anyCount} of ${ok.length} have a value in some block`, "");
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
  return out.join("\n");
}

/**
 * Fetch each yacht's brochure in turn and render the report. `ids` come from
 * the caller (the in-use index, or a query list); nothing here writes.
 */
export async function runBuilderFieldReport({ passkey, ids, source }) {
  const before = yachtfolioOps().total;
  const rows = [];
  for (const [i, id] of ids.entries()) {
    if (i) await sleep(REQUEST_DELAY_MS);
    try {
      rows.push(inspectBrochure(id, await brochureFor(passkey, id)));
    } catch (err) {
      rows.push({ id, error: redact(String(err?.message ?? err), passkey) });
      // A spent rate-limit back-off ends the run rather than pushing on.
      if (err?.code === "RATE_LIMIT") {
        for (const rest of ids.slice(i + 1)) rows.push({ id: rest, error: "not attempted — rate-limited" });
        break;
      }
    }
  }
  const calls = yachtfolioOps().total - before;
  return redact(renderReport(rows, { source, calls }), passkey);
}
