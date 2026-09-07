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
  extractYachtFacts,
  pickSeason,
} from "./yachtfolio/normalise.mjs";
import { cropToSizes, selectGalleryImages } from "./yachtfolio/images.mjs";
import { fileExists, fileUrl, getJson, putFile, putJson } from "./storage.mjs";

const FLEET_KEY = "yachtfolio/fleet.json";
const REFERENCE_KEY = "yachtfolio/reference.json";
const detailKey = (yfId) => `yachtfolio/details/${yfId}.json`;

const FLEET_STALE_MS = 36 * 60 * 60 * 1000; // lazy re-sync if the cron hasn't run
const DETAIL_FRESH_MS = 6 * 60 * 60 * 1000; // rates change; don't serve stale for long
const IMAGES_PER_CATEGORY = 2; // lead/deck from EXTERIOR, watertoys from LIFESTYLE, interior from INTERIOR

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
 * On-demand detail for one yacht: brochure + basic record, normalised to the
 * form's fields, with its images pulled through the crop pipeline into
 * storage (immutable keys — reprocessing is skipped when the same source
 * file was already done). Cached for a few hours.
 */
export async function getYachtDetail(yfId, { forceRefresh = false } = {}) {
  const cached = await readStoredJson(detailKey(yfId));
  if (
    !forceRefresh &&
    cached &&
    Date.now() - Date.parse(cached.fetchedAt ?? 0) < DETAIL_FRESH_MS
  ) {
    return cached;
  }

  const passkey = await passkeyOrThrow();
  const referenceData = await getReference(passkey);
  const reference = buildReference(referenceData);
  const targetSeason = pickSeason(reference.seasons);

  const { json: brochure } = await fetchBrochure(passkey, yfId);
  await sleep(REQUEST_DELAY_MS);
  let basic = null;
  try {
    basic = await fetchBasicRecord(passkey, yfId);
  } catch (err) {
    console.warn(`[fleet] basic record for ${yfId} failed: ${redact(String(err?.message ?? err), passkey)}`);
  }

  const facts = extractYachtFacts({ brochure, basic, reference, targetSeason });

  // Process only this yacht's images, only the slots the page needs.
  const selected = selectGalleryImages(brochure?.galleries, IMAGES_PER_CATEGORY);
  const files = [];
  for (const { category, image, baseName } of selected) {
    const keyBase = `yachtfolio/images/${yfId}/${baseName}-${image.id_file}`;
    const keys = { large: `${keyBase}.jpg`, small: `${keyBase}-sm.jpg` };
    try {
      let urls;
      if ((await fileExists(keys.large)) && (await fileExists(keys.small))) {
        urls = { large: await fileUrl(keys.large), small: await fileUrl(keys.small) };
      } else {
        const res = await fetch(image.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const source = Buffer.from(await res.arrayBuffer());
        const sizes = await cropToSizes(source);
        urls = {};
        for (const size of sizes) {
          const key = size.suffix === "-sm" ? keys.small : keys.large;
          const url = await putFile(key, size.buffer, "image/jpeg");
          urls[size.suffix === "-sm" ? "small" : "large"] = url;
        }
        await sleep(REQUEST_DELAY_MS);
      }
      files.push({ category, url: urls.large, smallUrl: urls.small });
    } catch (err) {
      facts.notes.push(
        `image ${redact(String(image.filename ?? image.id_file), passkey)} (${category}) failed: ` +
          redact(String(err?.message ?? err), passkey)
      );
    }
  }

  const byCategory = (cat) => files.filter((f) => f.category === cat).map((f) => f.url);
  const exterior = byCategory("EXTERIOR");
  const lifestyle = byCategory("LIFESTYLE");
  const interior = byCategory("INTERIOR");
  const leadImageUrl = exterior[0] ?? lifestyle[0] ?? interior[0] ?? "";

  const detail = {
    yfId,
    fetchedAt: new Date().toISOString(),
    targetSeason: TARGET_SEASON.label,
    name: (facts.name ?? "").toUpperCase(),
    lengthM: facts.lengthM ?? null,
    yearRefit: facts.yearRefit ?? "",
    guests: facts.guests ?? null,
    builder: facts.builder ?? "",
    staterooms: facts.staterooms
      ? facts.staterooms.breakdown
        ? `${facts.staterooms.count} (${facts.staterooms.breakdown})`
        : String(facts.staterooms.count)
      : "",
    cruisingArea: facts.cruisingArea ?? "",
    // Consultant-voice field: never auto-filled. facts.notes carries the
    // seasons_unavailable warning for the form to surface instead.
    availability: "",
    // Currency carried through as-is; APA/VAT are the consultant's, not fetched.
    currency: facts.currency ?? "EUR",
    weeklyRate: facts.weeklyRate ?? null,
    weeklyRateIsFrom: facts.weeklyRateIsFrom,
    leadImageUrl,
    interiorImageUrl: interior[0] ?? "",
    deckImageUrl: exterior[1] ?? lifestyle[1] ?? "",
    watertoysImageUrl: lifestyle[0] ?? "",
    brochureUrl: "",
    description: facts.description ?? "",
    keyFeatures: facts.keyFeatures,
    gallery: files,
    dataSource: facts.dataSource ?? null,
    missing: facts.missing,
    warnings: facts.notes,
  };

  await writeStoredJson(detailKey(yfId), detail);
  return detail;
}
