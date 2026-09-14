/**
 * Image preparation entry points shared by the routes, the cron and the
 * backfill — SERVER-ONLY. Dispatches on IMAGE_STORE and keeps the
 * claim/respond/run shape the routes need:
 *
 *   const job = await startImages(yfId, { force });   // claims and writes
 *   respond(job.response);                            // status "preparing"
 *   after(job.run);                                   // the actual work
 *
 * readImages() is the read-only side: the record's status, counts and URLs
 * with no writes and no Yachtfolio calls.
 */

import { getImageStore } from "./index.mjs";
import { imagesResponse, runPreparation } from "./sirv-pipeline.mjs";
import { claimImages, emptyYachtRecord, readYachtRecord, releaseClaim, writeYachtRecord } from "../yacht-records.mjs";
import { getYachtImages, storageFailure } from "../fleet.mjs";
import { isDemoFleet, demoImages } from "../demo/fleet.mjs";

/** The images payload for a yacht from its record alone (never fetches, never writes). */
export async function readImages(yfId) {
  yfId = Number(yfId);
  if (isDemoFleet()) {
    const demo = demoImages(yfId);
    if (!demo) throw Object.assign(new Error("No such demo yacht."), { code: "NOT_FOUND" });
    return { ...demo, status: "ready", store: "demo", counts: { ready: demo.gallery?.length ?? 0, failed: 0, expected: demo.gallery?.length ?? 0 } };
  }
  let record;
  try {
    record = await readYachtRecord(yfId);
  } catch (err) {
    throw storageFailure(`read record for yacht ${yfId}`, err);
  }
  return imagesResponse(record ?? emptyYachtRecord(yfId));
}

/**
 * Claim a yacht's image job and describe how to run it. Returns
 * { response, claimed, store, run }. When another job is under five minutes
 * old, claimed is false and run() resolves without doing anything.
 */
export async function startImages(yfId, { force = false } = {}) {
  yfId = Number(yfId);
  if (isDemoFleet()) {
    const response = await readImages(yfId);
    return { response, claimed: false, store: "demo", run: async () => ({ record: null, claimed: false, stats: null, rateLimited: false }) };
  }
  const store = getImageStore();
  let claim;
  try {
    claim = await claimImages(yfId);
  } catch (err) {
    throw storageFailure(`claim images for yacht ${yfId}`, err);
  }
  const { record, claimed } = claim;
  const response = imagesResponse(record);
  if (!claimed) return { response, claimed, store, run: async () => ({ record, claimed: false, stats: null, rateLimited: false }) };

  const run = async () => {
    if (store === "sirv") return runPreparation(yfId, { record, force });
    // Blob: the original synchronous pipeline finishes the record itself
    // (finishPreparing at its end clears the claim). On failure the claim
    // is released here so the portal stops polling and can retry.
    try {
      const result = await getYachtImages(yfId);
      return { record: await readYachtRecord(yfId), claimed: true, stats: { positions: result.gallery.length, uploaded: result.blob?.imagesWritten ?? 0, skipped: result.blob?.imagesSkipped ?? 0 }, rateLimited: false, result };
    } catch (err) {
      try {
        const current = (await readYachtRecord(yfId)) ?? record;
        releaseClaim(current, err);
        await writeYachtRecord(current);
      } catch (inner) {
        storageFailure(`release image claim for yacht ${yfId}`, inner);
      }
      throw err;
    }
  };
  return { response, claimed, store, run };
}

/** Claim and run in one step, for the cron and the backfill. */
export async function prepareImages(yfId, { force = false } = {}) {
  const job = await startImages(yfId, { force });
  if (!job.claimed) return { record: null, claimed: false, stats: null, rateLimited: false, response: job.response };
  return job.run();
}
