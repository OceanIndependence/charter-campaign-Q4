/**
 * Fleet service — SERVER-ONLY.
 *
 * The consultant form never talks to Yachtfolio directly: the browser calls
 * GET /api/fleet (this cache) and GET /api/fleet/:yfId (on-demand detail).
 * A nightly cron calls syncFleet(); images are processed only for yachts a
 * consultant actually picks — never pre-fetched for the whole fleet. What
 * the app knows about a picked yacht lives on its record
 * (yacht-records.mjs); this module fetches, normalises and prepares.
 */

import {
  REQUEST_DELAY_MS,
  fetchBasicRecord,
  fetchBrochure,
  fetchFleetList,
  fetchMedia,
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
import { blobOps, getJson, hashBytes, hashJson, isDryRun, lastStorageError, noteStorageError, putFile, putJson, putJsonIfChanged } from "./storage.mjs";
import { demoDetail, demoFleet, demoImages, isDemoFleet } from "./demo/fleet.mjs";
import { applySpecs, factsFrom, finishPreparing, loadYachtRecord, readYachtRecord, writeYachtRecord } from "./yacht-records.mjs";
import { brochureFor, defaultSlots, galleryFileOf, mapLimit, rememberBrochure, stripSecret } from "./yachtfolio/gallery.mjs";

export { brochureFor, defaultSlots, galleryFileOf, mapLimit, stripSecret };

const FLEET_KEY = "yachtfolio/fleet.json";
const REFERENCE_KEY = "yachtfolio/reference.json";
/**
 * Fleet-level state: the hash of the last fleet list and reference data
 * written, and when the list was last checked against Yachtfolio. Per-yacht
 * state lives in yachts/<yfId>.json (yacht-records.mjs). The pre-records
 * manifest at private/fleet-manifest.json is left exactly as it was — it is
 * read, never written, by the lazy migration of yachts that have no record.
 */
const FLEET_STATE_KEY = "private/fleet-state.json";
const FLEET_STATE_VERSION = 2;
/** Rewrite the fleet state for its check time alone only this often. */
const FLEET_STATE_REWRITE_MS = 12 * 60 * 60 * 1000;
/** Rewrite a record for its lastCheckedAt alone only this often. */
const RECORD_TOUCH_MS = 12 * 60 * 60 * 1000;

const FLEET_STALE_MS = 36 * 60 * 60 * 1000; // lazy re-sync if the cron hasn't run
// Bump when the fleet list gains fields — a cached list from before is
// re-synced on the next request instead of waiting for the nightly cron.
const FLEET_SCHEMA_VERSION = 2;
// Picker facts (builder, length, summer base port) are effectively
// immutable, so they are fetched once and cached: Yachtfolio's one-call
// basic list covers the agency's own yachts (about a hundred of the 2,400 in
// the charter list); the rest are filled in nightly, a bounded number at a
// time from whatever call budget the in-use refresh leaves (nightly.mjs), or
// in batches by the backfill route. There is no whole-fleet pass.
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

/** Diagnostics for /api/health and error responses (no secrets). */
export function fleetDiagnostics() {
  const err = lastStorageError();
  return {
    passkeyConfigured: Boolean(process.env.YACHTFOLIO_PASSKEY),
    demoFleet: isDemoFleet(),
    lastStorageError: err?.message ?? null,
    lastStorageErrorAt: err?.at ?? null,
    lastStorageErrorContext: err?.context ?? null,
    memoryCache: memoryFleet ? { syncedAt: memoryFleet.syncedAt, count: memoryFleet.count } : null,
  };
}

/** A storage failure the caller must not write past. */
export function storageFailure(context, err) {
  const message = noteStorageError(context, err);
  return Object.assign(new Error(`${context}: ${message}`), { code: "STORAGE", cause: err });
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

/** A read that may serve stale data instead: null on failure (recorded), for read-only paths. */
async function readStoredJson(key) {
  try {
    return await getJson(key);
  } catch (err) {
    noteStorageError(`read ${key}`, err);
    return null;
  }
}

async function writeStoredJson(key, value) {
  try {
    await putJson(key, value);
    return true;
  } catch (err) {
    noteStorageError(`write ${key}`, err);
    return false;
  }
}

/* ---------------------------------------------------------- run counters */

/**
 * Start a run: snapshot the process-wide Blob counters so the run can report
 * exactly what it cost, and set up the stats the callers and the fetch CLI
 * read. The field names are shared with scripts/fetch-yachtfolio.mjs.
 */
function startRun(label) {
  const stats = {
    label,
    dryRun: isDryRun(),
    yachtsChecked: 0,
    yachtsWritten: 0,
    yachtsSkipped: 0,
    imagesChecked: 0,
    imagesWritten: 0,
    imagesSkipped: 0,
    imagesRemoved: [],
    notes: [],
  };
  if (stats.dryRun) stats.notes.push("FLEET_REFRESH_DRY_RUN=true — comparisons made, no Blob writes.");
  return { stats, opsAt: blobOps() };
}

/** End a run: attach this run's own Blob operation counts and log them. */
function finishRun(run) {
  const now = blobOps();
  const d = (k) => now[k] - run.opsAt[k];
  run.stats.blob = { puts: d("puts"), dels: d("dels"), lists: d("lists"), advanced: d("advanced"), skippedUnchanged: d("skippedUnchanged"), dryRunWrites: d("dryRunWrites") };
  console.log(`[fleet:${run.stats.label}] Blob advanced operations this run: ${run.stats.blob.advanced} (put ${run.stats.blob.puts}, list ${run.stats.blob.lists})${run.stats.dryRun ? ` — dry run suppressed ${run.stats.blob.dryRunWrites} write(s)` : ""}`);
  return run.stats;
}

/* ------------------------------------------------------------ fleet state */

function emptyFleetState() {
  return { version: FLEET_STATE_VERSION, updatedAt: null, fleetHash: null, referenceHash: null, fleetCheckedAt: null };
}

/**
 * The fleet state, or an empty one when none has been written yet. A
 * storage failure is not "empty": it propagates as a STORAGE error so the
 * caller writes nothing (a sync that cannot see what it last wrote would
 * otherwise rewrite everything and lose the removed-yachts history).
 */
async function readFleetState() {
  let stored;
  try {
    stored = await getJson(FLEET_STATE_KEY);
  } catch (err) {
    throw storageFailure(`read ${FLEET_STATE_KEY}`, err);
  }
  if (!stored || typeof stored !== "object") return { state: emptyFleetState(), loaded: false };
  const { fleetHash = null, referenceHash = null, fleetCheckedAt = null, updatedAt = null } = stored;
  return { state: { version: FLEET_STATE_VERSION, updatedAt, fleetHash, referenceHash, fleetCheckedAt }, loaded: true };
}

/** Write the fleet state only when a hash changed or the check time is over 12 hours old. */
async function writeFleetState(previous, next, { hashChanged }) {
  const checkedAge = previous.fleetCheckedAt ? Date.now() - Date.parse(previous.fleetCheckedAt) : Infinity;
  if (!hashChanged && checkedAge < FLEET_STATE_REWRITE_MS) return false;
  return writeStoredJson(FLEET_STATE_KEY, { ...next, updatedAt: new Date().toISOString() });
}

/** Write a JSON document if its hash differs from the recorded one; record the new hash. */
async function writeIfChanged(key, value, recordedHash, record) {
  try {
    const { written, hash } = await putJsonIfChanged(key, value, recordedHash);
    if (written) record(hash);
    return written;
  } catch (err) {
    noteStorageError(`write ${key}`, err);
    return false;
  }
}

/** Picker facts from a basic record (or a fleet-list row that carries them). */
export function factsFromBasic(row, fetchedAt = new Date().toISOString()) {
  return {
    builder: String(row?.builder ?? "").trim(),
    lengthM: parseMetres(row?.length_metric ?? row?.length_metres ?? row?.length) ?? null,
    basePort: basePort(row?.summer_base_port) ?? "",
    // When the record was read — a yacht Yachtfolio has no facts for is
    // still marked as checked, so it is not fetched again.
    factsAt: fetchedAt,
  };
}

export const hasFacts = (f) => Boolean(f && (f.builder || f.lengthM != null || f.basePort));
const sameFacts = (a, b) => a && b && a.builder === b.builder && a.lengthM === b.lengthM && a.basePort === b.basePort;

/**
 * Set a yacht's facts in the map, keeping the original read time when the
 * values are unchanged so a night that learns nothing new does not rewrite
 * fleet.json for a timestamp.
 */
export function recordFacts(facts, id, next) {
  const prev = facts.get(id);
  if (sameFacts(prev, next) && prev.factsAt) next = { ...next, factsAt: prev.factsAt };
  const changed = !prev || !sameFacts(prev, next) || prev.factsAt !== next.factsAt || (prev.factsSource ?? null) !== (next.factsSource ?? null);
  facts.set(id, { ...next, factsTriedAt: null });
  return changed;
}

/**
 * Still to read: no facts yet, or an empty result from the retired
 * basic-record path (no factsSource). An empty result from the brochure is
 * final — Yachtfolio has nothing for that yacht.
 */
export const factsPending = (f) => !f?.factsAt || (!hasFacts(f) && f.factsSource !== "brochure" && f.factsSource !== "detail");

/**
 * Note a failed basic-record fetch for a listed yacht so the gap fill moves
 * on to other yachts before coming back to it (pending yachts are tried
 * oldest attempt first). Written to fleet.json like any other fact change.
 */
export function recordFactsAttempt(facts, id, at = new Date().toISOString()) {
  const prev = facts.get(id) ?? { builder: "", lengthM: null, basePort: "", factsAt: null };
  facts.set(id, { ...prev, factsTriedAt: at });
}

/** The headline fields the nightly diff compares per yacht. */
const headline = (y) => [y?.name ?? "", y?.registryPort ?? "", y?.builder ?? "", y?.lengthM ?? null, y?.basePort ?? ""];

/**
 * Fetch the fleet list and reference data and build the next fleet.json
 * without writing anything. Facts are carried from the previous list and
 * refreshed for free from any list row that carries builder or length.
 * Returns { fleet, reference, facts, changedIds, state, previous } for
 * persistFleet(); the nightly run fills facts gaps in between.
 */
export async function fetchFleetSnapshot() {
  const passkey = await passkeyOrThrow();
  const run = startRun("sync");
  // Fail closed: if the state or the previous list cannot be read, nothing
  // is written this run — a blind sync would rewrite the list and lose the
  // removed-yachts history.
  const { state, loaded } = await readFleetState();
  run.stats.notes.push(loaded ? "fleet state loaded." : "no fleet state yet (first run) — the list and reference data will be written.");
  let previous;
  try {
    previous = (await getJson(FLEET_KEY)) ?? memoryFleet;
  } catch (err) {
    throw storageFailure(`read ${FLEET_KEY}`, err);
  }

  const list = await fetchFleetList(passkey);
  await sleep(REQUEST_DELAY_MS);
  const reference = await fetchReferenceData(passkey);

  const facts = new Map();
  for (const y of previous?.yachts ?? []) {
    const f = { builder: y.builder ?? "", lengthM: y.lengthM ?? null, basePort: y.basePort ?? "", factsAt: y.factsAt ?? null, factsTriedAt: y.factsTriedAt ?? null, factsSource: y.factsSource ?? null };
    if (hasFacts(f) || f.factsAt || f.factsTriedAt) facts.set(y.id, f);
  }
  // A corrected builder or length in the list response is picked up here
  // without a call (only those three fields are read from the row); the
  // per-yacht follow-up is only for rows without them.
  let fromList = 0;
  for (const row of list) {
    const f = { ...factsFromBasic(row), factsSource: "list" };
    if (hasFacts(f)) {
      recordFacts(facts, row.id, f);
      fromList += 1;
    }
  }
  if (fromList) run.stats.notes.push(`fleet list carried builder/length for ${fromList} yacht(s).`);

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
  const previousById = new Map((previous?.yachts ?? []).map((y) => [y.id, y]));
  const yachts = list.map((y) => fleetRow(y, facts));
  // New yachts and yachts whose headline fields changed since the last list.
  const changedIds = yachts.filter((y) => hashJson(headline(previousById.get(y.id))) !== hashJson(headline(y))).map((y) => y.id);
  const fleet = { schemaVersion: FLEET_SCHEMA_VERSION, syncedAt: new Date().toISOString(), count: list.length, yachts, removed };
  // factsAdded counts listed yachts whose facts changed after this point
  // (gap fill, in-use refresh); persistFleet writes fleet.json for them
  // whatever the content hash says.
  return { run, passkey, state, previous, list, reference, facts, fleet, changedIds, factsAdded: 0 };
}

/** One fleet.json row: the list row plus whatever facts are known for it. */
function fleetRow(y, facts) {
  const f = facts.get(y.id);
  return {
    id: y.id,
    name: y.name,
    registryPort: y.registry_port ?? y.registryPort ?? "",
    // Builder, length and summer base port let the form's picker tell two
    // yachts of the same name apart; "" / null when Yachtfolio has none.
    builder: f?.builder ?? "",
    lengthM: f?.lengthM ?? null,
    basePort: f?.basePort ?? "",
    factsAt: f?.factsAt ?? null,
    ...(f?.factsSource ? { factsSource: f.factsSource } : {}),
    ...(f?.factsTriedAt && !f?.factsAt ? { factsTriedAt: f.factsTriedAt } : {}),
  };
}

/** Rebuild fleet.yachts from the facts map after a gap fill. */
export function applyFacts(snapshot) {
  snapshot.fleet.yachts = snapshot.fleet.yachts.map((y) => fleetRow(y, snapshot.facts));
}

/**
 * Persist a snapshot: fleet.json and reference.json only when their content
 * hash changed, the fleet state only when a hash changed or its check time
 * is over 12 hours old. Returns the sync summary.
 */
export async function persistFleet(snapshot) {
  const { run, state, fleet, reference, facts, removed = fleet.removed } = snapshot;
  applyFacts(snapshot);
  memoryFleet = fleet;
  memoryReference = reference;
  const { syncedAt: _syncedAt, ...fleetContent } = fleet;
  const fleetContentHash = hashJson(fleetContent);
  const next = { ...state };
  let fleetWritten = false;
  // Facts added this run are a write in their own right: the picker list is
  // where facts for yachts nobody has picked live, and a fill that is not
  // written is a fill that will be repeated tomorrow.
  if (fleetContentHash !== state.fleetHash || (snapshot.factsAdded ?? 0) > 0) {
    fleetWritten = await writeStoredJson(FLEET_KEY, fleet);
    if (fleetWritten) next.fleetHash = fleetContentHash;
  }
  const referenceWritten = await writeIfChanged(REFERENCE_KEY, reference, state.referenceHash, (h) => {
    next.referenceHash = h;
  });
  next.fleetCheckedAt = fleet.syncedAt;
  const stateWritten = await writeFleetState(state, next, { hashChanged: fleetWritten || referenceWritten });
  const stats = finishRun(run);
  const withFacts = fleet.yachts.filter((y) => hasFacts(facts.get(y.id))).length;
  return {
    count: fleet.count,
    changedCount: snapshot.changedIds.length,
    factsCount: withFacts,
    factsRemaining: fleet.yachts.filter((y) => factsPending(facts.get(y.id))).length,
    removedCount: Object.keys(removed).length,
    syncedAt: fleet.syncedAt,
    persisted: !stats.dryRun,
    fleetWritten,
    referenceWritten,
    stateWritten,
    blob: stats.blob,
    dryRun: stats.dryRun,
    notes: stats.notes,
  };
}

/**
 * Pull the charter fleet list from Yachtfolio into the cache (list and
 * reference data only — no per-yacht work). Used by the lazy re-sync in
 * getFleet() and the fetch CLI; the nightly cron runs nightly.mjs instead.
 */
export async function syncFleet() {
  if (isDemoFleet()) {
    // No passkey: nothing to sync. The demo set is served instead so the
    // portal keeps working; say so rather than failing the cron.
    const fleet = demoFleet();
    console.warn("[fleet:sync] YACHTFOLIO_PASSKEY is not configured — serving the demo fleet, nothing synced.");
    return { count: fleet.count, changedCount: 0, factsCount: fleet.count, factsRemaining: 0, removedCount: 0, syncedAt: fleet.syncedAt, persisted: false, demo: true, notes: ["demo fleet — no passkey"] };
  }
  return persistFleet(await fetchFleetSnapshot());
}

/** The cached fleet list; bootstraps from the live API when missing/stale. */
export async function getFleet() {
  if (isDemoFleet()) return demoFleet();
  let fleet = (await readStoredJson(FLEET_KEY)) ?? memoryFleet;
  // An unchanged list is not rewritten, so its syncedAt can be old; the
  // fleet state records when it was last checked against Yachtfolio.
  let checkedAt = fleet?.syncedAt ?? 0;
  try {
    const { state } = await readFleetState();
    if (state.fleetCheckedAt && Date.parse(state.fleetCheckedAt) > Date.parse(checkedAt)) checkedAt = state.fleetCheckedAt;
  } catch {
    /* state unavailable (already recorded) — fall back to the stored syncedAt */
  }
  const stale =
    !fleet || fleet.schemaVersion !== FLEET_SCHEMA_VERSION || Date.now() - Date.parse(checkedAt) > FLEET_STALE_MS;
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

/** Write a record, recording (not throwing) a storage failure; true when written. */
async function writeRecord(record) {
  try {
    await writeYachtRecord(record);
    return true;
  } catch (err) {
    noteStorageError(`write record for yacht ${record.yfId}`, err);
    return false;
  }
}

/**
 * The specifications already on a yacht's record, or null when it has none.
 * Served when Yachtfolio cannot be reached; a storage failure propagates.
 */
export async function getStoredYachtDetail(yfId) {
  const record = await readYachtRecord(yfId);
  return record?.specs ? detailFromRecord(record) : null;
}

/** The detail document a record's stored specifications stand for. */
function detailFromRecord(record) {
  return { ...record.specs, fetchedAt: record.specsFetchedAt, specsFetchedAt: record.specsFetchedAt, facts: record.facts };
}

/** Picker facts as learnt from a full detail fetch (brochure and basic record). */
function factsFromDetail(detail) {
  return factsFrom({ builder: detail.builder, lengthM: detail.lengthM, basePort: detail.cruisingArea }, detail.fetchedAt);
}

/**
 * On-demand facts for one yacht: brochure + basic record, normalised to the
 * form's fields — text and numbers only, so the form fills within a couple
 * of seconds. Images are a separate, slower call (getYachtImages). The
 * result lives on the yacht's record; it is served from there while fresh
 * and the record is rewritten only when the specifications or the picker
 * facts change (or, for its check time alone, at most twice a day).
 */
export async function getYachtDetail(yfId, { forceRefresh = false, debug = false } = {}) {
  if (isDemoFleet()) {
    const demo = demoDetail(yfId);
    if (!demo) throw Object.assign(new Error("No such demo yacht."), { code: "NOT_FOUND" });
    return demo;
  }
  let loaded;
  try {
    loaded = await loadYachtRecord(yfId);
  } catch (err) {
    throw storageFailure(`read record for yacht ${yfId}`, err);
  }
  const { record, created } = loaded;
  if (
    !forceRefresh &&
    !debug &&
    record.specs &&
    record.specs.schemaVersion === DETAIL_SCHEMA_VERSION &&
    Date.now() - Date.parse(record.specsFetchedAt ?? 0) < DETAIL_FRESH_MS
  ) {
    return detailFromRecord(record);
  }

  const passkey = await passkeyOrThrow();
  const referenceData = await getReference(passkey);
  const reference = buildReference(referenceData);
  const targetSeason = pickSeason(reference.seasons);

  const { json: brochure } = await fetchBrochure(passkey, yfId);
  rememberBrochure(yfId, brochure);
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
  const run = startRun("detail");
  run.stats.yachtsChecked = 1;
  const specsChanged = applySpecs(record, detail, { lastModified: brochure?.last_modified });
  const newFacts = factsFromDetail(detail);
  const factsChanged = hashJson({ ...newFacts, fetchedAt: null }) !== hashJson({ ...(record.facts ?? {}), fetchedAt: null });
  if (factsChanged || !record.facts) record.facts = newFacts;
  const touchDue = !record.lastCheckedAt || Date.now() - Date.parse(record.lastCheckedAt) > RECORD_TOUCH_MS;
  record.lastCheckedAt = detail.fetchedAt;
  if (created || specsChanged || factsChanged || touchDue) {
    if (await writeRecord(record)) run.stats.yachtsWritten = 1;
  } else {
    run.stats.yachtsSkipped = 1;
  }
  const out = { ...detail, specsFetchedAt: record.specsFetchedAt, facts: record.facts, blob: finishRun(run) };
  if (debug) {
    // Raw-shape diagnostics for locating fields the 2023 doc does not
    // describe (e.g. the e-brochure link). Response-only, never cached;
    // every string is passkey-redacted before it leaves the server.
    const shape = describeRawShape(brochure, basic);
    return {
      ...out,
      _debug: {
        ...shape,
        yachtfolioLinks: shape.yachtfolioLinks.map((s) => redact(s, passkey)),
        shapeNotes: checkBrochureShape(brochure),
      },
    };
  }
  return out;
}

/** The part of an images order that decides whether the record needs rewriting. */
const orderIdentity = (order) => order.map((e) => [e.pos, e.yfImageId, e.store, e.key, e.url, e.smallUrl]);

/**
 * The prepared gallery and default slot images for one yacht on the Blob
 * pipeline (IMAGE_STORE=blob), driven by the yacht's record: a gallery
 * image whose Yachtfolio id is already recorded with both Blob URLs is
 * reused without downloading, processing or writing; only unseen images are
 * cropped and written (two sizes each). Nothing is listed and nothing is
 * deleted from Blob — images that have left the Yachtfolio gallery drop out
 * of the record's order and are reported so they can be dealt with
 * separately. The result is returned in full, so no "preparing" claim is
 * taken: two simultaneous calls for the same yacht both do the work.
 */
export async function getYachtImages(yfId) {
  if (isDemoFleet()) {
    const demo = demoImages(yfId);
    if (!demo) throw Object.assign(new Error("No such demo yacht."), { code: "NOT_FOUND" });
    return demo;
  }
  const passkey = await passkeyOrThrow();
  let loaded;
  try {
    loaded = await loadYachtRecord(yfId);
  } catch (err) {
    throw storageFailure(`read record for yacht ${yfId}`, err);
  }
  const { record, created } = loaded;
  const run = startRun("images");
  const brochure = await brochureFor(passkey, yfId);
  const selected = selectGalleryImages(brochure?.galleries, GALLERY_MAX_PER_CATEGORY);
  const notes = [];
  const prefix = `yachtfolio/images/${yfId}/`;
  const known = new Map(record.images.order.filter((e) => e.store === "blob" && e.url && e.smallUrl).map((e) => [String(e.yfImageId), e]));

  const processed = await mapLimit(selected, IMAGE_CONCURRENCY, async ({ category, image, baseName }, i) => {
    const source = stripSecret(image.url);
    const yfImageId = String(image.id_file);
    run.stats.imagesChecked += 1;
    const existing = known.get(yfImageId);
    if (existing) {
      run.stats.imagesSkipped += 1;
      return { ...existing, category, sourceUrl: source, filename: image.filename ?? null };
    }
    const keyBase = `${prefix}${baseName}-${image.id_file}`;
    const keys = { large: `${keyBase}.jpg`, small: `${keyBase}-sm.jpg` };
    try {
      await sleep(IMAGE_START_DELAY_MS * (i % IMAGE_CONCURRENCY));
      const { bytes } = await fetchMedia(image.url, passkey);
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
      run.stats.imagesWritten += 1;
      return { yfImageId, sourceUrl: source, category, filename: image.filename ?? null, store: "blob", key: keys.large, url: urls.large, smallUrl: urls.small, hash, uploadedAt: new Date().toISOString() };
    } catch (err) {
      notes.push(
        `image ${redact(String(image.filename ?? image.id_file), passkey)} (${category}) failed: ` +
          redact(String(err?.message ?? err), passkey)
      );
      return { failed: true, yfImageId, category, error: redact(String(err?.message ?? err), passkey) };
    }
  });
  const order = processed.filter((e) => e && !e.failed).map((e, pos) => ({ ...e, pos }));
  const failures = processed.filter((e) => e?.failed).map(({ yfImageId, category, error }) => ({ yfImageId, category, error }));
  const files = order.map((e) => galleryFileOf(e));

  // Images recorded earlier that Yachtfolio no longer returns: their Blob
  // files are kept (the decision to delete is taken separately) and reported.
  const seen = new Set(order.map((e) => String(e.yfImageId)));
  for (const e of record.images.order) {
    if (!seen.has(String(e.yfImageId))) run.stats.imagesRemoved.push(e.key ?? e.sourceUrl ?? e.yfImageId);
  }
  if (run.stats.imagesRemoved.length) {
    notes.push(`${run.stats.imagesRemoved.length} image(s) no longer in the Yachtfolio gallery are still stored: ${run.stats.imagesRemoved.join(", ")}`);
  }

  const before = hashJson({ status: record.images.status, order: orderIdentity(record.images.order) });
  finishPreparing(record, { order, failures, store: "blob" });
  const after = hashJson({ status: record.images.status, order: orderIdentity(record.images.order) });
  const touchDue = !record.lastCheckedAt || Date.now() - Date.parse(record.lastCheckedAt) > RECORD_TOUCH_MS;
  if (created || before !== after || touchDue) {
    record.lastCheckedAt = new Date().toISOString();
    await writeRecord(record);
  }

  const slots = defaultSlots(files, yfId);
  notes.push(...slots.notes);
  const stats = finishRun(run);
  return {
    yfId,
    fetchedAt: new Date().toISOString(),
    store: "blob",
    status: record.images.status,
    gallery: files,
    leadImageUrl: slots.leadImageUrl,
    interiorImageUrl: slots.interiorImageUrl,
    exteriorImageUrl: slots.exteriorImageUrl,
    lifestyleImageUrl: slots.lifestyleImageUrl,
    warnings: notes,
    blob: stats,
  };
}
