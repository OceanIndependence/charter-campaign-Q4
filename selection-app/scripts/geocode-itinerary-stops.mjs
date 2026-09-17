#!/usr/bin/env node
/**
 * Locate the places on the website's itineraries — a one-off, reviewed step.
 *
 *   node scripts/geocode-itinerary-stops.mjs            update content/itinerary-stops.json
 *   node scripts/geocode-itinerary-stops.mjs --refresh  re-locate everything
 *
 * The website's DAY TO DAY headings are legs ("Calvi To Girolata",
 * "Bonifacio - Maddalena Islands", "Return To Sopers Hole Marina, Tortola"),
 * and its map carries only the start and end pins. This script splits each
 * heading into its places and locates each one: first from what the repo
 * already knows (the itinerary's own map pins, the Atlas destinations), then
 * from Nominatim (OpenStreetMap), queried with the itinerary's region as
 * context. A route is sequential, so among the candidates the one nearest the
 * previous located place wins (this is what tells Maratea in Basilicata, an
 * afternoon from Capri, from the Maratea in Sicily); the winner is then
 * checked for plausibility against the itinerary's own map pins. Results are
 * written to content/itinerary-stops.json with their source and any flag, and
 * docs/itinerary-stops-review.md lists every place for editorial review.
 * Nothing is geocoded at build or run time: the build joins this file to the
 * snapshot's verbatim itineraries.
 *
 * Existing entries are kept unless --refresh is given, so a coordinate
 * corrected by hand in the JSON survives a re-run.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT = path.join(ROOT, "data", "destinations.json");
const OUT = path.join(ROOT, "content", "itinerary-stops.json");
const REVIEW = path.join(ROOT, "docs", "itinerary-stops-review.md");
const REFRESH = process.argv.includes("--refresh");
const USER_AGENT = "OceanIndependenceAtlas/1.0 (marketing@ocyachts.com)";
const NOMINATIM_GAP_MS = 1100;

const d2r = Math.PI / 180;
const km = (a, b) => {
  const dLat = (b.lat - a.lat) * d2r;
  const dLon = (b.lon - a.lon) * d2r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * d2r) * Math.cos(b.lat * d2r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(s));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const NUMBER_WORDS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen"];

/** Case- and accent-insensitive key for matching place names. */
export function placeKey(name) {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/^the\s+/, "")
    .replace(/\bsaint\b|\bst\.\s*/g, "st ")
    .replace(/[-–]/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * "Six Northern Fjords & Ice Edge - East Coast" → ["Northern Fjords", "Ice Edge", "East Coast"]
 * "Return To Sopers Hole Marina, Tortola"        → ["Sopers Hole Marina, Tortola"]
 * "Reef Bay To Honeymoon Beach And Disembark At Charlotte Amalie" → ["Reef Bay", "Honeymoon Beach", "Charlotte Amalie"]
 * A trailing ", Tortola" or ", Mallorca" is kept on its place as context for the lookup.
 */
export function legPlaces(heading) {
  let h = heading.replace(/\s+/g, " ").trim();
  h = h.replace(/^(day\s+)?(\d+|[a-z]+)\s+(?=[A-Z])/i, (m, _d, w) => (NUMBER_WORDS.includes(w.toLowerCase()) || /^\d+$/.test(w) ? "" : m));
  h = h.replace(/\((via|through|by)[^)]*\)/gi, " ");
  h = h.replace(/\b(return to|disembark at|disembark in|embark at|embark in|arrive at|arrive in)\b/gi, " to ");
  const parts = h
    .split(/\s+-\s+|\s+–\s+|\s+to\s+|\s+&\s+|\s+and\s+|\s+or\s+|\s*\/\s*/i)
    .map((p) => p.replace(/^[\s,]+|[\s,]+$/g, ""))
    .filter((p) => p && !/^(the )?(ice edge|via .*)$/i.test(p));
  const seen = new Set();
  return parts.filter((p) => {
    const k = placeKey(p);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function nominatim(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=3&accept-language=en&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "application/json" } });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const rows = await res.json();
  return rows.map((r) => ({ lat: Number(r.lat), lon: Number(r.lon), label: r.display_name, type: r.type }));
}

async function main() {
  const snapshot = JSON.parse(await readFile(SNAPSHOT, "utf8"));
  const web = snapshot.itineraries ?? {};
  const byId = new Map(snapshot.destinations.map((d) => [d.id, d]));
  let existing = {};
  if (!REFRESH) {
    try {
      existing = JSON.parse(await readFile(OUT, "utf8")).itineraries ?? {};
    } catch {
      existing = {};
    }
  }

  // What the repo already knows: Atlas destinations with coordinates.
  const gazetteer = new Map();
  for (const d of [...snapshot.destinations].sort((a, b) => b.level - a.level)) {
    if (d.lat != null && d.lon != null && d.name) gazetteer.set(placeKey(d.name), { lat: d.lat, lon: d.lon, source: `atlas:${d.id}` });
  }
  // Context for lookups: the region and country names of the pages linking to each itinerary.
  const context = new Map();
  for (const d of snapshot.destinations) {
    for (const l of d.itineraryLinks ?? []) {
      const region = byId.get(d.regionId);
      const names = new Set(context.get(l.url) ?? []);
      if (d.level >= 2) names.add(d.name);
      if (region?.name) names.add(region.name);
      context.set(l.url, [...names]);
    }
  }

  const out = {};
  const review = [];
  let requests = 0;
  for (const [url, it] of Object.entries(web)) {
    const pins = it.mapPins ?? [];
    const centre = pins.length ? { lat: pins.reduce((s, p) => s + p.lat, 0) / pins.length, lon: pins.reduce((s, p) => s + p.lon, 0) / pins.length } : null;
    const span = pins.length > 1 ? Math.max(...pins.map((a) => Math.max(...pins.map((b) => km(a, b))))) : 0;
    // Generous: an expedition route can start a thousand kilometres from the
    // cruising ground it is named for (Punta Arenas for Antarctica).
    const radius = Math.max(1200, span * 2.5);
    const pinLookup = new Map(pins.map((p) => [placeKey(p.label), p]));
    const ctx = context.get(url) ?? [];
    const prior = existing[url]?.days ?? {};
    const days = {};
    /** The last place located on this itinerary: a route is sequential, so it anchors the next lookup. */
    let anchor = centre;
    for (const stop of it.stops) {
      const places = legPlaces(stop.place);
      const located = [];
      for (const name of places) {
        const kept = prior[stop.day]?.places?.find((p) => p.name === name);
        if (kept) {
          located.push(kept);
          if (Number.isFinite(kept.lat) && kept.source !== "nominatim-far") anchor = kept;
          continue;
        }
        const k = placeKey(name);
        const k1 = placeKey(name.split(",")[0]);
        let hit = null;
        const pin = pinLookup.get(k) ?? pinLookup.get(k1);
        if (pin) hit = { lat: pin.lat, lon: pin.lon, source: "map-pin" };
        else if (gazetteer.get(k) || gazetteer.get(k1)) hit = { ...(gazetteer.get(k) || gazetteer.get(k1)) };
        else {
          // Every query's candidates together; the nearest to the anchor wins.
          const queries = [...ctx.map((c) => `${name}, ${c}`), name];
          const candidates = [];
          for (const q of queries) {
            await sleep(NOMINATIM_GAP_MS);
            requests++;
            try {
              for (const r of await nominatim(q)) candidates.push({ ...r, query: q });
            } catch (err) {
              console.log(`  ! ${q}: ${err.message}`);
            }
            // A candidate already sits near the anchor: no need to ask again.
            if (anchor && candidates.some((c) => km(c, anchor) <= radius)) break;
          }
          const best = candidates.sort((a, b) => (anchor ? km(a, anchor) - km(b, anchor) : 0))[0] ?? null;
          if (best) {
            // Beyond the itinerary's own area the result is recorded but marked
            // "nominatim-far", which the build does not draw — otherwise "Galli
            // Islands" lands in the Canaries and the route crosses the Atlantic.
            const near = !centre || km(best, centre) <= radius;
            hit = { lat: best.lat, lon: best.lon, source: near ? "nominatim" : "nominatim-far", query: best.query, label: best.label };
          }
        }
        const entry = { name, ...(hit ?? { lat: null, lon: null, source: "unresolved" }) };
        if (hit && centre && km(hit, centre) > radius) entry.flag = `not drawn — ${Math.round(km(hit, centre))} km from the itinerary's map pins; correct it here to draw it`;
        else if (hit && centre && km(hit, centre) > radius * 0.8) entry.flag = `near the edge of the itinerary's area (${Math.round(km(hit, centre))} km)`;
        located.push(entry);
        if (Number.isFinite(entry.lat) && entry.source !== "nominatim-far") anchor = entry;
        review.push({ title: it.title, day: stop.day, heading: stop.place, ...entry });
        console.log(`  ${hit ? "✓" : "✗"} ${it.title} · day ${stop.day} · ${name} → ${hit ? `${hit.lat.toFixed(4)}, ${hit.lon.toFixed(4)} (${hit.source})` : "unresolved"}`);
      }
      days[stop.day] = { heading: stop.place, places: located };
    }
    out[url] = { title: it.title, days };
  }

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), itineraries: out }, null, 2) + "\n");

  const lines = ["# Itinerary stops — location review", "", `Generated by \`node scripts/geocode-itinerary-stops.mjs\` on ${new Date().toISOString().slice(0, 10)}.`, "Edit coordinates in `content/itinerary-stops.json`; a re-run keeps hand-corrected entries unless `--refresh` is given.", "", "| Itinerary | Day | Heading as written | Place | Lat | Lon | Source | Flag |", "|---|---|---|---|---|---|---|---|"];
  const all = Object.entries(out).flatMap(([, it]) => Object.entries(it.days).flatMap(([day, d]) => d.places.map((p) => ({ title: it.title, day, heading: d.heading, ...p }))));
  for (const r of all) lines.push(`| ${r.title} | ${r.day} | ${r.heading} | ${r.name} | ${r.lat ?? "—"} | ${r.lon ?? "—"} | ${r.source}${r.query ? ` (“${r.query}”)` : ""} | ${r.flag ?? ""} |`);
  const unresolved = all.filter((r) => r.source === "unresolved" || r.source === "nominatim-far");
  const flagged = all.filter((r) => r.flag);
  lines.push("", `**${all.length} places** across ${Object.keys(out).length} itineraries: ${all.length - unresolved.length} drawn, ${unresolved.length} not drawn (unresolved or too far), ${flagged.length} flagged.`);
  await mkdir(path.dirname(REVIEW), { recursive: true });
  await writeFile(REVIEW, lines.join("\n") + "\n");
  console.log(`\n${all.length} places, ${all.length - unresolved.length} drawn, ${unresolved.length} not drawn, ${flagged.length} flagged; ${requests} Nominatim requests.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
