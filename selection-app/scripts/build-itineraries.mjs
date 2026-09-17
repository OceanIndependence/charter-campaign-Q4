#!/usr/bin/env node
/**
 * Itinerary build — joins the website's itineraries to their stop coordinates
 * and aggregates them per destination for the client pages.
 *
 *   npm run build:itineraries        (also runs as `prebuild`)
 *
 * Sources:
 *   data/destinations.json              the website itinerary pages, verbatim
 *                                       (`itineraries`, keyed by URL) — `npm run import:itineraries`
 *   content/itinerary-destinations.json  the hand-authored manifest: which
 *                                       destinations each itinerary may appear on
 *   content/itinerary-stops.json        the located places of each day heading —
 *                                       `npm run geocode:itineraries`, reviewed by hand
 *
 * Output:
 *   data/itineraries.json            destination id → Itinerary[] (src/lib/atlas/itineraries.ts)
 *   docs/itinerary-coverage.md       what each destination draws, every stop and
 *                                    its coordinates, and the gaps
 *
 * WHICH ITINERARIES A DESTINATION SHOWS IS THE MANIFEST'S DECISION ALONE. An
 * itinerary appears on a destination if and only if that destination id is
 * listed against it in content/itinerary-destinations.json. There is no
 * ancestor walking, no inheritance to or from children, no radius test and no
 * fallback for a destination with none: that destination shows no itinerary
 * panel. The manifest's `_displayOrder` sets the order and
 * `_maxPerDestination` the number shown. `itineraryLinks` in the snapshot is
 * still written by the crawl and is deliberately not read here.
 *
 * The coordinates are a separate matter and unchanged: a day heading whose
 * places could not be located keeps its row and its narrative but draws no
 * pin, and an itinerary with fewer than two located places cannot be drawn at
 * all, so the manifest's mappings for it are reported as gaps. Manifest and
 * validation problems fail the build.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT_PATH = path.join(ROOT, "data", "destinations.json");
const STOPS_PATH = path.join(ROOT, "content", "itinerary-stops.json");
const OUT_PATH = path.join(ROOT, "data", "itineraries.json");
const COVERAGE_PATH = path.join(ROOT, "docs", "itinerary-coverage.md");
const MANIFEST_PATH = path.join(ROOT, "content", "itinerary-destinations.json");
/**
 * A yacht does not sail this far between two places on one route stage, so a
 * point this far from the rest of the route is a wrong geocode, not a leg:
 * it is dropped from the drawing and listed for review. Generous enough for
 * the ocean crossings the polar and Pacific routes really do make.
 */
const MAX_LEG_KM = 900;
/** A leg longer than this still draws, but is worth a look. */
const LONG_LEG_KM = 400;

/** The median of a list of numbers. */
const median = (xs) => {
  const v = [...xs].sort((a, b) => a - b);
  return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
};

const d2r = Math.PI / 180;
const km = (a, b) => {
  const dLat = (b.lat - a.lat) * d2r;
  const dLon = (b.lon - a.lon) * d2r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * d2r) * Math.cos(b.lat * d2r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

const slugOf = (url) => url.replace(/\/$/, "").split("/").pop();

function fail(problems) {
  console.error(`\n${problems.length} itinerary problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exitCode = 1;
}

async function main() {
  const snapshot = JSON.parse(await readFile(SNAPSHOT_PATH, "utf8"));
  const web = snapshot.itineraries ?? {};
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  let stopsFile = { itineraries: {} };
  try {
    stopsFile = JSON.parse(await readFile(STOPS_PATH, "utf8"));
  } catch {
    console.warn("content/itinerary-stops.json is missing — run `npm run geocode:itineraries`; no itinerary can be drawn without it.");
  }
  const located = stopsFile.itineraries ?? {};
  const byId = new Map(snapshot.destinations.map((d) => [d.id, d]));

  const problems = [];
  const gaps = [];
  /** URL → Itinerary, or null when it cannot be drawn */
  const built = {};
  for (const [url, it] of Object.entries(web)) {
    const id = slugOf(url);
    if (!it.title) problems.push(`${url}: no title`);
    const loc = located[url]?.days ?? {};
    const stops = [];
    const unlocated = [];
    for (const s of it.stops) {
      const day = loc[s.day];
      // "nominatim-far" is a guess the geocoder could not place near the
      // itinerary's own map pins; it is left for review rather than drawn.
      const points = (day?.places ?? [])
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && p.source !== "nominatim-far")
        .map((p) => ({ name: p.name, lat: p.lat, lon: p.lon }));
      for (const p of points) {
        if (Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) problems.push(`${id} › day ${s.day} › ${p.name}: invalid coordinates`);
      }
      // A day whose places could not be located keeps its row — the client
      // still reads the website's narrative for it — but draws no pin, and the
      // route runs from the previous located day to the next.
      if (!points.length) unlocated.push(`day ${s.day} "${s.place}"`);
      stops.push({ day: s.day, ...(s.dayEnd ? { dayEnd: s.dayEnd } : {}), heading: s.place, text: s.text, points });
    }
    // Drop the outliers before anything is drawn: a point far from the route's
    // own centre (the median of its located places) is a wrong geocode —
    // "Maratea" in Sicily rather than Basilicata, say. The median is used
    // because it is unmoved by the very outliers being looked for.
    const flatAll = stops.flatMap((x) => x.points);
    if (flatAll.length >= 3) {
      const mid = { lat: median(flatAll.map((p) => p.lat)), lon: median(flatAll.map((p) => p.lon)) };
      const spread = median(flatAll.map((p) => km(p, mid)));
      const limit = Math.max(MAX_LEG_KM, spread * 4);
      for (const stop of stops) {
        const keep = stop.points.filter((p) => km(p, mid) <= limit);
        for (const p of stop.points) {
          if (!keep.includes(p)) gaps.push(`${it.title} (${id}): day ${stop.day} "${p.name}" is ${Math.round(km(p, mid))} km from the route — not drawn, check its coordinates`);
        }
        stop.points = keep;
        if (!keep.length && !unlocated.some((u) => u.startsWith(`day ${stop.day} `))) unlocated.push(`day ${stop.day} "${stop.heading}"`);
      }
    }
    const locatedCount = stops.reduce((n, x) => n + x.points.length, 0);
    if (locatedCount < 2) {
      gaps.push(`${it.title} (${id}): only ${locatedCount} located place — nothing to draw`);
      built[url] = null;
      continue;
    }
    if (unlocated.length) gaps.push(`${it.title} (${id}): drawn without ${unlocated.length} day(s) — ${unlocated.join(", ")}`);
    // A leg far longer than the rest usually means a place landed in the wrong
    // country; the route still draws, but it is worth a look.
    const flat = stops.flatMap((x) => x.points);
    for (let i = 1; i < flat.length; i++) {
      const leg = km(flat[i - 1], flat[i]);
      if (leg > LONG_LEG_KM) gaps.push(`${it.title} (${id}): ${flat[i - 1].name} → ${flat[i].name} is ${Math.round(leg)} km — check the coordinates`);
    }
    built[url] = {
      id,
      url,
      title: it.title,
      days: it.days ?? stops[stops.length - 1].dayEnd ?? stops[stops.length - 1].day,
      intro: it.intro ?? [],
      heroImage: it.heroImage ?? null,
      stops,
    };
  }

  // ---- the manifest ------------------------------------------------------
  const maxPerDestination = manifest._maxPerDestination;
  const displayOrder = manifest._displayOrder ?? [];
  const entries = manifest.itineraries ?? [];
  const manifestIds = entries.map((e) => e.id);
  const crawledById = new Map(Object.values(built).filter(Boolean).map((it) => [it.id, it]));
  // Every crawled itinerary, drawable or not, so an undrawable one is still a
  // known id rather than a manifest error.
  const crawledAllIds = new Set(Object.keys(web).map(slugOf));

  for (const e of entries) {
    if (!crawledAllIds.has(e.id)) problems.push(`manifest: itinerary "${e.id}" has no crawled record in data/destinations.json`);
    for (const destId of e.destinations ?? []) {
      if (!byId.has(destId)) problems.push(`manifest: itinerary "${e.id}" lists destination "${destId}", which has no record in data/destinations.json`);
    }
  }
  for (const id of crawledAllIds) {
    if (!manifestIds.includes(id)) problems.push(`manifest: crawled itinerary "${id}" is absent from the manifest`);
  }
  const orderSeen = new Set();
  for (const id of displayOrder) {
    if (orderSeen.has(id)) problems.push(`manifest: _displayOrder lists "${id}" more than once`);
    orderSeen.add(id);
    if (!manifestIds.includes(id)) problems.push(`manifest: _displayOrder lists "${id}", which is not in the manifest`);
  }
  for (const id of manifestIds) {
    if (!orderSeen.has(id)) problems.push(`manifest: itinerary "${id}" is absent from _displayOrder`);
  }
  if (!Number.isInteger(maxPerDestination) || maxPerDestination < 1) problems.push(`manifest: _maxPerDestination must be a positive integer (got ${JSON.stringify(maxPerDestination)})`);
  if (problems.length) {
    fail(problems);
    return;
  }

  // ---- the mapping: the manifest, and nothing else ------------------------
  const rank = new Map(displayOrder.map((id, i) => [id, i]));
  const listed = {};                       // destination id → manifest itinerary ids
  for (const e of entries) for (const destId of e.destinations ?? []) (listed[destId] ??= []).push(e.id);

  const destinations = {};
  const undrawable = {};                   // destination id → ids the manifest lists that cannot be drawn
  for (const d of snapshot.destinations) {
    const ids = (listed[d.id] ?? []).slice().sort((a, b) => rank.get(a) - rank.get(b));
    const list = [];
    for (const id of ids) {
      const it = crawledById.get(id);
      if (!it) {
        (undrawable[d.id] ??= []).push(id);
        continue;
      }
      if (list.length >= maxPerDestination) continue;
      list.push(it);
    }
    destinations[d.id] = list;
  }
  for (const [destId, ids] of Object.entries(undrawable)) {
    gaps.push(`${destId}: the manifest lists ${ids.map((i) => `"${i}"`).join(", ")}, which cannot be drawn (fewer than two located places)`);
  }

  if (problems.length) {
    fail(problems);
    return;
  }

  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), destinations }) + "\n");

  // ---- coverage document --------------------------------------------------
  const drawable = Object.values(built).filter(Boolean);
  const withAny = Object.values(destinations).filter((l) => l.length).length;
  const lines = [];
  lines.push("# Itinerary coverage");
  lines.push("");
  lines.push(`Generated by \`npm run build:itineraries\` on ${fmtDate(new Date())} from the website's itinerary pages in \`data/destinations.json\` the manifest in \`content/itinerary-destinations.json\` and the located stops in \`content/itinerary-stops.json\`.`);
  lines.push("Edit the sources, not this document; it is rewritten on every build.");
  lines.push("");
  lines.push("| Website itineraries | Drawable | Destinations | With itineraries |");
  lines.push("|---|---|---|---|");
  lines.push(`| ${Object.keys(web).length} | ${drawable.length} | ${snapshot.destinations.length} | ${withAny} |`);
  lines.push("");
  if (gaps.length) {
    lines.push("## Gaps");
    lines.push("");
    for (const g of gaps) lines.push(`- ${g}`);
    lines.push("");
  }
  lines.push("## By destination");
  lines.push("");
  lines.push("| Destination id | Name | Itineraries |");
  lines.push("|---|---|---|");
  const ordered = [...snapshot.destinations].sort((a, b) => a.id.localeCompare(b.id));
  for (const d of ordered) {
    const list = destinations[d.id] ?? [];
    lines.push(`| \`${d.id}\` | ${d.name || d.slug} | ${list.length ? list.map((i) => i.title).join(" · ") : "—"} |`);
  }
  lines.push("");
  lines.push("## Day by day");
  lines.push("");
  for (const it of drawable.sort((a, b) => a.title.localeCompare(b.title))) {
    lines.push(`### ${it.title} — \`${it.id}\` · ${it.days} days · [page](${it.url})`);
    lines.push("");
    lines.push("| Day | Heading as written | Located places |");
    lines.push("|---|---|---|");
    for (const s of it.stops) lines.push(`| ${s.dayEnd ? `${s.day}–${s.dayEnd}` : s.day} | ${s.heading.replace(/\|/g, "／")} | ${s.points.map((p) => `${p.name} (${p.lat}, ${p.lon})`).join("; ")} |`);
    lines.push("");
  }
  await mkdir(path.dirname(COVERAGE_PATH), { recursive: true });
  await writeFile(COVERAGE_PATH, lines.join("\n"));

  console.log(`Itineraries: ${Object.keys(web).length} website pages, ${drawable.length} drawable, ${withAny} of ${snapshot.destinations.length} destinations with routes.`);
  console.log(`Wrote ${path.relative(ROOT, OUT_PATH)} and ${path.relative(ROOT, COVERAGE_PATH)}.`);
  if (gaps.length) {
    console.log(`${gaps.length} gap(s) for review (listed in the coverage document):`);
    for (const g of gaps) console.log(`  - ${g}`);
  }
}

function fmtDate(d) {
  return `${String(d.getDate()).padStart(2, "0")} ${d.toLocaleDateString("en-GB", { month: "long" })} ${d.getFullYear()}`;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
