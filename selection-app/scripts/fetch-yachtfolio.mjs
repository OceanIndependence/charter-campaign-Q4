#!/usr/bin/env node
/**
 * Build-time fetch of curated yacht data from the Yachtfolio API (doc v1.2).
 *
 * Runs as `prebuild` on Vercel and via `npm run yachts:fetch` locally.
 * Reads the curated yacht list from config/yachts.json, fetches reference
 * data plus one brochure (and one basic record) per yacht, normalises into
 * data/yachts.json, and downloads gallery images into public/yachts/<slug>/
 * (cropped, never stretched, to 2000×1250 and 1000×625 with sharp).
 *
 * The passkey comes ONLY from the YACHTFOLIO_PASSKEY environment variable
 * (or a local, git-ignored .env.local). It is never written to any output:
 * every saved payload passes through redact() first, and images are
 * downloaded here precisely so the browser never requests a passkeyed URL.
 *
 * This script must never break the build: if the key is missing or the API
 * fails, it warns, leaves the last committed data in place (falling back to
 * the demo content when no real data has ever been generated) and exits 0.
 * Diagnostics land in data/yachtfolio/fetch-report.md, and a passkey-redacted
 * copy of the first brochure response lands in data/yachtfolio/samples/.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = path.join(ROOT, "config", "yachts.json");
const DATA_PATH = path.join(ROOT, "data", "yachts.json");
const YF_DIR = path.join(ROOT, "data", "yachtfolio");
const REPORT_PATH = path.join(YF_DIR, "fetch-report.md");
const SAMPLES_DIR = path.join(YF_DIR, "samples");
const LIST_PATH = path.join(YF_DIR, "yacht-list.json");
const REFERENCE_PATH = path.join(YF_DIR, "reference.json");
const MANIFEST_PATH = path.join(YF_DIR, "images-manifest.json");
const IMAGES_ROOT = path.join(ROOT, "public", "yachts");

/** Overridable only so the pipeline can be exercised against a local mock. */
const API_BASE = process.env.YACHTFOLIO_API_BASE ?? "https://www.yachtfolio.com/api";
const REQUEST_DELAY_MS = 400;
const RETRY_DELAY_MS = 1500;
const APA_PCT = 35;

/** Charter season the campaign quotes rates for. */
const TARGET_SEASON = { name: "summer", year: "2027", label: "summer 2027" };

/** Gallery categories to publish, in display order. */
const GALLERY_ORDER = ["EXTERIOR", "LIFESTYLE", "INTERIOR"];
const IMAGE_SIZES = [
  { suffix: "", width: 2000, height: 1250 },
  { suffix: "-sm", width: 1000, height: 625 },
];

const warnings = [];
function warn(msg) {
  warnings.push(msg);
  console.warn(`[yachtfolio] WARNING: ${msg}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function loadPasskey() {
  if (process.env.YACHTFOLIO_PASSKEY) return process.env.YACHTFOLIO_PASSKEY.trim();
  for (const envFile of [path.join(ROOT, ".env.local"), path.join(ROOT, "..", ".env.local")]) {
    if (!existsSync(envFile)) continue;
    const text = await readFile(envFile, "utf8");
    const m = text.match(/^\s*YACHTFOLIO_PASSKEY\s*=\s*"?([^"\r\n]+)"?\s*$/m);
    if (m) return m[1].trim();
  }
  return null;
}

/** Remove every occurrence of the passkey from text destined for disk/logs. */
function redact(text, passkey) {
  return passkey ? text.split(passkey).join("<REDACTED>") : text;
}

/**
 * GET a Yachtfolio endpoint. Retries once on network failure, HTTP error or
 * a non-empty `errors` array; throws (with the passkey redacted) after that.
 */
async function apiGet(passkey, script, params) {
  const url = new URL(`${API_BASE}/${script}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  url.searchParams.set("passkey", passkey);

  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url);
      const raw = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = JSON.parse(raw);
      if (Array.isArray(json?.errors) && json.errors.length > 0) {
        throw new Error(`API errors: ${json.errors.join("; ")}`);
      }
      return { json, raw };
    } catch (err) {
      lastError = err;
      if (attempt === 1) await sleep(RETRY_DELAY_MS);
    }
  }
  const label = redact(`${script}?${url.searchParams.toString().replace(/passkey=[^&]*/, "passkey=…")}`, passkey);
  throw new Error(`${label} failed twice: ${redact(String(lastError?.message ?? lastError), passkey)}`);
}

async function readJsonIfExists(file, fallback) {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

/* ---------------------------------------------------------------- helpers */

function slugify(name) {
  return String(name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function stripHtml(html) {
  if (!html) return undefined;
  const text = String(html)
    .replace(/<(br|\/p|\/div|\/li)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&(quot|#34);/gi, '"')
    .replace(/&(apos|#39|rsquo);/gi, "’")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
  return text || undefined;
}

/** First numeric value from strings like "30.48 metres (100')" or "47.500000". */
function parseMetres(value) {
  if (value == null) return undefined;
  const m = String(value).match(/\d+(?:\.\d+)?/);
  if (!m) return undefined;
  const n = Number(m[0]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function pickSeason(seasons, { name, year }) {
  return (
    seasons.find(
      (s) =>
        String(s.name ?? "").toLowerCase().includes(name) &&
        String(s.year ?? "").includes(year)
    ) ?? null
  );
}

/** "1 Single, 1 Double, 1 Twin" → "1 single, 1 double, 1 twin" (house style). */
function normaliseCabinConfig(text) {
  if (!text) return undefined;
  const clean = stripHtml(text);
  if (!clean) return undefined;
  return clean.replace(/\b(Single|Double|Twin|Triple|Convertible|Master|VIP|Pullman)\b/g, (w) =>
    w === "VIP" ? w : w.toLowerCase()
  );
}

function breakdownFromCounts(rec) {
  const parts = [];
  const add = (n, label) => {
    if (typeof n === "number" && n > 0) parts.push(`${n} ${label}`);
  };
  add(rec.double_cabins, "double");
  add(rec.twin_cabins, "twin");
  add(rec.single_cabins, "single");
  add(rec.triple_cabins, "triple");
  add(rec.convertible_cabins, "convertible");
  return parts.length ? parts.join(", ") : undefined;
}

/* ------------------------------------------------------------ shape check */

/**
 * The documentation dates from 2023 — compare the live brochure shape with
 * what the doc promises and report differences instead of guessing.
 */
function checkBrochureShape(brochure) {
  const notes = [];
  const expectedTop = [
    "crew", "specifications", "operating_areas", "key_features", "galleries",
    "video", "general", "crew_members", "broker", "sample_menu", "prices",
  ];
  const keys = Object.keys(brochure ?? {});
  for (const k of expectedTop) if (!keys.includes(k)) notes.push(`missing top-level key \`${k}\``);
  const known = new Set([...expectedTop, "auto", "manual", "manual_text", "errors", "data"]);
  for (const k of keys) if (!known.has(k)) notes.push(`unexpected top-level key \`${k}\``);

  const general = brochure?.general;
  if (general) {
    for (const k of ["available", "data_source", "general_description"]) {
      if (!(k in general)) notes.push(`missing \`general.${k}\``);
    }
    const ds = general.data_source;
    if (ds && !["auto", "manual", "text"].includes(ds)) notes.push(`unexpected \`general.data_source\` value "${ds}"`);
    const block = ds === "auto" ? "auto" : ds === "manual" ? "manual" : ds === "text" ? "manual_text" : null;
    if (block && !(block in (brochure ?? {}))) {
      notes.push(`data_source is "${ds}" but the \`${block}\` block is absent`);
    }
  }
  if (brochure?.galleries) {
    for (const cat of ["EXTERIOR", "INTERIOR", "LIFESTYLE", "LAYOUT", "FULL"]) {
      if (!(cat in brochure.galleries)) notes.push(`missing gallery category \`${cat}\``);
    }
    const anyImage = Object.values(brochure.galleries).flat().find(Boolean);
    if (anyImage) {
      for (const k of ["id_file", "url", "filename", "id_order"]) {
        if (!(k in anyImage)) notes.push(`gallery image missing \`${k}\``);
      }
    }
  }
  const priceArr = Object.values(brochure?.prices ?? {})[0];
  if (Array.isArray(priceArr) && priceArr[0]) {
    for (const k of ["min_rate", "max_rate", "currency"]) {
      if (!(k in priceArr[0])) notes.push(`season price missing \`${k}\``);
    }
  }
  return notes;
}

/* ----------------------------------------------------------------- images */

async function loadSharp() {
  try {
    return (await import("sharp")).default;
  } catch {
    return null;
  }
}

async function downloadImages({ passkey, sharp, slug, galleries, manifest, report }) {
  const dir = path.join(IMAGES_ROOT, slug);
  await mkdir(dir, { recursive: true });

  const files = [];
  let seq = 0;
  for (const category of GALLERY_ORDER) {
    const images = [...(galleries?.[category] ?? [])].sort(
      (a, b) => (a.id_order ?? 0) - (b.id_order ?? 0)
    );
    report.imageCounts[category] = { api: images.length, downloaded: 0 };

    for (const image of images.slice(0, report.maxPerCategory)) {
      seq += 1;
      const base = `${String(seq).padStart(2, "0")}-${category.toLowerCase()}`;
      const key = `${slug}/${base}`;
      const stamp = `${image.id_file}:${image.date_added ?? ""}`;
      const outputs = IMAGE_SIZES.map((s) => path.join(dir, `${base}${s.suffix}.jpg`));

      const unchanged = manifest[key] === stamp && outputs.every((f) => existsSync(f));
      if (!unchanged) {
        try {
          const res = await fetch(image.url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buffer = Buffer.from(await res.arrayBuffer());
          for (const [i, size] of IMAGE_SIZES.entries()) {
            // fit: "cover" centre-crops to the exact aspect ratio — never stretches.
            await sharp(buffer)
              .resize(size.width, size.height, { fit: "cover", position: "centre", withoutEnlargement: false })
              .jpeg({ quality: 82, mozjpeg: true })
              .toFile(outputs[i]);
          }
          manifest[key] = stamp;
          await sleep(REQUEST_DELAY_MS);
        } catch (err) {
          warn(`${slug}: image ${redact(image.filename ?? String(image.id_file), passkey)} (${category}) failed: ${redact(String(err.message ?? err), passkey)}`);
          seq -= 1;
          continue;
        }
      }
      report.imageCounts[category].downloaded += 1;
      files.push({ category, url: `/yachts/${slug}/${base}.jpg`, smallUrl: `/yachts/${slug}/${base}-sm.jpg` });
    }
    if ((galleries?.[category]?.length ?? 0) > report.maxPerCategory) {
      report.notes.push(
        `${category}: ${galleries[category].length} images in the API, capped at ${report.maxPerCategory} (raise \`maxImagesPerCategory\` in config/yachts.json to fetch more)`
      );
    }
  }
  return files;
}

/* ------------------------------------------------------------- normalise */

function specBlocks(brochure) {
  const ds = brochure?.general?.data_source;
  // The block carrying cabin_config/bed_config/toys/engines moves with data_source.
  const detail =
    ds === "auto" ? brochure?.auto : ds === "manual" ? brochure?.manual : brochure?.manual_text;
  return { ds, detail: detail ?? {}, spec: brochure?.specifications ?? {} };
}

function normaliseYacht({ entry, listEntry, brochure, basic, reference, targetSeason, files, report }) {
  const { ds, detail, spec } = specBlocks(brochure);
  const missing = report.missingFields;
  const name = (entry.name ?? listEntry?.name ?? basic?.yacht_name ?? "").trim();

  const lengthM =
    parseMetres(spec.length_metres) ??
    parseMetres(detail.length) ??
    parseMetres(basic?.length_metric);
  if (!lengthM) missing.push("length");

  const yearBuilt = spec.year_built ?? detail.built ?? basic?.year_built;
  const yearRefit = spec.year_refit ?? detail.refit ?? basic?.year_refit;
  const yearStr = yearBuilt ? (yearRefit ? `${yearBuilt} / ${yearRefit}` : String(yearBuilt)) : undefined;
  if (!yearStr) missing.push("yearRefit");

  const guests = spec.guests_sleeping ?? detail.guests ?? basic?.guests_sleeping ?? undefined;
  if (!guests) missing.push("guests");

  const cabins = spec.cabins ?? detail.cabins ?? basic?.cabins;
  const breakdown =
    normaliseCabinConfig(detail.cabin_config) ??
    breakdownFromCounts(spec) ??
    (basic ? breakdownFromCounts(basic) : undefined);
  const staterooms = cabins ? { count: cabins, breakdown: breakdown ?? "" } : undefined;
  if (!staterooms) missing.push("staterooms");
  else if (!breakdown) missing.push("staterooms.breakdown");

  const location = entry.location ?? spec.summer_base_port ?? basic?.summer_base_port ?? undefined;
  if (!location) missing.push("location");

  // Resolve the target season's operating areas to names via the reference data.
  let cruisingArea = entry.cruisingArea;
  if (!cruisingArea && targetSeason) {
    const areaIds =
      brochure?.operating_areas?.[String(targetSeason.id)] ??
      basic?.operating_areas_new?.find((o) => o.season_id === targetSeason.id)?.areas ??
      [];
    const names = areaIds
      .map((id) => reference.areasById.get(id))
      .filter(Boolean);
    if (names.length) cruisingArea = names.join(", ").toUpperCase();
  }
  if (!cruisingArea) missing.push("cruisingArea");

  // Weekly rate: target-season min_rate; note when it is really a range.
  let weeklyRateEUR;
  let weeklyRateIsFrom = false;
  if (typeof entry.weeklyRate === "number") {
    weeklyRateEUR = entry.weeklyRate;
  } else if (targetSeason) {
    const priceRow =
      brochure?.prices?.[String(targetSeason.id)]?.[0] ??
      basic?.rates?.find((r) => r.season_id === targetSeason.id);
    if (priceRow && priceRow.min_rate != null) {
      if ((priceRow.currency ?? "EUR") === "EUR") {
        weeklyRateEUR = priceRow.min_rate;
        weeklyRateIsFrom = priceRow.max_rate != null && priceRow.max_rate !== priceRow.min_rate;
      } else {
        report.notes.push(`rate for ${TARGET_SEASON.label} is in ${priceRow.currency}, not EUR — hidden until converted (use the weeklyRate override)`);
      }
    }
  }
  if (weeklyRateEUR == null) missing.push(`weeklyRate (${TARGET_SEASON.label})`);

  // Null-rate seasons, resolved to names, for the report.
  for (const [seasonId, rows] of Object.entries(brochure?.prices ?? {})) {
    if (rows?.[0] && rows[0].min_rate == null && rows[0].max_rate == null) {
      report.nullRateSeasons.push(reference.seasonLabel(Number(seasonId)));
    }
  }

  if (basic?.seasons_unavailable?.includes(targetSeason?.id)) {
    report.notes.push(`marked unavailable for ${TARGET_SEASON.label} in Yachtfolio (seasons_unavailable)`);
  }

  if (!entry.availability) missing.push("availability (set the override in config/yachts.json)");
  if (!entry.notes) missing.push("notes (consultant note — set the override in config/yachts.json)");

  const byCategory = (cat) => files.filter((f) => f.category === cat).map((f) => f.url);
  const exterior = byCategory("EXTERIOR");
  const lifestyle = byCategory("LIFESTYLE");
  const interior = byCategory("INTERIOR");
  const leadImageUrl = entry.heroImage ?? exterior[0] ?? lifestyle[0] ?? interior[0];
  if (!leadImageUrl) missing.push("leadImage");
  const interiorImageUrl = interior[0] ?? leadImageUrl;
  const deckImageUrl = exterior[1] ?? lifestyle[1] ?? leadImageUrl;
  const watertoysImageUrl = lifestyle[0] ?? leadImageUrl;
  if (!interior[0]) missing.push("interior image (lead reused)");
  if (!lifestyle[0]) missing.push("lifestyle image (lead reused)");

  const description = ds === "text" ? stripHtml(detail.text_specs) ?? stripHtml(brochure?.general?.general_description) : stripHtml(brochure?.general?.general_description);
  const keyFeatures = (brochure?.key_features ?? [])
    .map((f) => stripHtml(f?.content))
    .filter(Boolean);

  return {
    id: entry.slug ?? slugify(name),
    yachtfolioId: entry.id,
    name: name.toUpperCase(),
    ...(entry.headline ? { tagline: String(entry.headline).toUpperCase() } : {}),
    ...(lengthM ? { lengthM } : {}),
    ...(yearStr ? { yearRefit: yearStr } : {}),
    ...(guests ? { guests } : {}),
    ...(staterooms ? { staterooms } : {}),
    ...(location ? { location } : {}),
    ...(cruisingArea ? { cruisingArea } : {}),
    ...(entry.availability ? { availability: entry.availability } : {}),
    ...(weeklyRateEUR != null ? { weeklyRateEUR, weeklyRateIsFrom } : {}),
    apaPct: APA_PCT,
    ...(entry.notes ? { notes: entry.notes } : {}),
    ...(leadImageUrl ? { leadImageUrl } : {}),
    ...(interiorImageUrl ? { interiorImageUrl } : {}),
    ...(deckImageUrl ? { deckImageUrl } : {}),
    ...(watertoysImageUrl ? { watertoysImageUrl } : {}),
    brochureUrl: entry.brochureUrl ?? "#",
    ...(description ? { description } : {}),
    ...(keyFeatures.length ? { keyFeatures } : {}),
    gallery: files.map(({ url, smallUrl, category }) => ({ url, smallUrl, category })),
  };
}

/* ----------------------------------------------------------------- report */

function renderReport({ mode, list, targetSeason, shapeNotes, yachtReports }) {
  const lines = [];
  lines.push("# Yachtfolio fetch report");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Mode: ${mode}`);
  if (targetSeason) {
    lines.push(`Rate season: ${targetSeason.name} ${targetSeason.year} (Yachtfolio season id ${targetSeason.id})`);
  }
  lines.push("");

  if (warnings.length) {
    lines.push("## Warnings");
    lines.push("");
    for (const w of warnings) lines.push(`- ${w}`);
    lines.push("");
  }

  if (shapeNotes) {
    lines.push("## Live shape vs documentation (v1.2)");
    lines.push("");
    if (shapeNotes.length === 0) {
      lines.push("No differences found between the live brochure response and the documented shape.");
    } else {
      lines.push("The live brochure response differs from the 2023 documentation:");
      lines.push("");
      for (const n of shapeNotes) lines.push(`- ${n}`);
    }
    lines.push("");
  }

  for (const r of yachtReports ?? []) {
    lines.push(`## ${r.name} (Yachtfolio id ${r.id})`);
    lines.push("");
    lines.push(`- Available flag (\`general.available\`): ${r.available}`);
    lines.push(`- Data source: ${r.dataSource}`);
    const counts = Object.entries(r.imageCounts)
      .map(([cat, c]) => `${cat} ${c.downloaded}/${c.api}`)
      .join(", ");
    lines.push(`- Images (downloaded/in API): ${counts || "none"}`);
    lines.push(`- Missing fields: ${r.missingFields.length ? r.missingFields.join(", ") : "none"}`);
    lines.push(`- Seasons with null rates: ${r.nullRateSeasons.length ? [...new Set(r.nullRateSeasons)].join(", ") : "none"}`);
    for (const n of r.notes) lines.push(`- Note: ${n}`);
    if (r.error) lines.push(`- ERROR: ${r.error}`);
    lines.push("");
  }

  if (list) {
    lines.push("## Yacht list (`type=list`) — pick curated yachts from these IDs");
    lines.push("");
    lines.push("| ID | Name | Registry port |");
    lines.push("| --- | --- | --- |");
    for (const y of list) {
      lines.push(`| ${y.id} | ${y.name ?? ""} | ${y.registry_port ?? ""} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function writeReport(report) {
  await mkdir(SAMPLES_DIR, { recursive: true });
  const rendered = renderReport(report);
  await writeFile(REPORT_PATH, rendered, "utf8");
  console.log(`[yachtfolio] report written to ${path.relative(ROOT, REPORT_PATH)}`);
  // Vercel builds cannot commit their output back to the repo, so echo the
  // report into the build log where it can be read and copied.
  console.log("[yachtfolio] ----- BEGIN FETCH REPORT -----");
  console.log(rendered);
  console.log("[yachtfolio] ----- END FETCH REPORT -----");
}

/* ------------------------------------------------------------------- main */

async function main() {
  const config = await readJsonIfExists(CONFIG_PATH, { yachts: [] });
  const curated = config.yachts ?? [];
  const maxPerCategory = config.maxImagesPerCategory ?? 4;
  const passkey = await loadPasskey();

  if (!passkey) {
    warn(
      "YACHTFOLIO_PASSKEY is not set — skipping the Yachtfolio fetch. " +
        "The build continues with the last committed data (demo content if none was ever fetched)."
    );
    const existing = await readJsonIfExists(DATA_PATH, null);
    if (!existing || existing.source !== "yachtfolio") {
      await mkdir(path.dirname(DATA_PATH), { recursive: true });
      await writeFile(DATA_PATH, JSON.stringify({ source: "demo", yachts: [] }, null, 2) + "\n", "utf8");
    } else {
      warn("Committed data/yachts.json contains real Yachtfolio data — it is used as-is but may be stale.");
    }
    await writeReport({ mode: "skipped — no passkey" });
    return;
  }

  // 1. Full yacht list (also the picking list for config/yachts.json).
  const list = (await apiGet(passkey, "api_basic.cgi", { type: "list" })).json.data;
  list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  await mkdir(YF_DIR, { recursive: true });
  await writeFile(LIST_PATH, JSON.stringify(list, null, 2) + "\n", "utf8");
  console.log(`[yachtfolio] ${list.length} yachts in the public list`);
  await sleep(REQUEST_DELAY_MS);

  // 2. Reference data (fetched once, cached for id → name resolution).
  const seasons = (await apiGet(passkey, "api_basic.cgi", { type: "seasons" })).json.data;
  await sleep(REQUEST_DELAY_MS);
  const areasPayload = (await apiGet(passkey, "api_basic.cgi", { type: "operating_areas_new" })).json.data;
  await sleep(REQUEST_DELAY_MS);
  const equipments = (await apiGet(passkey, "api_basic.cgi", { type: "equipments" })).json.data;
  await sleep(REQUEST_DELAY_MS);
  await writeFile(
    REFERENCE_PATH,
    JSON.stringify({ seasons, operating_areas: areasPayload, equipments }, null, 2) + "\n",
    "utf8"
  );

  const reference = {
    areasById: new Map((areasPayload?.areas ?? []).map((a) => [a.id, a.area_name])),
    seasonLabel(id) {
      const s = seasons.find((x) => x.id === id);
      return s ? `${s.name} ${s.year}` : `season ${id}`;
    },
  };

  const targetSeason = pickSeason(seasons, TARGET_SEASON);
  if (!targetSeason) {
    warn(
      `No season matching "${TARGET_SEASON.label}" found in the seasons reference — ` +
        "weekly rates cannot be resolved. Check data/yachtfolio/reference.json for the available seasons."
    );
  }

  const sharp = await loadSharp();
  if (!sharp) warn("sharp is not installed — run `npm install` in selection-app; image download skipped.");

  // With no curated yachts yet, still save a redacted sample brochure (first
  // listed yacht) so the live shape can be checked, then stop.
  const sampleSource = curated.length ? curated : list.slice(0, 1).map((y) => ({ id: y.id, name: y.name }));
  if (!curated.length) {
    warn("config/yachts.json has no curated yachts yet — pick IDs from the yacht list in this report.");
  }

  let shapeNotes = null;
  const yachtReports = [];
  const normalised = [];
  const manifest = await readJsonIfExists(MANIFEST_PATH, {});

  for (const [i, entry] of sampleSource.entries()) {
    const report = {
      id: entry.id,
      name: entry.name ?? `#${entry.id}`,
      available: "?",
      dataSource: "?",
      imageCounts: {},
      missingFields: [],
      nullRateSeasons: [],
      notes: [],
      maxPerCategory,
    };
    yachtReports.push(report);
    try {
      const { json: brochure, raw } = await apiGet(passkey, "api_brochure.cgi", { id_yacht: entry.id });
      await sleep(REQUEST_DELAY_MS);

      if (i === 0) {
        const samplePath = path.join(SAMPLES_DIR, `brochure-${entry.id}.json`);
        await mkdir(SAMPLES_DIR, { recursive: true });
        await writeFile(samplePath, redact(raw, passkey), "utf8");
        console.log(`[yachtfolio] redacted sample saved to ${path.relative(ROOT, samplePath)}`);
        shapeNotes = checkBrochureShape(brochure);
      }

      report.available = String(brochure?.general?.available ?? "missing");
      report.dataSource = String(brochure?.general?.data_source ?? "missing");
      if (brochure?.general?.available === false) {
        report.notes.push("e-brochure is NOT marked available by the CA — data may be incomplete");
      }

      if (!curated.length) continue; // sample/shape check only

      // Basic record: seasons_unavailable + fallback for anything the brochure lacks.
      let basic = null;
      try {
        const basicData = (await apiGet(passkey, "api_basic.cgi", { type: "yachts", id_yacht: entry.id })).json.data;
        basic = Array.isArray(basicData) ? basicData[0] : basicData;
        await sleep(REQUEST_DELAY_MS);
      } catch (err) {
        report.notes.push(`basic record fallback failed: ${redact(String(err.message ?? err), passkey)}`);
      }

      const listEntry = list.find((y) => y.id === entry.id);
      report.name = entry.name ?? listEntry?.name ?? basic?.yacht_name ?? report.name;
      const slug = entry.slug ?? slugify(entry.name ?? listEntry?.name ?? basic?.yacht_name ?? String(entry.id));
      const files = sharp
        ? await downloadImages({ passkey, sharp, slug, galleries: brochure?.galleries, manifest, report })
        : [];

      normalised.push(
        normaliseYacht({ entry: { ...entry, slug }, listEntry, brochure, basic, reference, targetSeason, files, report })
      );
    } catch (err) {
      report.error = redact(String(err.message ?? err), passkey);
      warn(`yacht ${entry.id}: ${report.error}`);
    }
  }

  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  if (curated.length && normalised.length) {
    await mkdir(path.dirname(DATA_PATH), { recursive: true });
    await writeFile(
      DATA_PATH,
      JSON.stringify(
        { source: "yachtfolio", generatedAt: new Date().toISOString(), targetSeason: TARGET_SEASON.label, yachts: normalised },
        null,
        2
      ) + "\n",
      "utf8"
    );
    console.log(`[yachtfolio] wrote ${normalised.length} yachts to ${path.relative(ROOT, DATA_PATH)}`);
  } else if (curated.length) {
    warn("Every curated yacht failed to fetch — keeping the previous data/yachts.json untouched.");
  }

  await writeReport({
    mode: curated.length ? `fetched ${normalised.length}/${curated.length} curated yachts` : "list + sample only (no curated yachts configured)",
    list,
    targetSeason,
    shapeNotes,
    yachtReports,
  });
}

main().catch(async (err) => {
  // Never break the build: log, try to leave a report behind, exit cleanly.
  const passkey = await loadPasskey().catch(() => null);
  warn(`fetch failed: ${redact(String(err?.message ?? err), passkey ?? "")}`);
  try {
    await writeReport({ mode: "FAILED — see warnings" });
  } catch {
    /* reporting is best-effort */
  }
  process.exitCode = 0;
});
