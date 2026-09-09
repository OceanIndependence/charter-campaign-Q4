#!/usr/bin/env node
/**
 * Itinerary build — validates the repo-held itinerary files and aggregates
 * them for the 2027 Atlas page.
 *
 *   npm run build:itineraries        (also runs as `prebuild`)
 *
 * Source of truth: content/itineraries/<destination id with / → -->.json, one
 * per destination:
 *   { "destinationId": "mediterranean/italy/amalfi-coast",
 *     "status": "placeholder" | "approved",
 *     "itineraries": [ { id, nights, title, intro, days: [ { day, place, lat, lng, note } ] } ] }
 *
 * Output:
 *   data/itineraries.json   — what the page loads (status stripped: it is
 *                             internal and never reaches the client)
 *   ../design/itinerary-coverage.md — editorial review table, every
 *                             destination, every stop
 *
 * Coordinates live in the files; nothing is geocoded here or at runtime.
 * Validation problems fail the build; plausibility warnings (long daily legs,
 * missing files) are printed and listed in the coverage document.
 */

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = path.join(ROOT, "content", "itineraries");
const OUT_PATH = path.join(ROOT, "data", "itineraries.json");
const COVERAGE_PATH = path.join(ROOT, "..", "design", "itinerary-coverage.md");
const SNAPSHOT_PATH = path.join(ROOT, "data", "destinations.json");

/** A daily leg longer than this is flagged for editorial review (nautical miles). */
const LONG_LEG_NM = 120;

const nm = (a, b) => {
  const d2r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * d2r;
  const dLng = (b.lng - a.lng) * d2r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * d2r) * Math.cos(b.lat * d2r) * Math.sin(dLng / 2) ** 2;
  return (2 * 3440.1 * Math.asin(Math.sqrt(s)));
};

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const words = (n) => (n < 10 ? NUMBER_WORDS[n] : String(n));

function fail(problems) {
  console.error(`\n${problems.length} itinerary problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exitCode = 1;
}

async function main() {
  const snapshot = JSON.parse(await readFile(SNAPSHOT_PATH, "utf8"));
  const byId = new Map(snapshot.destinations.map((d) => [d.id, d]));

  let files = [];
  try {
    files = (await readdir(SRC_DIR)).filter((f) => f.endsWith(".json")).sort();
  } catch {
    files = [];
  }

  const problems = [];
  const warnings = [];
  const seenIds = new Set();
  const destinations = {};
  const statusById = {};

  for (const file of files) {
    let doc;
    try {
      doc = JSON.parse(await readFile(path.join(SRC_DIR, file), "utf8"));
    } catch (err) {
      problems.push(`${file}: not valid JSON (${err.message})`);
      continue;
    }
    const expectedId = file.replace(/\.json$/, "").replace(/--/g, "/");
    if (doc.destinationId !== expectedId) problems.push(`${file}: destinationId "${doc.destinationId}" does not match the filename (${expectedId})`);
    if (!byId.has(doc.destinationId)) problems.push(`${file}: "${doc.destinationId}" is not a destination in data/destinations.json`);
    if (!["placeholder", "approved"].includes(doc.status)) problems.push(`${file}: status must be "placeholder" or "approved"`);
    if (!Array.isArray(doc.itineraries)) {
      problems.push(`${file}: itineraries must be an array`);
      continue;
    }
    statusById[doc.destinationId] = doc.status;
    const clean = [];
    for (const it of doc.itineraries) {
      const where = `${file} › ${it?.id ?? "?"}`;
      if (!it.id || typeof it.id !== "string") problems.push(`${where}: missing id`);
      else if (seenIds.has(it.id)) problems.push(`${where}: duplicate itinerary id`);
      else seenIds.add(it.id);
      if (!Number.isInteger(it.nights) || it.nights < 1) problems.push(`${where}: nights must be a positive integer`);
      if (!it.title) problems.push(`${where}: missing title`);
      if (!Array.isArray(it.days) || !it.days.length) {
        problems.push(`${where}: days must be a non-empty array`);
        continue;
      }
      it.days.forEach((d, i) => {
        if (d.day !== i + 1) problems.push(`${where}: day ${i + 1} is numbered ${d.day}`);
        if (!d.place) problems.push(`${where}: day ${i + 1} has no place`);
        if (typeof d.lat !== "number" || typeof d.lng !== "number" || Math.abs(d.lat) > 90 || Math.abs(d.lng) > 180) {
          problems.push(`${where}: day ${i + 1} (${d.place}) has invalid coordinates`);
        }
      });
      for (let i = 1; i < it.days.length; i++) {
        const leg = nm(it.days[i - 1], it.days[i]);
        if (leg > LONG_LEG_NM) warnings.push(`${doc.destinationId} › ${it.id}: day ${i + 1} ${it.days[i - 1].place} → ${it.days[i].place} is ${Math.round(leg)} nm`);
      }
      // The client never sees `status`; it is a per-file editorial flag.
      clean.push({
        id: it.id,
        nights: it.nights,
        title: it.title,
        intro: it.intro ?? "",
        days: it.days.map((d) => ({ day: d.day, place: d.place, lat: d.lat, lng: d.lng, note: d.note ?? "" })),
      });
    }
    destinations[doc.destinationId] = clean;
  }

  for (const d of snapshot.destinations) {
    if (!(d.id in destinations)) warnings.push(`${d.id}: no itinerary file (the panel hides the itinerary block)`);
  }

  if (problems.length) {
    fail(problems);
    return;
  }

  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  const out = { generatedAt: new Date().toISOString(), destinations };
  await writeFile(OUT_PATH, JSON.stringify(out) + "\n");

  // ---- coverage document --------------------------------------------------
  const lines = [];
  lines.push("# Itinerary coverage");
  lines.push("");
  lines.push(`Generated by \`npm run build:itineraries\` from \`selection-app/content/itineraries/\` on ${fmtDate(new Date())}.`);
  lines.push("Edit the JSON files, not this document; it is rewritten on every build. A file's `status` is internal and never rendered.");
  lines.push("");
  const total = snapshot.destinations.length;
  const withAny = Object.values(destinations).filter((l) => l.length).length;
  const withBoth = Object.values(destinations).filter((l) => l.some((i) => i.nights === 5) && l.some((i) => i.nights === 7)).length;
  const approved = Object.values(statusById).filter((s) => s === "approved").length;
  lines.push("| Destinations | With itineraries | With both five- and seven-day | Approved files | Placeholder files |");
  lines.push("|---|---|---|---|---|");
  lines.push(`| ${total} | ${withAny} | ${withBoth} | ${approved} | ${Object.keys(statusById).length - approved} |`);
  lines.push("");
  lines.push("## Summary by destination");
  lines.push("");
  lines.push("| Destination id | Name | Five-day | Seven-day | Status |");
  lines.push("|---|---|---|---|---|");
  const ordered = [...snapshot.destinations].sort((a, b) => a.id.localeCompare(b.id));
  for (const d of ordered) {
    const list = destinations[d.id] ?? [];
    const has = (n) => (list.some((i) => i.nights === n) ? "yes" : "—");
    lines.push(`| \`${d.id}\` | ${d.name || d.slug} | ${has(5)} | ${has(7)} | ${statusById[d.id] ?? "no file"} |`);
  }
  lines.push("");
  lines.push("## Day-by-day stops");
  lines.push("");
  for (const d of ordered) {
    const list = destinations[d.id] ?? [];
    if (!list.length) continue;
    lines.push(`### ${d.name || d.slug} — \`${d.id}\` (${statusById[d.id]})`);
    lines.push("");
    for (const it of list) {
      lines.push(`**${it.title}** — ${words(it.nights)} nights, id \`${it.id}\``);
      if (it.intro) lines.push(`_${it.intro}_`);
      lines.push("");
      lines.push("| Day | Place | Lat | Lng | Leg (nm) | Note |");
      lines.push("|---|---|---|---|---|---|");
      it.days.forEach((day, i) => {
        const leg = i === 0 ? "" : String(Math.round(nm(it.days[i - 1], day)));
        lines.push(`| ${day.day} | ${day.place} | ${day.lat} | ${day.lng} | ${leg} | ${day.note.replace(/\|/g, "／")} |`);
      });
      lines.push("");
    }
  }
  if (warnings.length) {
    lines.push("## Review warnings");
    lines.push("");
    for (const w of warnings) lines.push(`- ${w}`);
    lines.push("");
  }
  await mkdir(path.dirname(COVERAGE_PATH), { recursive: true });
  await writeFile(COVERAGE_PATH, lines.join("\n"));

  console.log(`Itineraries: ${files.length} files, ${withAny} destinations with routes (${withBoth} with both lengths), ${seenIds.size} itineraries.`);
  console.log(`Wrote ${path.relative(ROOT, OUT_PATH)} and ${path.relative(ROOT, COVERAGE_PATH)}.`);
  if (warnings.length) {
    console.log(`${warnings.length} warning(s) for editorial review (listed in the coverage document):`);
    for (const w of warnings.slice(0, 15)) console.log(`  - ${w}`);
    if (warnings.length > 15) console.log(`  … ${warnings.length - 15} more`);
  }
}

function fmtDate(d) {
  return `${String(d.getDate()).padStart(2, "0")} ${d.toLocaleDateString("en-GB", { month: "long" })} ${d.getFullYear()}`;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
