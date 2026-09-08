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
 * offered), the "why visit" list, key facts, the child destinations and the
 * page's featured charter yachts (name, specs, rate, Sirv lead image, URL).
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
import { parse } from "node-html-parser";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_PATH = path.join(ROOT, "data", "destinations.json");
const OVERRIDES_PATH = path.join(ROOT, "data", "destination-overrides.json");

const SITE = "https://www.oceanindependence.com";
const INDEX_URL = `${SITE}/yacht-charter/destinations/`;
const USER_AGENT = "OceanIndependence-Atlas-Import/1.0 (+https://www.oceanindependence.com)";

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function decode(text) {
  return (text || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8217;|&rsquo;/g, "’")
    .replace(/&#8216;|&lsquo;/g, "‘")
    .replace(/&#8220;|&ldquo;/g, "“")
    .replace(/&#8221;|&rdquo;/g, "”")
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&#8212;|&mdash;/g, "—")
    .replace(/&#8230;|&hellip;/g, "…")
    .replace(/&#038;|&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

const text = (node) => (node ? decode(node.text) : "");

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

/** Path id under /yacht-charter/destinations/, e.g. "mediterranean/italy". */
function idFromUrl(url) {
  const m = url.match(/\/yacht-charter\/destinations\/([^?#]*)/);
  if (!m) return null;
  return m[1].replace(/\/+$/, "");
}

function canonicalUrl(href) {
  if (!href) return null;
  let url = href.trim();
  if (url.startsWith("/")) url = SITE + url;
  if (!url.startsWith(SITE + "/yacht-charter/destinations/")) return null;
  url = url.split("#")[0].split("?")[0];
  if (!url.endsWith("/")) url += "/";
  if (/\/page\/\d+\/$/.test(url)) return null; // paginated listing duplicates
  if (/\/(de|es|fr|it|ru)\//.test(url.replace(SITE, ""))) return null;
  return url;
}

/** Sirv images: always ask for the 2000px rendition. Other hosts unchanged. */
function sirv2000(url) {
  if (!url) return url;
  if (/oceanindependence\.sirv\.com/.test(url)) return url.replace(/\?.*$/, "") + "?w=2000";
  return url;
}

async function fetchHtml(url, attempt = 1) {
  try {
    const res = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "text/html" }, redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (err) {
    if (attempt >= 4) throw err;
    await sleep(500 * 2 ** attempt);
    return fetchHtml(url, attempt + 1);
  }
}

/* --------------------------------------------------------------- parsing */

function parseYachtCard(card) {
  const link = card.querySelector("a.o-card__inner-link") || card.querySelector("a[href*='/yacht-charter/yacht/']");
  const url = link?.getAttribute("href") || null;
  const name = text(card.querySelector(".c-yacht-card__title"));
  const ps = card.querySelectorAll(".c-yacht-card__details p").map(text).filter(Boolean);
  const specsRaw = ps.find((p) => /\d+m/i.test(p)) || ps[0] || "";
  const rateRaw = ps.find((p) => /\/\s*week|per week/i.test(p)) || "";
  const img = card.querySelector(".c-yacht-card__media img")?.getAttribute("src") || null;
  const favourite = card.querySelector("[data-yacht-id]")?.getAttribute("data-yacht-id");
  const slug = url ? url.replace(/\/+$/, "").split("/").pop() : name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const id = favourite ? `yf-${favourite}` : slug;
  const tags = card.querySelectorAll(".c-yacht-card__tag").map(text).filter(Boolean);

  // "58m (191') - Trinity Yachts - 2009 - 12 Guests"
  const specs = specsRaw.split(/\s+-\s+/).map((s) => s.trim());
  const lengthMatch = specs[0]?.match(/^([\d.]+)\s*m(?:\s*\(([^)]*)\))?/i);
  const yearIdx = specs.findIndex((s) => /^\d{4}$/.test(s));
  const guestsIdx = specs.findIndex((s) => /guests?/i.test(s));
  const builder = specs.slice(1).filter((_, i) => i + 1 !== yearIdx && i + 1 !== guestsIdx)[0] || null;
  const rateMatch = rateRaw.match(/(from\s+)?([A-Z]{3})\s*([\d,.]+)/i);

  return {
    id,
    name,
    url,
    image: sirv2000(img),
    specsRaw,
    rateRaw,
    lengthM: lengthMatch ? Number.parseFloat(lengthMatch[1]) : null,
    lengthFt: lengthMatch?.[2] ? lengthMatch[2].replace(/['’]/g, "") : null,
    builder,
    year: yearIdx >= 0 ? Number.parseInt(specs[yearIdx], 10) : null,
    guests: guestsIdx >= 0 ? Number.parseInt(specs[guestsIdx], 10) : null,
    currency: rateMatch ? rateMatch[2].toUpperCase() : null,
    weeklyRate: rateMatch ? Number.parseInt(rateMatch[3].replace(/[,.]/g, ""), 10) : null,
    weeklyRateIsFrom: rateMatch ? Boolean(rateMatch[1]) : false,
    tags,
  };
}

function parsePage(url, html) {
  const root = parse(html, { blockTextElements: { script: false, style: false, noscript: false } });
  const id = idFromUrl(url);

  const hero = root.querySelector(".c-hero");
  const h1 = hero?.querySelector("h1") || root.querySelector("h1");
  let name = "";
  if (h1) {
    const eyebrow = h1.querySelector(".h5");
    if (eyebrow) eyebrow.remove();
    name = text(h1);
  }
  const metaTitle = text(root.querySelector("title"));
  const metaDescription = root.querySelector('meta[name="description"]')?.getAttribute("content") || "";
  const ogImage = root.querySelector('meta[property="og:image"]')?.getAttribute("content") || null;

  let heroImage =
    hero?.querySelector('picture source[media*="min-width"]')?.getAttribute("srcset") ||
    hero?.querySelector("picture img")?.getAttribute("src") ||
    hero?.querySelector("img")?.getAttribute("src") ||
    ogImage;
  heroImage = sirv2000(heroImage ? heroImage.split(/\s+/)[0] : null);
  const heroMobile = hero?.querySelector('picture source[media*="max-width"]')?.getAttribute("srcset")?.split(/\s+/)[0] || null;
  const heroVideo = hero?.querySelector("video source")?.getAttribute("src") || null;

  const main = root.querySelector("main.o-sidebar-layout__main") || root.querySelector("main");
  // Intro copy, verbatim: the large lede block(s) then the standard blocks,
  // in page order. Only the blocks that sit directly inside <main> count —
  // the tick list, map and sidebar are separate.
  const lede = [];
  const paragraphs = [];
  if (main) {
    for (const block of main.childNodes) {
      if (block.nodeType !== 1) continue;
      const cls = block.getAttribute("class") || "";
      if (!/s-standard-content/.test(cls)) continue;
      const ps = block.querySelectorAll("p").map(text).filter(Boolean);
      (/u-text-huge/.test(cls) ? lede : paragraphs).push(...ps);
    }
  } else {
    // Hub pages (e.g. North America) have no <main>: any standalone copy block
    // in the first section is the intro; slider intros and cards are not.
    const first = root.querySelector("section.o-section");
    for (const block of first ? first.querySelectorAll(".s-standard-content") : []) {
      const cls = block.getAttribute("class") || "";
      if (/c-featured-items-slider__intro/.test(cls) || block.closest(".o-card")) continue;
      const ps = block.querySelectorAll("p").map(text).filter(Boolean);
      (/u-text-huge/.test(cls) ? lede : paragraphs).push(...ps);
    }
  }
  const whyVisit = root.querySelectorAll(".o-tick-list__text").map(text).filter(Boolean);
  const keyFacts = root.querySelectorAll(".o-key-facts figure.o-meta").map((fig) => {
    const label = text(fig.querySelector(".o-meta__label")).replace(/:$/, "");
    const cap = fig.querySelector("figcaption");
    if (cap) cap.remove();
    const badges = fig.querySelectorAll(".o-badge").map(text).filter(Boolean);
    return { label, value: badges.length ? badges.join(" · ") : text(fig) };
  });

  let mapPins = [];
  let mapZoom = null;
  const map = root.querySelector(".o-google-map[data-map-locations]");
  if (map) {
    try {
      const raw = decode(map.getAttribute("data-map-locations"));
      mapPins = JSON.parse(raw)
        .map((p) => [Number.parseFloat(p.latitude), Number.parseFloat(p.longitude)])
        .filter(([la, lo]) => Number.isFinite(la) && Number.isFinite(lo) && !(la === 0 && lo === 0));
    } catch {
      mapPins = [];
    }
    mapZoom = Number.parseInt(map.getAttribute("data-map-zoom") || "", 10) || null;
  }

  // Child destinations — the "Destination Guides" cards on this page.
  const cards = root.querySelectorAll(".c-destination-card").map((card) => {
    const href = canonicalUrl(card.getAttribute("href") || card.querySelector("a")?.getAttribute("href"));
    const img = card.querySelector("img");
    let image = img?.getAttribute("src") || null;
    const srcset = img?.getAttribute("srcset");
    if (srcset) {
      // Largest rendition offered.
      const best = srcset
        .split(",")
        .map((s) => s.trim().split(/\s+/))
        .map(([u, w]) => [u, Number.parseInt(w || "0", 10)])
        .sort((a, b) => b[1] - a[1])[0];
      if (best) image = best[0];
    }
    return {
      url: href,
      name: text(card.querySelector(".c-destination-card__title")),
      summary: text(card.querySelector(".c-destination-card__details")),
      image: sirv2000(image),
    };
  }).filter((c) => c.url);

  // Every destination link on the page, for tree discovery (region pages list
  // grandchildren too).
  const links = new Set();
  for (const a of root.querySelectorAll("a[href]")) {
    const u = canonicalUrl(a.getAttribute("href"));
    if (u && u !== INDEX_URL) links.add(u);
  }

  // Featured charter yachts — "Yachts in the Area".
  let yachtSection = root.querySelector("#yachts-in-the-area");
  if (!yachtSection) {
    yachtSection = root
      .querySelectorAll(".c-featured-items-slider")
      .find((s) => /yacht/i.test(text(s.querySelector("h2"))) && s.querySelector(".c-yacht-card"));
  }
  const yachts = yachtSection ? yachtSection.querySelectorAll(".c-yacht-card").map(parseYachtCard).filter((y) => y.name) : [];

  return {
    id,
    url,
    name,
    metaTitle,
    metaDescription: decode(metaDescription),
    ogImage,
    heroImage,
    heroMobile,
    heroVideo,
    lede: lede.join(" "),
    paragraphs,
    whyVisit,
    keyFacts,
    mapPins,
    mapZoom,
    cards,
    links: [...links],
    yachts,
  };
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
      whyVisit: p.whyVisit,
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
