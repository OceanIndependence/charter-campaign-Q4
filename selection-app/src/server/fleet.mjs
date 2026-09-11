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
  fetchBasicList,
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
  basePort,
  buildReference,
  checkBrochureShape,
  describeRawShape,
  extractRateOptions,
  extractYachtFacts,
  parseMetres,
  pickSeason,
} from "./yachtfolio/normalise.mjs";
import { cropToSizes, selectGalleryImages } from "./yachtfolio/images.mjs";
import { blobOps, getJson, hashBytes, hashJson, isDryRun, putFile, putJson, putJsonIfChanged } from "./storage.mjs";
import { demoDetail, demoFleet, demoImages, isDemoFleet } from "./demo/fleet.mjs";

const FLEET_KEY = "yachtfolio/fleet.json";
const REFERENCE_KEY = "yachtfolio/reference.json";
const detailKey = (yfId) => `yachtfolio/details/${yfId}.json`;
/**
 * The single source of truth for what the refresh has written to Blob:
 * per yacht, a hash of its normalised facts and, per gallery image, the
 * passkey-stripped source URL, the hash of the processed bytes and the
 * public URLs written. Read once per run, written once if it changed.
 */
const MANIFEST_KEY = "private/fleet-manifest.json";
const MANIFEST_VERSION = 1;

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
const DETAIL_SCHEMA_VERSION = 11;
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
    demoFleet: isDemoFleet(),
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

/* -------------------------------------------------------------- manifest */

function emptyManifest() {
  return { version: MANIFEST_VERSION, updatedAt: null, fleetHash: null, referenceHash: null, fleetCheckedAt: null, yachts: {} };
}

/**
 * Start a refresh run: load the manifest once. A missing or unreadable
 * manifest is reported loudly and treated as empty — every item is then
 * "new", the run still succeeds, and the manifest is rebuilt at the end.
 */
async function startRun(label) {
  const stats = {
    label,
    dryRun: isDryRun(),
    manifest: "loaded",
    yachtsChecked: 0,
    yachtsWritten: 0,
    yachtsSkipped: 0,
    imagesChecked: 0,
    imagesWritten: 0,
    imagesSkipped: 0,
    imagesRemoved: [],
    notes: [],
  };
  let manifest = null;
  try {
    manifest = await getJson(MANIFEST_KEY);
  } catch (err) {
    stats.notes.push(`manifest unreadable (${String(err?.message ?? err)}) — treating every item as new and rebuilding it.`);
  }
  if (!manifest || manifest.version !== MANIFEST_VERSION || typeof manifest.yachts !== "object") {
    if (manifest) stats.notes.push("manifest present but not in the expected shape — rebuilding it.");
    else if (!stats.notes.length) stats.notes.push("no manifest yet (first run) — treating every item as new and building it.");
    stats.manifest = "rebuilt";
    manifest = emptyManifest();
  }
  if (stats.dryRun) stats.notes.push("FLEET_REFRESH_DRY_RUN=true — comparisons made, no Blob writes.");
  for (const n of stats.notes) console.log(`[fleet:${label}] ${n}`);
  return { manifest, stats, dirty: false, touched: new Set(), opsAt: blobOps() };
}

/**
 * End a run: write the manifest once, only if something changed. To limit
 * lost updates between concurrent on-demand requests, the stored copy is
 * re-read and only the entries this run touched are merged into it.
 */
async function finishRun(run) {
  if (run.dirty) {
    let base = null;
    try {
      base = await getJson(MANIFEST_KEY);
    } catch {
      base = null;
    }
    const merged =
      base && base.version === MANIFEST_VERSION && typeof base.yachts === "object" ? base : emptyManifest();
    for (const k of ["fleetHash", "referenceHash", "fleetCheckedAt"]) {
      if (run.touched.has(k)) merged[k] = run.manifest[k];
    }
    for (const id of run.touched) {
      if (run.manifest.yachts[id]) merged.yachts[id] = run.manifest.yachts[id];
    }
    merged.updatedAt = new Date().toISOString();
    await writeStoredJson(MANIFEST_KEY, merged);
  }
  // This run's own operations (the module counters are process-wide).
  const now = blobOps();
  const d = (k) => now[k] - run.opsAt[k];
  run.stats.blob = { puts: d("puts"), dels: d("dels"), lists: d("lists"), advanced: d("advanced"), skippedUnchanged: d("skippedUnchanged"), dryRunWrites: d("dryRunWrites") };
  console.log(`[fleet:${run.stats.label}] Blob advanced operations this run: ${run.stats.blob.advanced} (put ${run.stats.blob.puts}, list ${run.stats.blob.lists})${run.stats.dryRun ? ` — dry run suppressed ${run.stats.blob.dryRunWrites} write(s)` : ""}`);
  return run.stats;
}

/** A yacht's manifest entry, created on first sight. */
function manifestYacht(run, yfId) {
  const id = String(yfId);
  run.manifest.yachts[id] ??= { detailHash: null, images: {} };
  return run.manifest.yachts[id];
}

/** Yachtfolio media URLs embed the passkey — strip it before storing or logging. */
function stripSecret(url) {
  try {
    const u = new URL(url);
    u.searchParams.delete("api");
    u.searchParams.delete("passkey");
    return u.toString();
  } catch {
    return String(url).replace(/([?&])(api|passkey)=[^&]*/gi, "$1").replace(/[?&]+$/, "");
  }
}

/** Write a JSON document if its hash differs from the recorded one; record the new hash. */
async function writeIfChanged(run, key, value, recordedHash, record) {
  try {
    const { written, hash } = await putJsonIfChanged(key, value, recordedHash);
    if (written) {
      record(hash);
      run.dirty = true;
    }
    return written;
  } catch (err) {
    lastStorageError = String(err?.message ?? err);
    console.warn(`[fleet] storage write failed for ${key}: ${lastStorageError}`);
    return false;
  }
}

/**
 * Builder, length and summer base port for every yacht, from the one-call
 * basic list. When that call fails (or returns nothing) the values from the
 * previous cache are kept, so a transient error never blanks the picker.
 */
async function fetchFleetFacts(passkey, previous, stats) {
  const facts = new Map();
  for (const y of previous?.yachts ?? []) {
    if (y.builder || y.lengthM != null || y.basePort) {
      facts.set(y.id, { builder: y.builder ?? "", lengthM: y.lengthM ?? null, basePort: y.basePort ?? "" });
    }
  }
  try {
    const rows = await fetchBasicList(passkey);
    let seen = 0;
    for (const row of rows) {
      const id = Number(row?.id_yacht ?? row?.id);
      if (!Number.isFinite(id)) continue;
      seen += 1;
      facts.set(id, {
        builder: String(row.builder ?? "").trim(),
        lengthM: parseMetres(row.length_metric ?? row.length_metres ?? row.length) ?? null,
        basePort: basePort(row.summer_base_port) ?? "",
      });
    }
    if (!seen) stats.notes.push("basic yacht list returned no rows — picker facts (builder, length) kept from the previous sync.");
  } catch (err) {
    const msg = redact(String(err?.message ?? err), passkey);
    stats.notes.push(`basic yacht list unavailable (${msg}) — picker facts (builder, length) kept from the previous sync.`);
    console.warn(`[fleet:sync] ${stats.notes[stats.notes.length - 1]}`);
  }
  return facts;
}

export async function syncFleet() {
  if (isDemoFleet()) {
    // No passkey: nothing to sync. The demo set is served instead so the
    // portal keeps working; say so rather than failing the cron.
    const fleet = demoFleet();
    console.warn("[fleet:sync] YACHTFOLIO_PASSKEY is not configured — serving the demo fleet, nothing synced.");
    return { count: fleet.count, removedCount: 0, syncedAt: fleet.syncedAt, persisted: false, demo: true, notes: ["demo fleet — no passkey"] };
  }
  const passkey = await passkeyOrThrow();
  const run = await startRun("sync");
  const previous = (await readStoredJson(FLEET_KEY)) ?? memoryFleet;

  const list = await fetchFleetList(passkey);
  await sleep(REQUEST_DELAY_MS);
  const reference = await fetchReferenceData(passkey);
  await sleep(REQUEST_DELAY_MS);
  const facts = await fetchFleetFacts(passkey, previous, run.stats);

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
    yachts: list.map((y) => ({
      id: y.id,
      name: y.name,
      registryPort: y.registry_port ?? "",
      // Builder, length and summer base port let the form's picker tell two
      // yachts of the same name apart; "" / null when Yachtfolio has none.
      builder: facts.get(y.id)?.builder ?? "",
      lengthM: facts.get(y.id)?.lengthM ?? null,
      basePort: facts.get(y.id)?.basePort ?? "",
    })),
    removed,
  };
  memoryFleet = fleet;
  memoryReference = reference;

  // Persist only what changed. The hash excludes syncedAt so an unchanged
  // fleet costs no write; the check time is recorded in the manifest so the
  // cached list still counts as fresh.
  const { syncedAt: _syncedAt, ...fleetContent } = fleet;
  const fleetContentHash = hashJson(fleetContent);
  let fleetWritten = false;
  if (fleetContentHash !== run.manifest.fleetHash) {
    fleetWritten = await writeStoredJson(FLEET_KEY, fleet);
    if (fleetWritten) {
      run.manifest.fleetHash = fleetContentHash;
      run.touched.add("fleetHash");
    }
  }
  const referenceWritten = await writeIfChanged(run, REFERENCE_KEY, reference, run.manifest.referenceHash, (h) => {
    run.manifest.referenceHash = h;
    run.touched.add("referenceHash");
  });
  run.manifest.fleetCheckedAt = fleet.syncedAt;
  run.touched.add("fleetCheckedAt");
  run.dirty = true;
  const stats = await finishRun(run);
  return {
    count: fleet.count,
    removedCount: Object.keys(removed).length,
    syncedAt: fleet.syncedAt,
    persisted: !stats.dryRun,
    fleetWritten,
    referenceWritten,
    blob: stats.blob,
    dryRun: stats.dryRun,
    manifest: stats.manifest,
    notes: stats.notes,
  };
}

/** The cached fleet list; bootstraps from the live API when missing/stale. */
export async function getFleet() {
  if (isDemoFleet()) return demoFleet();
  let fleet = (await readStoredJson(FLEET_KEY)) ?? memoryFleet;
  // An unchanged list is not rewritten, so its syncedAt can be old; the
  // manifest records when it was last checked against Yachtfolio.
  let checkedAt = fleet?.syncedAt ?? 0;
  try {
    const m = await getJson(MANIFEST_KEY);
    if (m?.fleetCheckedAt && Date.parse(m.fleetCheckedAt) > Date.parse(checkedAt)) checkedAt = m.fleetCheckedAt;
  } catch {
    /* manifest unavailable — fall back to the stored syncedAt */
  }
  const stale = !fleet || Date.now() - Date.parse(checkedAt) > FLEET_STALE_MS;
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
  if (isDemoFleet()) {
    const demo = demoDetail(yfId);
    if (!demo) throw Object.assign(new Error("No such demo yacht."), { code: "NOT_FOUND" });
    return demo;
  }
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
    // LOCATION on the form and the client pages is the summer base port;
    // the season's operating areas are kept for the Tier 2 destination pre-tick.
    cruisingArea: facts.location ?? "",
    operatingAreas: facts.cruisingArea ?? "",
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

  // Write only when the normalised facts changed (fetchedAt excluded).
  const run = await startRun("detail");
  const entry = manifestYacht(run, yfId);
  const { fetchedAt: _fetchedAt, ...content } = detail;
  const contentHash = hashJson(content);
  run.stats.yachtsChecked = 1;
  if (contentHash !== entry.detailHash) {
    if (await writeStoredJson(detailKey(yfId), detail)) {
      entry.detailHash = contentHash;
      run.touched.add(String(yfId));
      run.dirty = true;
      run.stats.yachtsWritten = 1;
    }
  } else {
    run.stats.yachtsSkipped = 1;
  }
  detail.blob = await finishRun(run);
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
 * The prepared gallery and default slot images for one yacht, driven by the
 * manifest: a gallery image whose passkey-stripped source URL is already
 * recorded is reused without downloading, processing or writing; only
 * unseen URLs are cropped and written (two sizes each). Nothing is listed
 * and nothing is deleted — images that have left the Yachtfolio gallery are
 * reported so they can be dealt with separately.
 */
export async function getYachtImages(yfId) {
  if (isDemoFleet()) {
    const demo = demoImages(yfId);
    if (!demo) throw Object.assign(new Error("No such demo yacht."), { code: "NOT_FOUND" });
    return demo;
  }
  const passkey = await passkeyOrThrow();
  const run = await startRun("images");
  const entry = manifestYacht(run, yfId);
  const brochure = await brochureFor(passkey, yfId);
  const selected = selectGalleryImages(brochure?.galleries, GALLERY_MAX_PER_CATEGORY);
  const notes = [];
  const prefix = `yachtfolio/images/${yfId}/`;
  const seen = new Set();

  const processed = await mapLimit(selected, IMAGE_CONCURRENCY, async ({ category, image, baseName }, i) => {
    const source = stripSecret(image.url);
    seen.add(source);
    run.stats.imagesChecked += 1;
    const known = entry.images[source];
    if (known?.url && known?.smallUrl) {
      run.stats.imagesSkipped += 1;
      return { id: image.id_file, category, url: known.url, smallUrl: known.smallUrl, filename: image.filename ?? null };
    }
    const keyBase = `${prefix}${baseName}-${image.id_file}`;
    const keys = { large: `${keyBase}.jpg`, small: `${keyBase}-sm.jpg` };
    try {
      await sleep(IMAGE_START_DELAY_MS * (i % IMAGE_CONCURRENCY));
      const res = await fetch(image.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      const sizes = await cropToSizes(bytes);
      const urls = {};
      let hash = null;
      await Promise.all(
        sizes.map(async (size) => {
          const key = size.suffix === "-sm" ? keys.small : keys.large;
          if (size.suffix === "") hash = hashBytes(size.buffer);
          urls[size.suffix === "-sm" ? "small" : "large"] = await putFile(key, size.buffer, "image/jpeg");
        })
      );
      entry.images[source] = { hash, url: urls.large, smallUrl: urls.small, key: keys.large, category, id: image.id_file };
      run.touched.add(String(yfId));
      run.dirty = true;
      run.stats.imagesWritten += 1;
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

  // Images recorded earlier that Yachtfolio no longer returns: keep them,
  // report them (the decision to delete is taken separately).
  for (const [source, rec] of Object.entries(entry.images)) {
    if (!seen.has(source)) run.stats.imagesRemoved.push(rec.key ?? source);
  }
  if (run.stats.imagesRemoved.length) {
    notes.push(`${run.stats.imagesRemoved.length} image(s) no longer in the Yachtfolio gallery are still stored: ${run.stats.imagesRemoved.join(", ")}`);
  }

  // Default slot assignment. The lead is always the yacht's profile shot from
  // Yachtfolio (the FULL gallery, else the first exterior) — never another
  // category. Each other slot takes the first unused image of its own
  // category; when Yachtfolio has none in that category, an image from the
  // other categories is chosen (unused first) by a pick that is stable for
  // this yacht, so repeated runs never differ. The consultant can change any
  // of these in the form's picker.
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
  let salt = 0;
  const stableFrom = (urls) => {
    if (!urls.length) return undefined;
    salt += 1;
    const seed = parseInt(hashJson(`${yfId}:${salt}`).slice(0, 8), 16);
    return urls[seed % urls.length];
  };
  const unused = (urls) => urls.filter((u) => !used.has(u));
  const pick = (own, others) =>
    take(unused(own)[0] ?? stableFrom(unused(others)) ?? stableFrom(own) ?? stableFrom(others));
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
  const exteriorForSlot = ranked.length ? ranked : exterior;
  const interiorImageUrl = pick(interior, [...exteriorForSlot, ...lifestyle]);
  const exteriorImageUrl = pick(exteriorForSlot, [...lifestyle, ...interior]);
  const lifestyleImageUrl = pick(lifestyle, [...exterior, ...interior]);
  if (files.length) {
    for (const [cat, list] of [["interior", interior], ["exterior", exterior], ["lifestyle", lifestyle]]) {
      if (!list.length) notes.push(`no ${cat} images in Yachtfolio — another image was chosen for that slot; change it in the picker if needed.`);
    }
  }

  const stats = await finishRun(run);
  return {
    yfId,
    fetchedAt: new Date().toISOString(),
    gallery: files,
    leadImageUrl,
    interiorImageUrl,
    exteriorImageUrl,
    lifestyleImageUrl,
    warnings: notes,
    blob: stats,
  };
}
