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
 * Yachts not in use never get a record or images; the only call ever made
 * for one is a single brochure read for its three picker facts (step 3).
 * A Yachtfolio rate limit stops the run cleanly (curtailed: true, with the
 * number of candidates left for the next night's oldest-first ordering); a
 * storage failure is reported so the cron answers 503.
 */

import { REQUEST_DELAY_MS, fetchBasicList, fetchBrochure, isRateLimitError, redact, sleep, yachtfolioOps } from "./yachtfolio/client.mjs";
import { factsFromBrochure } from "./yachtfolio/normalise.mjs";
import { applyFacts, factsPending, fetchFleetSnapshot, getYachtDetail, hasFacts, persistFleet, recordFacts, recordFactsAttempt, storageFailure } from "./fleet.mjs";
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

/** Stop starting new work this long after a run began (routes allow 120 s). */
export const TIME_BUDGET_MS = 85_000;

/**
 * Fill picker-facts gaps from the brochure — the one Yachtfolio endpoint
 * that answers for every yacht on the charter list. Pending: listed yachts
 * with no facts, plus those stamped by the retired basic-record path with
 * empty facts (re-queued once; an empty brochure answer is final). Least
 * recently attempted first, up to `cap` yachts, `budget` calls and the
 * `deadline`. A brochure that fails is stamped factsTriedAt so the queue
 * moves past it. Mutates the snapshot's facts and factsAdded. Returns
 * { filled, recordsFetched, recordsFailed, remaining, curtailed, timedOut,
 * firstFailure, error }. With `debug`, adds a ten-row sample of the agency
 * basic list reporting only whether `builder` / `other_builder` are filled.
 */
export async function fillFactsGaps(snapshot, { cap = FACTS_PER_RUN, budget = CALL_BUDGET, deadline = Date.now() + TIME_BUDGET_MS, debug = false } = {}) {
  const { passkey, list, facts } = snapshot;
  const pending = () => list.filter((y) => factsPending(facts.get(y.id)));
  const before = yachtfolioOps().total;
  const used = () => yachtfolioOps().total - before;
  // firstFailure: what Yachtfolio answered for the first brochure that could
  // not be used (status, redacted URL, message; the body only with debug).
  const out = { filled: 0, recordsFetched: 0, recordsFailed: 0, remaining: pending().length, curtailed: false, timedOut: false, firstFailure: null, error: null };
  if (debug) out.debug = await sampleAgencyBuilders(passkey);
  if (!out.remaining || budget < 1 || cap < 1) return out;
  try {
    // Oldest attempt first, never-attempted before that; the list order
    // (alphabetical) breaks ties, so a yacht that keeps failing does not
    // hold the queue.
    const queue = pending().sort((a, b) => Date.parse(facts.get(a.id)?.factsTriedAt ?? 0) - Date.parse(facts.get(b.id)?.factsTriedAt ?? 0));
    for (const y of queue) {
      if (out.recordsFetched + out.recordsFailed >= cap || used() + 1 > budget) break;
      if (Date.now() > deadline) {
        out.timedOut = true;
        break;
      }
      await sleep(REQUEST_DELAY_MS);
      let wire = null;
      try {
        wire = await fetchBrochure(passkey, y.id);
        if (!wire.json || typeof wire.json !== "object" || !Object.keys(wire.json).length) throw new Error("empty brochure");
        const wasPending = factsPending(facts.get(y.id));
        if (recordFacts(facts, y.id, { ...factsFromBrochure(wire.json), factsAt: new Date().toISOString(), factsSource: "brochure" })) snapshot.factsAdded += 1;
        if (wasPending) out.filled += 1;
        out.recordsFetched += 1;
      } catch (err) {
        if (isRateLimitError(err)) throw err;
        recordFactsAttempt(facts, y.id);
        snapshot.factsAdded += 1;
        out.recordsFailed += 1;
        const message = redact(String(err?.message ?? err), passkey);
        console.warn(`[nightly] brochure for ${y.id} failed: ${message}`);
        if (!out.firstFailure) {
          out.firstFailure = {
            yfId: y.id,
            name: y.name,
            status: wire?.status ?? err?.status ?? null,
            url: wire?.url ?? err?.url ?? `api_brochure.cgi?id_yacht=${y.id}&passkey=…`,
            error: message,
            ...(debug ? { body: redact(String(wire?.raw ?? err?.raw ?? ""), passkey).slice(0, 500) } : {}),
          };
        }
      }
    }
  } catch (err) {
    if (!isRateLimitError(err)) throw err;
    out.curtailed = true;
    console.warn("[nightly] facts gap fill curtailed by a Yachtfolio rate limit.");
  }
  applyFacts(snapshot);
  out.remaining = pending().length;
  // A batch in which every attempt failed is an error, not a quiet 200.
  if (out.recordsFailed > 0 && out.recordsFetched === 0) {
    out.error = `every brochure fetched this batch failed (${out.recordsFailed}); first: ${out.firstFailure?.error ?? "unknown"}`;
  }
  return out;
}

/**
 * Diagnostic only (?debug=1): does the agency basic list carry a builder?
 * Reads `builder` and `other_builder` from the first ten rows and reports
 * counts and the distinct non-empty values — nothing else from the rows,
 * which carry internal and personal data, is read, kept or logged.
 */
async function sampleAgencyBuilders(passkey) {
  try {
    const rows = (await fetchBasicList(passkey)).slice(0, 10);
    const val = (v) => (v == null ? "" : String(v).trim());
    const sample = rows.map((r) => ({ builder: val(r?.builder), other: val(r?.other_builder) }));
    return {
      agencyBuilderSample: {
        rows: sample.length,
        withBuilder: sample.filter((r) => r.builder).length,
        withOtherBuilder: sample.filter((r) => r.other).length,
        withEither: sample.filter((r) => r.builder || r.other).length,
        distinctValues: [...new Set(sample.flatMap((r) => [r.builder, r.other]).filter(Boolean))],
      },
    };
  } catch (err) {
    return { agencyBuilderSample: { error: redact(String(err?.message ?? err), passkey) } };
  }
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
  const deadline = runStartedAt + TIME_BUDGET_MS;
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
    if (Date.now() > deadline) {
      notes.push("time budget reached — stopping the in-use refresh; the rest is picked up tomorrow.");
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
      if (detail.facts && hasFacts(detail.facts) && recordFacts(snapshot.facts, yfId, { ...detail.facts, factsAt: detail.facts.fetchedAt, factsSource: "detail" })) snapshot.factsAdded += 1;
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
  let facts = { filled: 0, recordsFetched: 0, recordsFailed: 0, remaining: snapshot.list.filter((y) => factsPending(snapshot.facts.get(y.id))).length, curtailed: false, timedOut: false, firstFailure: null, error: null };
  if (!curtailed && !storageError) {
    const remainingBudget = callBudget - used();
    if (remainingBudget > 1 && Date.now() < deadline) facts = await fillFactsGaps(snapshot, { cap: factsCap, budget: remainingBudget, deadline });
    else notes.push("no call or time budget left for the facts gap fill tonight.");
    if (facts.error) notes.push(`facts gap fill: ${facts.error}`);
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
