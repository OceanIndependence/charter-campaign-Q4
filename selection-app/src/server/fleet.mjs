/**
 * Fleet service — SERVER-ONLY.
 *
 * The consultant form never talks to Yachtfolio directly: the browser calls
 * GET /api/fleet (this cache) and GET /api/fleet/:yfId (on-demand detail).
 * A nightly cron calls syncFleet(); images are processed only for yachts a
 * consultant actually picks — never pre-fetched for the whole fleet.
 */

import {
  REQUEST_DELAY_MS,
  fetchBasicRecord,
  fetchBrochure,
  fetchFleetList,
  fetchReferenceData,
  loadPasskey,
  redact,
  sleep,
} from "./yachtfolio/client.mjs";
import {
  TARGET_SEASON,
  buildReference,
  checkBrochureShape,
  describeRawShape,
  extractRateOptions,
  extractYachtFacts,
  pickSeason,
} from "./yachtfolio/normalise.mjs";
import { cropToSizes, selectGalleryImages } from "./yachtfolio/images.mjs";
import { getJson, listImageFiles, putFile, putJson } from "./storage.mjs";

const FLEET_KEY = "yachtfolio/fleet.json";
const REFERENCE_KEY = "yachtfolio/reference.json";
const detailKey = (yfId) => `yachtfolio/details/${yfId}.json`;
const imagesKey = (yfId) => `yachtfolio/images/${yfId}/manifest.json`;

const FLEET_STALE_MS = 36 * 60 * 60 * 1000; // lazy re-sync if the cron hasn't run
const DETAIL_FRESH_MS = 6 * 60 * 60 * 1000; // rates change; don't serve stale for long
// Download the whole gallery (capped per category) so the consultant can pick
// which image fills each page slot; the default slot assignment takes the
// first of each category, falling back to another category at random.
const GALLERY_MAX_PER_CATEGORY = 5;
// Images are processed a few at a time with a short stagger — well inside
// Yachtfolio's 800 calls per five minutes.
const IMAGE_CONCURRENCY = 4;
const IMAGE_START_DELAY_MS = 150;
// Bump to invalidate cached facts / image manifests after a normalisation
// change — old caches re-fetch.
const DETAIL_SCHEMA_VERSION = 9;
const IMAGES_SCHEMA_VERSION = 2;
// The facts request fetches the brochure; the images request that follows a
// moment later reuses it from here instead of calling Yachtfolio again.
const BROCHURE_MEMO_MS = 5 * 60 * 1000;
const brochureMemo = new Map();

async function passkeyOrThrow() {
  const passkey = await loadPasskey([process.cwd()]);
  if (!passkey) {
    throw new Error("YACHTFOLIO_PASSKEY is not configured on the server.");
  }
  return passkey;
}

/**
 * Belt-and-braces cache in module scope: keeps the portal working when
 * durable storage is missing or broken (serverless instances are reused,
 * so this survives across requests within an instance).
 */
let memoryFleet = null;
let lastStorageError = null;

/** Diagnostics for /api/health and error responses (no secrets). */
export function fleetDiagnostics() {
  return {
    passkeyConfigured: Boolean(process.env.YACHTFOLIO_PASSKEY),
    lastStorageError,
    memoryCache: memoryFleet ? { syncedAt: memoryFleet.syncedAt, count: memoryFleet.count } : null,
  };
}

/** A short, safe explanation of why a fleet call failed. */
export function describeFleetFailure(err) {
  const msg = String(err?.message ?? err);
  if (msg.includes("YACHTFOLIO_PASSKEY")) {
    return "The server is missing the YACHTFOLIO_PASSKEY environment variable.";
  }
  if (/private store/i.test(msg)) {
    return "The connected Blob store is private — create one with public access (client pages must load the images directly) and connect that instead.";
  }
  if (/BLOB_READ_WRITE_TOKEN|Vercel Blob|blob\.vercel|EROFS|EACCES|ENOSPC|read-only/i.test(msg)) {
    return "Storage is not available — connect a Vercel Blob store to the project (Storage tab) and redeploy.";
  }
  return "Yachtfolio did not respond — see the server logs for detail.";
}

/**
 * Pull the charter fleet list from Yachtfolio into the cache. Records
 * yachts that have disappeared since the previous sync (kept until they
 * reappear) so the form can warn on drafts and published pages that
 * reference them.
 */
let memoryReference = null;

async function readStoredJson(key) {
  try {
    return await getJson(key);
  } catch (err) {
    lastStorageError = String(err?.message ?? err);
    console.warn(`[fleet] storage read failed for ${key}: ${lastStorageError}`);
    return null;
  }
}

async function writeStoredJson(key, value) {
  try {
    await putJson(key, value);
    return true;
  } catch (err) {
    lastStorageError = String(err?.message ?? err);
    console.warn(`[fleet] storage write failed for ${key}: ${lastStorageError}`);
    return false;
  }
}

export async function syncFleet() {
  const passkey = await passkeyOrThrow();
  const previous = (await readStoredJson(FLEET_KEY)) ?? memoryFleet;

  const list = await fetchFleetList(passkey);
  await sleep(REQUEST_DELAY_MS);
  const reference = await fetchReferenceData(passkey);

  const currentIds = new Set(list.map((y) => y.id));
  const removed = { ...(previous?.removed ?? {}) };
  for (const id of Object.keys(removed)) {
    if (currentIds.has(Number(id))) delete removed[id]; // reappeared
  }
  for (const y of previous?.yachts ?? []) {
    if (!currentIds.has(y.id)) {
      removed[String(y.id)] ??= { name: y.name, removedAt: new Date().toISOString() };
    }
  }

  const fleet = {
    syncedAt: new Date().toISOString(),
    count: list.length,
    yachts: list.map((y) => ({ id: y.id, name: y.name, registryPort: y.registry_port ?? "" })),
    removed,
  };
  memoryFleet = fleet;
  memoryReference = reference;
  // Persist best-effort: a broken store must not take down a list we already hold.
  const persisted =
    (await writeStoredJson(FLEET_KEY, fleet)) && (await writeStoredJson(REFERENCE_KEY, reference));
  return {
    count: fleet.count,
    removedCount: Object.keys(removed).length,
    syncedAt: fleet.syncedAt,
    persisted,
  };
}

/** The cached fleet list; bootstraps from the live API when missing/stale. */
export async function getFleet() {
  let fleet = (await readStoredJson(FLEET_KEY)) ?? memoryFleet;
  const stale = !fleet || Date.now() - Date.parse(fleet.syncedAt ?? 0) > FLEET_STALE_MS;
  if (stale) {
    try {
      await syncFleet();
      fleet = memoryFleet;
    } catch (err) {
      if (!fleet) throw err;
      // Serve the stale cache rather than failing the form.
      console.warn(`[fleet] re-sync failed, serving stale cache: ${String(err?.message ?? err)}`);
    }
  }
  return fleet;
}

async function getReference(passkey) {
  const cached = (await readStoredJson(REFERENCE_KEY)) ?? memoryReference;
  if (cached?.seasons?.length) return cached;
  const reference = await fetchReferenceData(passkey);
  memoryReference = reference;
  await writeStoredJson(REFERENCE_KEY, reference);
  return reference;
}

/**
 * On-demand facts for one yacht: brochure + basic record, normalised to the
 * form's fields — text and numbers only, so the form fills within a couple
 * of seconds. Images are a separate, slower call (getYachtImages). Cached
 * for a few hours.
 */
export async function getYachtDetail(yfId, { forceRefresh = false, debug = false } = {}) {
  const cached = await readStoredJson(detailKey(yfId));
  if (
    !forceRefresh &&
    !debug &&
    cached &&
    cached.schemaVersion === DETAIL_SCHEMA_VERSION &&
    Date.now() - Date.parse(cached.fetchedAt ?? 0) < DETAIL_FRESH_MS
  ) {
    return cached;
  }

  const passkey = await passkeyOrThrow();
  const referenceData = await getReference(passkey);
  const reference = buildReference(referenceData);
  const targetSeason = pickSeason(reference.seasons);

  const { json: brochure } = await fetchBrochure(passkey, yfId);
  brochureMemo.set(yfId, { brochure, at: Date.now() });
  await sleep(REQUEST_DELAY_MS);
  let basic = null;
  try {
    basic = await fetchBasicRecord(passkey, yfId);
  } catch (err) {
    console.warn(`[fleet] basic record for ${yfId} failed: ${redact(String(err?.message ?? err), passkey)}`);
  }

  const facts = extractYachtFacts({ brochure, basic, reference, targetSeason });
  const rateOptions = extractRateOptions({ brochure, basic, reference });

  const detail = {
    yfId,
    schemaVersion: DETAIL_SCHEMA_VERSION,
    fetchedAt: new Date().toISOString(),
    targetSeason: TARGET_SEASON.label,
    name: (facts.name ?? "").toUpperCase(),
    lengthM: facts.lengthM ?? null,
    yearRefit: facts.yearRefit ?? "",
    guests: facts.guests ?? null,
    crew: facts.crew ?? null,
    builder: facts.builder ?? "",
    staterooms: facts.staterooms
      ? facts.staterooms.breakdown
        ? `${facts.staterooms.count} (${facts.staterooms.breakdown})`
        : String(facts.staterooms.count)
      : "",
    cruisingArea: facts.cruisingArea ?? "",
    // facts.notes carries the seasons_unavailable warning for the form to surface.
    // Currency carried through as-is; APA/VAT are the consultant's, not fetched.
    // Default auto-fill is summer 2027 low; the form can switch season/tier
    // from rateOptions without re-fetching.
    currency: facts.currency ?? "EUR",
    weeklyRate: facts.weeklyRate ?? null,
    weeklyRateIsFrom: facts.weeklyRateIsFrom,
    rateSeason: "summer",
    rateTier: "low",
    rateOptions,
    description: facts.description ?? "",
    keyFeatures: facts.keyFeatures,
    dataSource: facts.dataSource ?? null,
    missing: facts.missing,
    warnings: facts.notes,
  };

  await writeStoredJson(detailKey(yfId), detail);
  if (debug) {
    // Raw-shape diagnostics for locating fields the 2023 doc does not
    // describe (e.g. the e-brochure link). Response-only, never cached;
    // every string is passkey-redacted before it leaves the server.
    const shape = describeRawShape(brochure, basic);
    return {
      ...detail,
      _debug: {
        ...shape,
        yachtfolioLinks: shape.yachtfolioLinks.map((s) => redact(s, passkey)),
        shapeNotes: checkBrochureShape(brochure),
      },
    };
  }
  return detail;
}

/** Run fn over items with at most `limit` in flight; results keep item order. */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

async function brochureFor(passkey, yfId) {
  const memo = brochureMemo.get(yfId);
  if (memo && Date.now() - memo.at < BROCHURE_MEMO_MS) return memo.brochure;
  const { json: brochure } = await fetchBrochure(passkey, yfId);
  brochureMemo.set(yfId, { brochure, at: Date.now() });
  return brochure;
}

/**
 * The prepared gallery and default slot images for one yacht. Images are
 * pulled through the crop pipeline into the public store under immutable
 * keys; what already exists is found with one listing call and reused.
 * Cached alongside the facts.
 */
export async function getYachtImages(yfId, { forceRefresh = false } = {}) {
  const cached = await readStoredJson(imagesKey(yfId));
  if (
    !forceRefresh &&
    cached &&
    cached.schemaVersion === IMAGES_SCHEMA_VERSION &&
    Date.now() - Date.parse(cached.fetchedAt ?? 0) < DETAIL_FRESH_MS
  ) {
    return cached;
  }

  const passkey = await passkeyOrThrow();
  const brochure = await brochureFor(passkey, yfId);
  const selected = selectGalleryImages(brochure?.galleries, GALLERY_MAX_PER_CATEGORY);
  const notes = [];

  const prefix = `yachtfolio/images/${yfId}/`;
  const existing = new Map();
  try {
    for (const f of await listImageFiles(prefix)) existing.set(f.key, f.url);
  } catch (err) {
    console.warn(`[fleet] image listing failed for ${yfId}: ${String(err?.message ?? err)}`);
  }

  const processed = await mapLimit(selected, IMAGE_CONCURRENCY, async ({ category, image, baseName }, i) => {
    const keyBase = `${prefix}${baseName}-${image.id_file}`;
    const keys = { large: `${keyBase}.jpg`, small: `${keyBase}-sm.jpg` };
    try {
      if (existing.has(keys.large) && existing.has(keys.small)) {
        return { id: image.id_file, category, url: existing.get(keys.large), smallUrl: existing.get(keys.small), filename: image.filename ?? null };
      }
      await sleep(IMAGE_START_DELAY_MS * (i % IMAGE_CONCURRENCY));
      const res = await fetch(image.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const source = Buffer.from(await res.arrayBuffer());
      const sizes = await cropToSizes(source);
      const urls = {};
      await Promise.all(
        sizes.map(async (size) => {
          const key = size.suffix === "-sm" ? keys.small : keys.large;
          urls[size.suffix === "-sm" ? "small" : "large"] = await putFile(key, size.buffer, "image/jpeg");
        })
      );
      return { id: image.id_file, category, url: urls.large, smallUrl: urls.small, filename: image.filename ?? null };
    } catch (err) {
      notes.push(
        `image ${redact(String(image.filename ?? image.id_file), passkey)} (${category}) failed: ` +
          redact(String(err?.message ?? err), passkey)
      );
      return null;
    }
  });
  const files = processed.filter(Boolean);

  // Default slot assignment. The lead is always the yacht's profile shot from
  // Yachtfolio (the FULL gallery, else the first exterior) — never another
  // category. Each other slot takes the first unused image of its own
  // category; when Yachtfolio has none in that category, an image from the
  // other categories is picked at random (unused first). The consultant can
  // change any of these in the form's picker.
  const byCategory = (cat) => files.filter((f) => f.category === cat).map((f) => f.url);
  const full = byCategory("FULL");
  const exterior = byCategory("EXTERIOR");
  const lifestyle = byCategory("LIFESTYLE");
  const interior = byCategory("INTERIOR");
  const used = new Set();
  const take = (url) => {
    if (url) used.add(url);
    return url ?? "";
  };
  const randomFrom = (urls) => (urls.length ? urls[Math.floor(Math.random() * urls.length)] : undefined);
  const unused = (urls) => urls.filter((u) => !used.has(u));
  const pick = (own, others) =>
    take(unused(own)[0] ?? randomFrom(unused(others)) ?? randomFrom(own) ?? randomFrom(others));
  const leadImageUrl = take(full[0] ?? exterior[0]);
  if (files.length && !leadImageUrl) {
    notes.push("no profile or exterior image in Yachtfolio — paste a lead image URL in the form.");
  }
  // The exterior slot must show a different picture from the lead. The
  // profile shot in FULL is usually the same photo as the first exterior
  // (uploaded to both), so exclude any exterior sharing the lead's source
  // filename and, when the lead is the profile shot, prefer the second
  // exterior over the first.
  const leadFile = files.find((f) => f.url === leadImageUrl);
  const notLeadPhoto = (f) =>
    f.url !== leadImageUrl && !(leadFile?.filename && f.filename && f.filename === leadFile.filename);
  const exteriorFiles = files.filter((f) => f.category === "EXTERIOR" && notLeadPhoto(f));
  const ranked =
    full.length && exteriorFiles.length > 1
      ? [...exteriorFiles.slice(1), exteriorFiles[0]].map((f) => f.url)
      : exteriorFiles.map((f) => f.url);
  // A yacht with a single exterior has nothing else: reuse it rather than
  // leaving the slot blank.
  const exteriorForSlot = ranked.length ? ranked : exterior;
  const interiorImageUrl = pick(interior, [...exteriorForSlot, ...lifestyle]);
  const exteriorImageUrl = pick(exteriorForSlot, [...lifestyle, ...interior]);
  const lifestyleImageUrl = pick(lifestyle, [...exterior, ...interior]);
  if (files.length) {
    for (const [cat, list] of [["interior", interior], ["exterior", exterior], ["lifestyle", lifestyle]]) {
      if (!list.length) notes.push(`no ${cat} images in Yachtfolio — another image was chosen for that slot; change it in the picker if needed.`);
    }
  }

  const result = {
    yfId,
    schemaVersion: IMAGES_SCHEMA_VERSION,
    fetchedAt: new Date().toISOString(),
    gallery: files,
    leadImageUrl,
    interiorImageUrl,
    exteriorImageUrl,
    lifestyleImageUrl,
    warnings: notes,
  };
  await writeStoredJson(imagesKey(yfId), result);
  return result;
}
