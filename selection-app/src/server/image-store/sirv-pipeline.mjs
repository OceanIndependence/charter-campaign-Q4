/**
 * The Sirv image pipeline — SERVER-ONLY.
 *
 * For IMAGE_STORE=sirv a yacht's gallery is prepared as one original per
 * image, uploaded untouched (no sharp, no resizing) to
 *
 *     ${SIRV_ROOT_PATH}/<yfId>/<yfId>.<pos>.jpg
 *
 * where pos is the display position and 0 is the main image. Cropping is
 * Sirv's, at request time, through the charter-hero and charter-thumb
 * profiles (see index.mjs). Each yacht has its own subfolder; the filename
 * repeats the yacht id so it matches the existing CRM convention in the same
 * Sirv folder.
 *
 * Naming is positional and files are overwritten in place, so a removal in
 * Yachtfolio shifts every later position and causes several overwrites;
 * that is accepted and counted. When the new list is shorter than the old,
 * the trailing files are deleted so no ghost images remain. In-place byte
 * changes behind an unchanged Yachtfolio image id are not detected; the
 * `force` option re-uploads everything.
 */

import { fetchMedia, isRateLimitError, loadPasskey, redact, yachtfolioOps } from "../yachtfolio/client.mjs";
import { selectGalleryImages } from "../yachtfolio/images.mjs";
import { brochureFor, defaultSlots, galleryFileOf, mapLimit, orderWithLead, stripSecret } from "../yachtfolio/gallery.mjs";
import { finishPreparing, isPreparingFresh, loadYachtRecord, startPreparing, writeYachtRecord } from "../yacht-records.mjs";
import { noteStorageError } from "../storage.mjs";
import { sirvConfig, sirvImageUrl } from "./index.mjs";
import * as sirv from "./sirv-client.mjs";

/** Same cap as the Blob pipeline: four categories, five images each. */
export const GALLERY_MAX_PER_CATEGORY = 5;
/** Image downloads and uploads in flight at once (ground rule 6). */
export const IMAGE_CONCURRENCY = 4;
/**
 * Filename convention. The extension and padding could not be checked
 * against the existing CRM files in /yachtfolio_images during the build
 * (no Sirv credentials in the session), so they are defaults confirmed on
 * first deploy: lowercase ".jpg", positions unpadded. Change them here only.
 */
export const IMAGE_EXTENSION = ".jpg";
export const padPosition = (pos) => String(pos);

const storageFailure = (context, err) => Object.assign(new Error(`${context}: ${noteStorageError(context, err)}`), { code: "STORAGE", cause: err });

/** Sirv folder for a yacht. */
export function yachtFolder(yfId) {
  return `${sirvConfig().rootPath}/${Number(yfId)}`;
}

/** Sirv key for a yacht image at a display position. */
export function imageKey(yfId, pos) {
  return `${yachtFolder(yfId)}/${Number(yfId)}.${padPosition(pos)}${IMAGE_EXTENSION}`;
}

/** Sirv accepts JPEG, PNG, WebP and GIF originals; anything else is not an image we can serve. */
function contentTypeFor(image, headerType) {
  const t = String(headerType ?? "").split(";")[0].trim().toLowerCase();
  if (/^image\/(jpeg|png|webp|gif)$/.test(t)) return t;
  const ext = String(image.filename ?? "").toLowerCase().match(/\.(jpe?g|png|webp|gif)$/)?.[1];
  return ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "gif" ? "image/gif" : "image/jpeg";
}

/* ------------------------------------------------------------------ URLs */

/** The public URL pair for one order[] entry, whichever store holds it. */
export function entryUrls(entry) {
  if (entry.store === "sirv" && entry.key) return { url: sirvImageUrl(entry.key, "hero"), smallUrl: sirvImageUrl(entry.key, "thumb") };
  return { url: entry.url ?? "", smallUrl: entry.smallUrl ?? entry.url ?? "" };
}

/**
 * The ordered public URLs of a record's images for `variant` "hero" or
 * "thumb": Sirv profiles for Sirv entries, the stored Blob URLs for legacy
 * entries, so a component renders either.
 */
export function imageUrls(record, variant = "hero") {
  const order = [...(record?.images?.order ?? [])].sort((a, b) => a.pos - b.pos);
  return order.map((e) => (variant === "thumb" ? entryUrls(e).smallUrl : entryUrls(e).url)).filter(Boolean);
}

/** Gallery entries ({ id, category, url, smallUrl, filename }) in display order. */
export function galleryOf(record) {
  return [...(record?.images?.order ?? [])].sort((a, b) => a.pos - b.pos).map((e) => galleryFileOf(e, entryUrls(e)));
}

/**
 * The images response the portal reads (GET /api/fleet/:yfId/images): the
 * status and counts from the record plus the gallery and default slots.
 */
export function imagesResponse(record, { warnings = [] } = {}) {
  const img = record.images;
  const gallery = galleryOf(record);
  const slots = defaultSlots(gallery, record.yfId);
  return {
    yfId: record.yfId,
    status: img.status,
    store: img.store,
    startedAt: img.startedAt,
    updatedAt: img.updatedAt,
    counts: { ready: gallery.length, failed: img.failures?.length ?? 0, expected: img.expected ?? null },
    gallery,
    leadImageUrl: slots.leadImageUrl,
    interiorImageUrl: slots.interiorImageUrl,
    exteriorImageUrl: slots.exteriorImageUrl,
    lifestyleImageUrl: slots.lifestyleImageUrl,
    warnings: [...warnings, ...slots.notes, ...(img.failures ?? []).map((f) => `image ${f.yfImageId} (${f.category}) failed: ${f.error}`)],
  };
}

/* --------------------------------------------------------------- prepare */

async function writeRecordOrThrow(record, context) {
  try {
    await writeYachtRecord(record);
  } catch (err) {
    throw storageFailure(context, err);
  }
}

/**
 * Prepare a yacht's images on Sirv. Returns { record, claimed, stats,
 * rateLimited }: claimed is false when another caller's job is under five
 * minutes old (the current record is returned and nothing is done). With
 * `force` every position is re-downloaded and re-uploaded. A Yachtfolio
 * rate limit stops the remaining positions, leaves the record "partial"
 * and is reported as rateLimited: true so a cron run can stop cleanly.
 */
export async function prepareYachtImages(yfId, { force = false, passkey: givenPasskey } = {}) {
  yfId = Number(yfId);
  const passkey = givenPasskey ?? (await loadPasskey([process.cwd()]));
  if (!passkey) throw new Error("YACHTFOLIO_PASSKEY is not configured on the server.");

  let loaded;
  try {
    loaded = await loadYachtRecord(yfId);
  } catch (err) {
    throw storageFailure(`read record for yacht ${yfId}`, err);
  }
  const { record } = loaded;
  if (isPreparingFresh(record)) return { record, claimed: false, stats: null, rateLimited: false };

  const yfBefore = yachtfolioOps();
  const sirvBefore = sirv.sirvOps();
  const previous = [...record.images.order].sort((a, b) => a.pos - b.pos);
  startPreparing(record);
  await writeRecordOrThrow(record, `write record for yacht ${yfId} (preparing)`);

  const stats = { positions: 0, skipped: 0, uploaded: 0, overwritten: 0, deleted: 0, failed: 0 };
  const failures = [];
  let rateLimited = false;
  let order;
  try {
    const brochure = await brochureFor(passkey, yfId, { fresh: force });
    const ordered = orderWithLead(selectGalleryImages(brochure?.galleries, GALLERY_MAX_PER_CATEGORY));
    record.images.expected = ordered.length;
    stats.positions = ordered.length;

    const results = await mapLimit(ordered, IMAGE_CONCURRENCY, async ({ category, image }, pos) => {
      const yfImageId = String(image.id_file);
      const existing = previous[pos]?.pos === pos ? previous[pos] : previous.find((e) => e.pos === pos);
      const base = { pos, yfImageId, sourceUrl: stripSecret(image.url), category, filename: image.filename ?? null };
      if (existing && existing.yfImageId === yfImageId && existing.store === "sirv" && existing.key && !force) {
        stats.skipped += 1;
        return { ...existing, ...base, key: existing.key };
      }
      if (rateLimited) return { failed: true, ...base, error: "not attempted — Yachtfolio rate limit reached" };
      try {
        const { bytes, contentType } = await fetchMedia(image.url, passkey);
        const key = imageKey(yfId, pos);
        await sirv.upload(key, bytes, contentTypeFor(image, contentType));
        await sirv.purge(key); // documented no-op: Sirv invalidates on overwrite
        if (existing?.store === "sirv" && existing.key) {
          stats.overwritten += 1;
          if (existing.key !== key) {
            // Same position, different filename (extension changed): no ghost.
            if (await sirv.remove(existing.key)) stats.deleted += 1;
          }
        }
        stats.uploaded += 1;
        return { ...base, store: "sirv", key, url: null, smallUrl: null, hash: null, uploadedAt: new Date().toISOString() };
      } catch (err) {
        if (isRateLimitError(err)) rateLimited = true;
        return { failed: true, ...base, error: redact(String(err?.message ?? err), passkey) };
      }
    });

    order = [];
    for (const r of results) {
      if (r.failed) {
        stats.failed += 1;
        failures.push({ pos: r.pos, yfImageId: r.yfImageId, category: r.category, error: r.error });
        // A previously prepared Sirv image at this position still exists; keep it visible.
        const keep = previous.find((e) => e.pos === r.pos && e.store === "sirv" && e.key);
        if (keep) order.push({ ...keep });
      } else {
        order.push(r);
      }
    }
    order = order.sort((a, b) => a.pos - b.pos);

    // Trailing files from a longer previous list: delete so no ghost remains.
    if (!rateLimited) {
      for (const e of previous) {
        if (e.pos >= ordered.length && e.store === "sirv" && e.key) {
          try {
            const removed = await sirv.remove(e.key);
            console.log(`[sirv:${yfId}] deleted trailing ${e.key}${removed ? "" : " (was already absent)"}`);
            if (removed) stats.deleted += 1;
          } catch (err) {
            failures.push({ pos: e.pos, yfImageId: e.yfImageId, category: e.category, error: `delete failed: ${String(err?.message ?? err)}` });
          }
        }
      }
    }
  } catch (err) {
    // Brochure fetch or an unexpected failure: release the claim as partial.
    if (isRateLimitError(err)) rateLimited = true;
    failures.push({ pos: null, yfImageId: null, category: null, error: redact(String(err?.message ?? err), passkey) });
    order = previous.filter((e) => e.store === "sirv" && e.key);
  }

  finishPreparing(record, { order, failures, store: "sirv" });
  record.lastCheckedAt = new Date().toISOString();
  await writeRecordOrThrow(record, `write record for yacht ${yfId} (${record.images.status})`);

  const yfAfter = yachtfolioOps();
  const sirvAfter = sirv.sirvOps();
  stats.yachtfolioCalls = yfAfter.total - yfBefore.total;
  stats.sirvCalls = sirvAfter.calls - sirvBefore.calls;
  stats.sirvUploads = sirvAfter.uploads - sirvBefore.uploads;
  console.log(
    `[sirv:${yfId}] ${record.images.status}: ${stats.positions} position(s), ${stats.uploaded} uploaded (${stats.overwritten} overwrite(s)), ${stats.skipped} unchanged, ${stats.deleted} deleted, ${stats.failed} failed; ` +
      `Yachtfolio calls ${stats.yachtfolioCalls}, Sirv calls ${stats.sirvCalls}${rateLimited ? " — curtailed by a Yachtfolio rate limit" : ""}`
  );
  return { record, claimed: true, stats, rateLimited };
}
