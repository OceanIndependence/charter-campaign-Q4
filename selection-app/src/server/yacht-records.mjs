/**
 * Per-yacht records — SERVER-ONLY.
 *
 * One private JSON document per yacht at yachts/<yfId>.json is the single
 * source of truth for what the app knows about it: the normalised
 * specifications (with a hash and fetch time), the picker facts (builder,
 * length, base port — fetched once, never on a schedule), and the prepared
 * images in display order with the main image at position 0. Only yachts a
 * consultant has picked, or that appear in a selection, ever have a record.
 *
 *   {
 *     version: 1, yfId, specs, specsHash, specsFetchedAt, yfLastModified,
 *     facts: { builder, lengthM, basePort, fetchedAt },
 *     images: { status, startedAt, updatedAt, store, main, order: [...], failures: [] },
 *     lastCheckedAt
 *   }
 *
 * Reads distinguish "no record" (null) from a storage failure (throw); a
 * caller that catches the throw must not go on to write. The first touch of
 * a yacht without a record builds one from the legacy sources — the global
 * fleet manifest entry, yachtfolio/details/<id>.json and the facts carried in
 * fleet.json — without deleting any of them.
 */

import { getJson, hashJson, putJson } from "./storage.mjs";

export const RECORD_VERSION = 1;
export const recordKey = (yfId) => `yachts/${Number(yfId)}.json`;
/** A "preparing" job older than this is treated as dead and restarted. */
export const PREPARING_STALE_MS = 5 * 60 * 1000;

const LEGACY_MANIFEST_KEY = "private/fleet-manifest.json";
const legacyDetailKey = (yfId) => `yachtfolio/details/${yfId}.json`;
const FLEET_KEY = "yachtfolio/fleet.json";

export function emptyImages() {
  return { status: "none", startedAt: null, updatedAt: null, store: null, main: 0, order: [], failures: [] };
}

export function emptyYachtRecord(yfId) {
  return {
    version: RECORD_VERSION,
    yfId: Number(yfId),
    specs: null,
    specsHash: null,
    specsFetchedAt: null,
    yfLastModified: null,
    facts: null,
    images: emptyImages(),
    lastCheckedAt: null,
  };
}

/** A valid record, or null for a missing one. Any other storage error propagates. */
export async function readYachtRecord(yfId) {
  const rec = await getJson(recordKey(yfId));
  if (!rec || typeof rec !== "object") return null;
  if (rec.version !== RECORD_VERSION || Number(rec.yfId) !== Number(yfId)) return null;
  return { ...emptyYachtRecord(yfId), ...rec, images: { ...emptyImages(), ...(rec.images ?? {}) } };
}

export async function writeYachtRecord(record) {
  await putJson(recordKey(record.yfId), record);
  return record;
}

/* -------------------------------------------------------------- migration */

/** Legacy manifest image entries were keyed by source URL; the Blob key carries the display sequence. */
function legacySequence(entry) {
  const m = String(entry?.key ?? "").match(/\/(\d+)-[a-z]+-\d+(?:-sm)?\.jpg$/i);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}

/** Build the images block from a legacy manifest yacht entry ({ images: { [sourceUrl]: {...} } }). */
export function imagesFromLegacyEntry(entry) {
  const images = emptyImages();
  const list = Object.entries(entry?.images ?? {})
    .filter(([, rec]) => rec?.url && rec?.smallUrl)
    .sort((a, b) => legacySequence(a[1]) - legacySequence(b[1]));
  images.order = list.map(([sourceUrl, rec], pos) => ({
    pos,
    yfImageId: String(rec.id ?? ""),
    sourceUrl,
    category: rec.category ?? "",
    filename: null,
    store: "blob",
    key: rec.key ?? null,
    url: rec.url,
    smallUrl: rec.smallUrl,
    uploadedAt: null,
  }));
  if (images.order.length) {
    images.status = "ready";
    images.store = "blob";
  }
  return images;
}

/** Strip the per-request fields from a detail document before it is stored or hashed. */
export function specsContentOf(detail) {
  if (!detail) return null;
  const { fetchedAt: _f, blob: _b, _debug, ...content } = detail;
  return content;
}

/**
 * Record a freshly normalised detail on the record. Returns true when the
 * specifications changed (fetch time excluded), so the caller knows whether
 * the record needs writing for that reason.
 */
export function applySpecs(record, detail, { lastModified = null } = {}) {
  const content = specsContentOf(detail);
  const hash = hashJson(content);
  const changed = hash !== record.specsHash;
  record.specs = content;
  record.specsHash = hash;
  record.specsFetchedAt = detail.fetchedAt ?? new Date().toISOString();
  if (lastModified) record.yfLastModified = String(lastModified);
  return changed;
}

/** Picker facts from a fleet.json row or a basic record, if it carries any. */
export function factsFrom(row, fetchedAt) {
  if (!row) return null;
  const facts = {
    builder: String(row.builder ?? "").trim(),
    lengthM: row.lengthM ?? null,
    basePort: String(row.basePort ?? "").trim(),
    fetchedAt: fetchedAt ?? row.factsAt ?? null,
  };
  return facts.builder || facts.lengthM != null || facts.basePort || facts.fetchedAt ? facts : null;
}

/**
 * The record for a yacht, built from the legacy sources on first touch.
 * Returns { record, created }; a created record has not been written yet —
 * the caller writes it along with whatever it goes on to change. Storage
 * errors propagate from every read.
 */
export async function loadYachtRecord(yfId) {
  const existing = await readYachtRecord(yfId);
  if (existing) return { record: existing, created: false };
  const record = emptyYachtRecord(yfId);
  const [manifest, detail, fleet] = await Promise.all([getJson(LEGACY_MANIFEST_KEY), getJson(legacyDetailKey(yfId)), getJson(FLEET_KEY)]);
  const entry = manifest?.yachts?.[String(yfId)];
  if (entry) record.images = imagesFromLegacyEntry(entry);
  if (detail && Number(detail.yfId) === Number(yfId)) {
    applySpecs(record, detail);
    record.lastCheckedAt = detail.fetchedAt ?? null;
  }
  const row = fleet?.yachts?.find?.((y) => Number(y.id) === Number(yfId));
  record.facts = factsFrom(row);
  return { record, created: true };
}

/* -------------------------------------------------------------- preparing */

export function isPreparingFresh(record, now = Date.now()) {
  const img = record?.images;
  return img?.status === "preparing" && img.startedAt != null && now - Date.parse(img.startedAt) < PREPARING_STALE_MS;
}

/**
 * Claim the image job for this record. Returns false, changing nothing, when
 * another caller claimed it less than five minutes ago; a claim older than
 * that is a dead job and is taken over.
 */
export function startPreparing(record, now = Date.now()) {
  if (isPreparingFresh(record, now)) return false;
  record.images.status = "preparing";
  record.images.startedAt = new Date(now).toISOString();
  return true;
}

/** Finish the image job: "ready", or "partial" when any position failed. */
export function finishPreparing(record, { order, failures = [], store, now = Date.now() }) {
  record.images.order = order;
  record.images.failures = failures;
  record.images.store = store;
  record.images.main = 0;
  record.images.status = failures.length ? "partial" : "ready";
  record.images.startedAt = null;
  record.images.updatedAt = new Date(now).toISOString();
}
