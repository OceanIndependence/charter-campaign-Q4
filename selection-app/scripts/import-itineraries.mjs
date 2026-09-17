#!/usr/bin/env node
/**
 * Refresh the website's itinerary pages in the snapshot — without the full
 * destinations crawl.
 *
 *   npm run import:itineraries
 *
 * Reads every itinerary URL the snapshot's destination pages link to
 * (`itineraryLinks`, gathered by the destinations import), fetches each page
 * once, parses it with the shared parser and writes the records back to
 * `data/destinations.json` under `itineraries`, verbatim. New pages need the
 * full `npm run import:destinations` first, which discovers the links.
 * Coordinates for the stops are a separate, reviewed step:
 * `node scripts/geocode-itinerary-stops.mjs`.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchHtml, parseItineraryPage, sleep } from "../src/server/atlas/website.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT = path.join(ROOT, "data", "destinations.json");

async function main() {
  const raw = await readFile(SNAPSHOT, "utf8");
  const snapshot = JSON.parse(raw);
  const urls = new Set(Object.keys(snapshot.itineraries ?? {}));
  for (const d of snapshot.destinations) for (const l of d.itineraryLinks ?? []) urls.add(l.url);
  const out = {};
  const errors = [];
  for (const url of [...urls].sort()) {
    try {
      const it = parseItineraryPage(url, await fetchHtml(url));
      out[url] = it;
      const ranges = it.stops.filter((s) => s.dayEnd).length;
      console.log(`  ✓ ${it.title}  ${it.days ?? "?"} days · ${it.stops.length} headings${ranges ? ` (${ranges} day ranges)` : ""}`);
    } catch (err) {
      errors.push(`${url}: ${err.message || err}`);
      console.log(`  ✗ ${url}: ${err.message || err}`);
      if (snapshot.itineraries?.[url]) out[url] = snapshot.itineraries[url];
    }
    await sleep(150);
  }
  snapshot.itineraries = out;
  snapshot.site = { ...(snapshot.site ?? {}), itineraries: Object.keys(out).length };
  await writeFile(SNAPSHOT, JSON.stringify(snapshot, null, 2) + (raw.endsWith("\n") ? "\n" : ""));
  console.log(`\n${Object.keys(out).length} itineraries written to data/destinations.json${errors.length ? `; ${errors.length} failed (previous record kept)` : ""}.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
