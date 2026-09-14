/**
 * The nightly run behind /api/cron/fleet-sync — SERVER-ONLY.
 *
 *   1. Fetch the fleet list and diff it against the previous one.
 *   2. Refresh only yachts in use (selections/in-use.json) that changed in
 *      the list or have not been checked for seven days — oldest first, at
 *      most MAX_YACHTS_PER_RUN, stopping before the run's Yachtfolio calls
 *      would pass CALL_BUDGET. Specs are hash-compared and written only on
 *      change; on the Sirv store the images are prepared (no force).
 *   3. Fill picker-facts gaps for yachts in the list with no facts yet, at
 *      most FACTS_PER_RUN, from whatever budget step 2 left. The in-use
 *      refresh always runs first and is never starved by this.
 *   4. Write fleet.json once, if it changed.
 *
 * Yachts not in use are never fetched in detail or have images prepared.
 * A Yachtfolio rate limit stops the run cleanly (curtailed: true, with the
 * number of candidates left for the next night's oldest-first ordering); a
 * storage failure is reported so the cron answers 503.
 */

import { REQUEST_DELAY_MS, fetchBasicList, fetchBasicRecord, isRateLimitError, redact, sleep, yachtfolioOps } from "./yachtfolio/client.mjs";
import { applyFacts, factsFromBasic, fetchFleetSnapshot, getYachtDetail, hasFacts, persistFleet, recordFacts, storageFailure } from "./fleet.mjs";
import { inUseYachtIds } from "./in-use.mjs";
import { readYachtRecord } from "./yacht-records.mjs";
import { getImageStore } from "./image-store/index.mjs";
import { prepareImages } from "./image-store/prepare.mjs";
import { sirvOps } from "./image-store/sirv-client.mjs";
import { blobOps, lastStorageError } from "./storage.mjs";
import { demoFleet, isDemoFleet } from "./demo/fleet.mjs";

export const MAX_YACHTS_PER_RUN = 40;
export const CALL_BUDGET = 300;
export const FACTS_PER_RUN = 100;
export const RECHECK_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
/** A yacht refresh costs at least the brochure and the basic record. */
const MIN_CALLS_PER_YACHT = 2;

/**
 * Fill picker-facts gaps: yachts in the snapshot's list with no facts read
 * yet. One basic-list call first (it covers the agency's own yachts), then
 * one basic record per remaining yacht, oldest-listed first, up to `cap`
 * yachts and `budget` calls. Mutates the snapshot's facts. Returns
 * { filled, remaining, curtailed }.
 */
export async function fillFactsGaps(snapshot, { cap = FACTS_PER_RUN, budget = CALL_BUDGET } = {}) {
  const { passkey, list, facts } = snapshot;
  const pending = () => list.filter((y) => !facts.get(y.id)?.factsAt);
  const before = yachtfolioOps().total;
  const used = () => yachtfolioOps().total - before;
  let filled = 0;
  let curtailed = false;
  if (!pending().length || budget < 1 || cap < 1) return { filled, remaining: pending().length, curtailed };
  try {
    const rows = await fetchBasicList(passkey);
    for (const row of rows) {
      const id = Number(row?.id_yacht ?? row?.yacht_id ?? row?.id);
      if (!Number.isFinite(id)) continue;
      const f = factsFromBasic(row);
      if (hasFacts(f) && !facts.get(id)?.factsAt) filled += 1;
      if (hasFacts(f)) recordFacts(facts, id, f);
    }
    for (const y of pending()) {
      if (filled >= cap || used() + 1 > budget) break;
      await sleep(REQUEST_DELAY_MS);
      try {
        recordFacts(facts, y.id, factsFromBasic(await fetchBasicRecord(passkey, y.id)));
        filled += 1;
      } catch (err) {
        if (isRateLimitError(err)) throw err;
        console.warn(`[nightly] basic record for ${y.id} failed: ${redact(String(err?.message ?? err), passkey)}`);
      }
    }
  } catch (err) {
    if (!isRateLimitError(err)) throw err;
    curtailed = true;
    console.warn("[nightly] facts gap fill curtailed by a Yachtfolio rate limit.");
  }
  applyFacts(snapshot);
  return { filled, remaining: pending().length, curtailed };
}

/** Candidates for tonight, oldest lastCheckedAt first. Reads every in-use record (reads are free). */
export async function selectCandidates(inUse, changedIds, { now = Date.now() } = {}) {
  const changed = new Set(changedIds);
  const out = [];
  for (const yfId of inUse) {
    const record = await readYachtRecord(yfId); // throws on a storage failure
    const checkedAt = record?.lastCheckedAt ? Date.parse(record.lastCheckedAt) : 0;
    const stale = now - checkedAt > RECHECK_AFTER_MS;
    if (changed.has(yfId) || stale || !record) out.push({ yfId, checkedAt, reason: changed.has(yfId) ? "changed" : !record ? "no record" : "stale" });
  }
  return out.sort((a, b) => a.checkedAt - b.checkedAt);
}

export async function runNightlySync({ maxYachts = MAX_YACHTS_PER_RUN, callBudget = CALL_BUDGET, factsCap = FACTS_PER_RUN } = {}) {
  if (isDemoFleet()) {
    const fleet = demoFleet();
    console.warn("[nightly] YACHTFOLIO_PASSKEY is not configured — serving the demo fleet, nothing synced.");
    return { demo: true, fleet: { count: fleet.count, changed: 0, fleetWritten: false, referenceWritten: false, stateWritten: false }, inUse: 0, candidates: 0, processed: 0, skipped: 0, imagesPrepared: 0, curtailed: false, candidatesRemaining: 0, facts: { filled: 0, remaining: 0, curtailed: false }, yachtfolioCalls: 0, sirvUploads: 0, blob: null, storageError: null, notes: ["demo fleet — no passkey"] };
  }
  const runStartedAt = Date.now();
  const yfBefore = yachtfolioOps().total;
  const sirvBefore = sirvOps().uploads;
  const blobBefore = blobOps();
  const used = () => yachtfolioOps().total - yfBefore;
  const notes = [];
  let storageError = null;

  // 1. The list, diffed. A storage failure here propagates: nothing is written.
  const snapshot = await fetchFleetSnapshot();

  // 2. In-use refresh, always first.
  const store = getImageStore();
  let inUse = [];
  let candidates = [];
  try {
    inUse = await inUseYachtIds();
    candidates = await selectCandidates(inUse, snapshot.changedIds);
  } catch (err) {
    throw storageFailure("read in-use index or records", err);
  }
  let processed = 0;
  let skipped = 0;
  let imagesPrepared = 0;
  let curtailed = false;
  let index = 0;
  for (; index < candidates.length; index++) {
    if (processed >= maxYachts) {
      notes.push(`per-run cap of ${maxYachts} yacht(s) reached.`);
      break;
    }
    if (used() + MIN_CALLS_PER_YACHT > callBudget) {
      notes.push(`call budget of ${callBudget} would be exceeded — stopping the in-use refresh.`);
      break;
    }
    const { yfId, reason } = candidates[index];
    try {
      const detail = await getYachtDetail(yfId, { forceRefresh: true });
      if (detail.blob?.yachtsWritten) processed += 1;
      else skipped += 1;
      if (store === "sirv") {
        const result = await prepareImages(yfId);
        if (result.claimed && result.stats?.uploaded) imagesPrepared += 1;
        if (result.rateLimited) {
          curtailed = true;
          break;
        }
      }
      // The refreshed yacht's facts belong in the picker list too.
      if (detail.facts && hasFacts(detail.facts)) recordFacts(snapshot.facts, yfId, { ...detail.facts, factsAt: detail.facts.fetchedAt });
      console.log(`[nightly] ${yfId} (${reason}): specs ${detail.blob?.yachtsWritten ? "changed" : "unchanged"}; Yachtfolio calls so far ${used()}`);
    } catch (err) {
      if (isRateLimitError(err)) {
        curtailed = true;
        break;
      }
      if (err?.code === "STORAGE") {
        storageError = String(err.message);
        break;
      }
      notes.push(`yacht ${yfId} failed: ${redact(String(err?.message ?? err), snapshot.passkey)}`);
      skipped += 1;
    }
    await sleep(REQUEST_DELAY_MS);
  }
  const candidatesRemaining = candidates.length - Math.min(index, candidates.length);
  if (curtailed) notes.push(`Yachtfolio rate limit — ${candidatesRemaining} candidate(s) left for the next run.`);

  // 3. Facts gaps from what is left, unless the night is already curtailed or broken.
  let facts = { filled: 0, remaining: snapshot.list.filter((y) => !snapshot.facts.get(y.id)?.factsAt).length, curtailed: false };
  if (!curtailed && !storageError) {
    const remainingBudget = callBudget - used();
    if (remainingBudget > 1) facts = await fillFactsGaps(snapshot, { cap: factsCap, budget: remainingBudget });
    else notes.push("no call budget left for the facts gap fill tonight.");
  }

  // 4. One fleet.json write, if anything changed.
  const sync = await persistFleet(snapshot);
  const blobAfter = blobOps();
  // A write that failed during this run (recorded, not thrown) is a failed night too.
  const recent = lastStorageError();
  if (!storageError && recent && Date.parse(recent.at) >= runStartedAt) storageError = recent.message;
  const result = {
    fleet: { count: sync.count, changed: snapshot.changedIds.length, removed: sync.removedCount, fleetWritten: sync.fleetWritten, referenceWritten: sync.referenceWritten, stateWritten: sync.stateWritten, syncedAt: sync.syncedAt },
    inUse: inUse.length,
    candidates: candidates.length,
    processed,
    skipped,
    imagesPrepared,
    imageStore: store,
    curtailed,
    candidatesRemaining,
    facts,
    yachtfolioCalls: used(),
    sirvUploads: sirvOps().uploads - sirvBefore,
    blob: { puts: blobAfter.puts - blobBefore.puts, dels: blobAfter.dels - blobBefore.dels, lists: blobAfter.lists - blobBefore.lists, advanced: blobAfter.advanced - blobBefore.advanced },
    storageError,
    notes: [...sync.notes, ...notes],
  };
  console.log(
    `[nightly] fleet ${result.fleet.count} (${result.fleet.changed} changed, list ${sync.fleetWritten ? "written" : "unchanged"}); in use ${result.inUse}, candidates ${result.candidates}, processed ${processed}, unchanged ${skipped}, images prepared ${imagesPrepared}` +
      `${curtailed ? `, CURTAILED (${candidatesRemaining} left)` : ""}; facts filled ${facts.filled} (${facts.remaining} remaining); Yachtfolio calls ${result.yachtfolioCalls}; Sirv uploads ${result.sirvUploads}; Blob advanced ${result.blob.advanced}${storageError ? `; STORAGE ERROR ${storageError}` : ""}`
  );
  return result;
}
