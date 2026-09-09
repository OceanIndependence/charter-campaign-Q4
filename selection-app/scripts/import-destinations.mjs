#!/usr/bin/env node
/**
 * Destination import — builds the content snapshot the 2027 Atlas page
 * (/2027-charter-season) renders from.
 *
 *   npm run import:destinations                 full crawl + geocode
 *   npm run import:destinations -- --limit 12   crawl the first 12 pages only
 *   npm run import:destinations -- --no-geocode skip the Nominatim fallback
 *
 * Crawls https://www.oceanindependence.com/yacht-charter/destinations/ and
 * every region / country / cruising-ground / place page beneath it, capturing
 * for each page: name, URL, intro copy verbatim, hero image (Sirv ?w=2000 where
 * offered), key facts, the child destinations and the page's featured charter
 * yachts (name, specs, rate, Sirv lead image, URL).
 *
 * Every destination is geocoded automatically:
 *   1. the page's own Google-map pin (data-map-locations)      → "site-map"
 *   2. checked against the hand-placed reference pins from the design source;
 *      a large disagreement swaps in the reference and flags the destination
 *   3. no pin on the page → Nominatim (OpenStreetMap) lookup   → "nominatim"
 *   4. still nothing → the parent's coordinates                → "parent"
 *   5. data/destination-overrides.json wins over all of the above → "manual"
 * Anything below high confidence is listed under `review` in the JSON and
 * printed at the end of the run.
 *
 * Output: data/destinations.json (checked in — the page has no runtime
 * dependency on the website). Never exits non-zero for a single bad page; the
 * page is recorded under `errors` instead.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { INDEX_URL, fetchHtml, idFromUrl, parsePage, sleep } from "../src/server/atlas/website.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_PATH = path.join(ROOT, "data", "destinations.json");
const OVERRIDES_PATH = path.join(ROOT, "data", "destination-overrides.json");

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const LIMIT = Number.parseInt(opt("--limit", "0"), 10) || 0;
const CONCURRENCY = Number.parseInt(opt("--concurrency", "4"), 10) || 4;
const GEOCODE = !flag("--no-geocode");

/**
 * Hand-placed pins from the design source (Tier 1 DC prototype). They are the
 * correctness reference for the Mediterranean; the rest are included so the
 * automatic result can be sanity-checked everywhere the designer placed a pin.
 * Keys are the destination's path id under /yacht-charter/destinations/.
 */
const REFERENCE_PINS = {
  "mediterranean/italy": [41.5, 12.8],
  "mediterranean/italy/amalfi-coast": [40.63, 14.5],
  "mediterranean/italy/sardinia": [41.0, 9.5],
  "mediterranean/italy/sicily": [38.5, 14.9],
  "mediterranean/italy/italian-riviera": [44.3, 9.2],
  "mediterranean/italy/venice": [45.43, 12.34],
  "mediterranean/italy/naples": [40.8, 14.2],
  "mediterranean/italy/ischia": [40.73, 13.9],
  "mediterranean/france": [43.3, 6.8],
  "mediterranean/france/french-riviera": [43.5, 7.0],
  "mediterranean/france/corsica": [42.35, 8.75],
  "mediterranean/spain": [39.5, 2.7],
  "mediterranean/spain/the-balearics": [39.5, 2.9],
  "mediterranean/spain/valencia": [39.47, -0.33],
  "mediterranean/greece": [37.9, 24.0],
  "mediterranean/greece/the-cyclades": [37.1, 25.2],
  "mediterranean/greece/the-saronic-islands": [37.3, 23.5],
  "mediterranean/greece/the-ionian-islands": [39.0, 20.2],
  "mediterranean/greece/the-dodecanese": [36.4, 27.2],
  "mediterranean/greece/crete": [35.3, 24.9],
  "mediterranean/greece/athens": [37.9, 23.7],
  "mediterranean/croatia": [43.2, 16.5],
  "mediterranean/croatia/dubrovnik": [42.65, 18.09],
  "mediterranean/croatia/hvar": [43.17, 16.44],
  "mediterranean/montenegro": [42.3, 18.8],
  "mediterranean/montenegro/kotor": [42.42, 18.77],
  "mediterranean/montenegro/budva": [42.29, 18.84],
  "mediterranean/turkey": [36.8, 28.3],
  "mediterranean/turkey/gocek": [36.75, 28.94],
  "mediterranean/turkey/marmaris": [36.85, 28.27],
  "mediterranean/malta": [35.9, 14.4],
  "mediterranean/cyprus": [34.7, 33.0],
  "caribbean": [17.9, -63.1],
  "north-america/florida": [26.1, -80.2],
  "north-america/new-england": [41.6, -70.6],
  "north-america/alaska": [57.9, -135.4],
  "north-america/bermuda": [32.3, -64.8],
  "northern-europe/norway": [61.2, 6.8],
  "arctic/svalbard": [78.2, 15.6],
  "arctic/greenland": [70.5, -28.0],
  "indian-ocean/maldives": [3.2, 73.4],
  "indian-ocean/seychelles": [-4.7, 55.5],
  "indian-ocean/tanzania": [-6.4, 39.5],
  "south-east-asia/thailand": [7.9, 98.4],
  "south-east-asia/indonesia": [-8.7, 115.2],
  "south-pacific/french-polynesia": [-16.5, -149.8],
  "south-pacific/fiji": [-17.8, 178.4],
  "australia-and-new-zealand/the-whitsundays": [-20.3, 148.9],
  "australia-and-new-zealand/new-zealand": [-41.0, 174.0],
  "south-america/galapagos-islands": [-0.7, -90.9],
  "south-america/patagonia": [-49.5, -73.2],
  "central-america/costa-rica": [9.3, -84.9],
  "central-america/mexico": [20.6, -105.3],
  "middle-east/the-red-sea": [26.5, 35.5],
  "antarctica": [-64.8, -63.5],
};
/** Site pin vs reference pin: beyond this the reference wins and we flag it. */
const REFERENCE_TOLERANCE_KM = 250;
/** A pin this far from its parent's pin is suspicious (regions excepted). */
const PARENT_TOLERANCE_KM = 2500;

/* ------------------------------------------------------------------ utils */



function haversineKm(a, b) {
  const R = 6371;
  const d2r = Math.PI / 180;
  const dLat = (b[0] - a[0]) * d2r;
  const dLon = (b[1] - a[1]) * d2r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * d2r) * Math.cos(b[0] * d2r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const round = (n, dp = 4) => Math.round(n * 10 ** dp) / 10 ** dp;

/** Spherical centroid of [lat, lon] pairs — safe across the antimeridian. */
function centroid(points) {
  const d2r = Math.PI / 180;
  let x = 0;
  let y = 0;
  let z = 0;
  for (const [la, lo] of points) {
    x += Math.cos(la * d2r) * Math.cos(lo * d2r);
    y += Math.cos(la * d2r) * Math.sin(lo * d2r);
    z += Math.sin(la * d2r);
  }
  const n = points.length;
  x /= n;
  y /= n;
  z /= n;
  return [Math.atan2(z, Math.hypot(x, y)) / d2r, Math.atan2(y, x) / d2r];
}

/* -------------------------------------------------------------- geocoding */

let lastNominatim = 0;
async function nominatim(query) {
  const wait = 1100 - (Date.now() - lastNominatim);
  if (wait > 0) await sleep(wait);
  lastNominatim = Date.now();
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=en&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const results = await res.json();
  // Prefer places over businesses named after them.
  const noisy = new Set(["tourism", "amenity", "shop", "building", "office", "leisure", "highway", "craft"]);
  const pick = results.find((r) => !noisy.has(r.category)) || results[0];
  if (!pick) return null;
  return { lat: Number.parseFloat(pick.lat), lon: Number.parseFloat(pick.lon), label: pick.display_name, type: pick.addresstype || pick.type };
}

/* ------------------------------------------------------------------ main */

async function main() {
  const startedAt = new Date();
  console.log(`Importing destinations from ${INDEX_URL}`);

  let overrides = {};
  try {
    overrides = JSON.parse(await readFile(OVERRIDES_PATH, "utf8"));
  } catch {
    overrides = {};
  }

  const pages = new Map(); // id -> parsed page
  const errors = [];
  const queue = [INDEX_URL];
  const seen = new Set([INDEX_URL]);
  let fetched = 0;

  async function processUrl(url) {
    fetched += 1;
    const label = url.replace(INDEX_URL, "") || "(index)";
    try {
      const html = await fetchHtml(url);
      const page = parsePage(url, html);
      pages.set(url === INDEX_URL ? "" : page.id, page);
      console.log(`  ✓ ${label}${page.yachts.length ? `  ${page.yachts.length} yachts` : ""}`);
      for (const link of page.links) {
        if (!seen.has(link)) {
          seen.add(link);
          queue.push(link);
        }
      }
    } catch (err) {
      errors.push({ url, error: String(err.message || err) });
      console.log(`  ✗ ${label}: ${err.message || err}`);
    }
  }

  async function worker() {
    while (queue.length) {
      if (LIMIT && fetched >= LIMIT) return;
      const url = queue.shift();
      if (url) await processUrl(url);
    }
  }

  // The index must be parsed before the workers fan out.
  await processUrl(queue.shift());
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const index = pages.get("");
  pages.delete("");

  // ---- tree ------------------------------------------------------------
  const byId = new Map([...pages.values()].filter((p) => p.id).map((p) => [p.id, p]));
  const parentOf = (id) => (id.includes("/") ? id.slice(0, id.lastIndexOf("/")) : null);
  // Summaries and card imagery come from the parent's destination card.
  const cardById = new Map();
  for (const p of [index, ...byId.values()]) {
    if (!p) continue;
    for (const c of p.cards) {
      const cid = idFromUrl(c.url);
      if (cid && !cardById.has(cid)) cardById.set(cid, c);
    }
  }
  const childrenOf = new Map();
  for (const id of byId.keys()) {
    const parent = parentOf(id);
    if (parent !== null) {
      if (!childrenOf.has(parent)) childrenOf.set(parent, []);
      childrenOf.get(parent).push(id);
    }
  }
  const sortIds = (ids) => ids.sort((a, b) => byId.get(a).name.localeCompare(byId.get(b).name, "en-GB"));

  // ---- yachts (deduplicated across pages) -------------------------------
  const yachts = {};
  for (const p of byId.values()) {
    for (const y of p.yachts) {
      if (!yachts[y.id]) yachts[y.id] = y;
    }
  }

  // ---- geocoding --------------------------------------------------------
  // Pass 1: the page's own map pin, checked against the design reference.
  // Pass 2 (deepest first): hubs without a pin take the centroid of their
  //         children. Pass 3 (shallowest first): Nominatim, then the parent.
  const ordered = [...byId.keys()].sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
  const geo = new Map();
  const review = [];
  for (const id of ordered) {
    const p = byId.get(id);
    const flags = [];
    let lat = null;
    let lon = null;
    let source = null;
    let confidence = "high";
    const level = id.split("/").length;

    if (p.mapPins.length) {
      [lat, lon] = centroid(p.mapPins);
      source = "site-map";
      // A region map legitimately carries a pin per destination; a single
      // destination with several pins is worth a glance.
      if (p.mapPins.length > 1 && level > 1) flags.push(`site map has ${p.mapPins.length} pins; using their centroid`);
    }

    const ref = REFERENCE_PINS[id];
    if (ref) {
      if (lat == null) {
        [lat, lon] = ref;
        source = "reference";
        confidence = "medium";
        flags.push("no map pin on the page; using the design reference pin");
      } else {
        const km = haversineKm([lat, lon], ref);
        if (km > REFERENCE_TOLERANCE_KM) {
          flags.push(`site map pin (${round(lat, 2)}, ${round(lon, 2)}) is ${Math.round(km)} km from the design reference; reference used`);
          [lat, lon] = ref;
          source = "reference";
          confidence = level === 1 ? "high" : "medium";
        }
      }
    }
    geo.set(id, { name: p.name, lat, lon, source, confidence, flags, level });
  }

  for (const id of [...ordered].reverse()) {
    const g = geo.get(id);
    if (g.lat != null) continue;
    const kids = (childrenOf.get(id) || []).map((k) => geo.get(k)).filter((k) => k.lat != null);
    if (!kids.length) continue;
    [g.lat, g.lon] = centroid(kids.map((k) => [k.lat, k.lon]));
    g.source = "children-centroid";
    g.confidence = "medium";
    g.flags.push(`no map pin on the page; centroid of ${kids.length} child destination${kids.length === 1 ? "" : "s"}`);
  }

  for (const id of ordered) {
    const g = geo.get(id);
    const p = byId.get(id);
    const parentId = parentOf(id);
    const parentGeo = parentId ? geo.get(parentId) : null;

    if (g.lat == null && GEOCODE) {
      const parentName = parentGeo?.name || "";
      const region = id.split("/")[0].replace(/-/g, " ");
      const queries = [
        parentName && parentName !== p.name ? `${p.name}, ${parentName}` : null,
        `${p.name}, ${region}`,
        p.name,
      ].filter(Boolean);
      for (const q of queries) {
        try {
          const hit = await nominatim(q);
          if (hit) {
            g.lat = hit.lat;
            g.lon = hit.lon;
            g.source = "nominatim";
            g.confidence = "low";
            g.flags.push(`geocoded by Nominatim from "${q}" → ${hit.label} (${hit.type})`);
            break;
          }
        } catch (err) {
          g.flags.push(`Nominatim failed for "${q}": ${err.message || err}`);
        }
      }
    }

    if (g.lat == null && parentGeo && parentGeo.lat != null) {
      g.lat = parentGeo.lat;
      g.lon = parentGeo.lon;
      g.source = "parent";
      g.confidence = "none";
      g.flags.push(`no coordinates found; inherited from ${parentGeo.name}`);
    }

    if (g.lat != null && parentGeo && parentGeo.lat != null && parentId.includes("/")) {
      // Countries and below should sit near their parent; regions are too big to test.
      const km = haversineKm([g.lat, g.lon], [parentGeo.lat, parentGeo.lon]);
      if (km > PARENT_TOLERANCE_KM) {
        g.flags.push(`${Math.round(km)} km from parent ${parentGeo.name}`);
        if (g.confidence === "high") g.confidence = "medium";
      }
    }
    if (g.lat != null && (Math.abs(g.lat) > 90 || Math.abs(g.lon) > 180)) {
      g.flags.push("coordinates out of range");
      g.confidence = "none";
    }

    const override = overrides[id];
    if (override && Number.isFinite(override.lat) && Number.isFinite(override.lon)) {
      g.lat = override.lat;
      g.lon = override.lon;
      g.source = "manual";
      g.confidence = "high";
      g.flags.length = 0;
      if (override.note) g.flags.push(`manual: ${override.note}`);
    }

    if (g.lat == null) {
      g.confidence = "none";
      g.flags.push("no coordinates at all");
    } else {
      g.lat = round(g.lat);
      g.lon = round(g.lon);
    }
    g.siteLat = p.mapPins.length ? round(p.mapPins[0][0]) : null;
    g.siteLon = p.mapPins.length ? round(p.mapPins[0][1]) : null;
    g.siteZoom = p.mapZoom;
    if (g.confidence !== "high" || g.flags.length) review.push({ id, name: p.name, lat: g.lat, lon: g.lon, confidence: g.confidence, flags: g.flags });
  }

  // ---- assemble ---------------------------------------------------------
  const destinations = ordered.map((id) => {
    const p = byId.get(id);
    const g = geo.get(id);
    const card = cardById.get(id);
    const segments = id.split("/");
    return {
      id,
      slug: segments[segments.length - 1],
      name: p.name,
      url: p.url,
      level: segments.length,
      parentId: parentOf(id),
      regionId: segments[0],
      lat: g.lat,
      lon: g.lon,
      geo: { source: g.source, confidence: g.confidence, flags: g.flags, siteLat: g.siteLat, siteLon: g.siteLon, siteZoom: g.siteZoom },
      heroImage: p.heroImage,
      heroMobile: p.heroMobile,
      heroVideo: p.heroVideo,
      ogImage: p.ogImage,
      cardImage: card?.image || null,
      summary: card?.summary || p.metaDescription || "",
      metaTitle: p.metaTitle,
      metaDescription: p.metaDescription,
      lede: p.lede,
      paragraphs: p.paragraphs,
      keyFacts: p.keyFacts,
      childIds: sortIds(childrenOf.get(id) || []),
      yachtIds: [...new Set(p.yachts.map((y) => y.id))],
      featured: p.yachts.length > 0,
    };
  });

  const snapshot = {
    generatedAt: startedAt.toISOString(),
    source: INDEX_URL,
    site: {
      title: index?.metaTitle || "",
      description: index?.metaDescription || "",
      heroImage: index?.heroImage || null,
      ogImage: index?.ogImage || null,
      /** Regions in the order the website's index presents them. */
      regionOrder: (index?.cards || []).map((c) => idFromUrl(c.url)).filter((rid) => rid && byId.has(rid)),
    },
    counts: {
      pages: byId.size,
      regions: destinations.filter((d) => d.level === 1).length,
      destinations: destinations.length,
      yachts: Object.keys(yachts).length,
      review: review.length,
      errors: errors.length,
    },
    destinations,
    yachts,
    review,
    errors,
  };

  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(snapshot, null, 2) + "\n");

  console.log("");
  console.log(`Wrote ${path.relative(ROOT, OUT_PATH)}`);
  console.log(`  pages ${snapshot.counts.pages} · regions ${snapshot.counts.regions} · yachts ${snapshot.counts.yachts} · errors ${errors.length}`);
  if (review.length) {
    console.log("");
    console.log(`Coordinates to review (${review.length}):`);
    for (const r of review) {
      console.log(`  - ${r.id}  [${r.confidence}]  ${r.lat}, ${r.lon}`);
      for (const f of r.flags) console.log(`      ${f}`);
    }
    console.log("");
    console.log(`Resolve any of these by adding {"<id>": {"lat": .., "lon": .., "note": ".."}} to ${path.relative(ROOT, OVERRIDES_PATH)} and re-running.`);
  }
  if (errors.length) {
    console.log("");
    console.log("Pages that failed:");
    for (const e of errors) console.log(`  - ${e.url}: ${e.error}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
