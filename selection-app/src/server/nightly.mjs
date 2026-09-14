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

import { REQUEST_DELAY_MS, fetchBasicList, fetchBasicRecordDetailed, isRateLimitError, redact, sleep, yachtfolioOps } from "./yachtfolio/client.mjs";
import { applyFacts, factsFromBasic, fetchFleetSnapshot, getYachtDetail, hasFacts, persistFleet, recordFacts, recordFactsAttempt, storageFailure } from "./fleet.mjs";
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
 * yet. One basic-list call first (it covers the agency's own yachts; rows
 * for yachts not on the charter list are ignored and never count), then
 * one basic record per pending yacht — least recently attempted first — up
 * to `cap` records and `budget` calls. A record that fails or comes back
 * empty is stamped factsTriedAt so the queue moves past it and returns to
 * it later. Mutates the snapshot's facts and factsAdded. Returns
 * { filled, fromList, recordsFetched, recordsFailed, offListIgnored,
 * remaining, curtailed }.
 */
export async function fillFactsGaps(snapshot, { cap = FACTS_PER_RUN, budget = CALL_BUDGET, debug = false } = {}) {
  const { passkey, list, facts } = snapshot;
  const listed = new Set(list.map((y) => y.id));
  const pending = () => list.filter((y) => !facts.get(y.id)?.factsAt);
  const before = yachtfolioOps().total;
  const used = () => yachtfolioOps().total - before;
  // firstFailure: what Yachtfolio answered for the first record that could
  // not be used (status, redacted URL, message; the body only with debug).
  const out = { filled: 0, fromList: 0, recordsFetched: 0, recordsFailed: 0, offListIgnored: 0, remaining: pending().length, curtailed: false, firstFailure: null };
  if (debug) out.debug = { basicList: null };
  const fill = (id, f) => {
    const hadFacts = Boolean(facts.get(id)?.factsAt);
    if (recordFacts(facts, id, f)) snapshot.factsAdded += 1;
    if (!hadFacts) out.filled += 1;
    return !hadFacts;
  };
  if (!out.remaining || budget < 1 || cap < 1) return out;
  try {
    const rows = await fetchBasicList(passkey);
    if (debug) {
      // Field-name check for the agency rows: which keys they carry and what
      // any builder- or length-like key holds on the first row (no other values).
      const first = rows.find((r) => r && typeof r === "object") ?? null;
      const pick = (re) => Object.fromEntries(Object.entries(first ?? {}).filter(([k]) => re.test(k)));
      const ids = rows.map((r) => Number(r?.id_yacht ?? r?.yacht_id ?? r?.id)).filter(Number.isFinite);
      out.debug.basicList = {
        rows: rows.length,
        listedRows: ids.filter((id) => listed.has(id)).length,
        offListIds: ids.filter((id) => !listed.has(id)),
        firstRowKeys: Object.keys(first ?? {}),
        firstRowId: first ? Number(first.id_yacht ?? first.yacht_id ?? first.id) : null,
        builderLike: pick(/build|brand|shipyard|yard|manufact/i),
        lengthLike: pick(/length|loa/i),
        portLike: pick(/port|base/i),
      };
    }
    for (const row of rows) {
      const id = Number(row?.id_yacht ?? row?.yacht_id ?? row?.id);
      if (!Number.isFinite(id)) continue;
      if (!listed.has(id)) {
        out.offListIgnored += 1;
        continue;
      }
      const f = factsFromBasic(row);
      if (hasFacts(f) && fill(id, f)) out.fromList += 1;
    }
    // Oldest attempt first, never-attempted before that; the list order
    // (alphabetical) breaks ties, so a yacht that keeps failing does not
    // hold the queue.
    const queue = pending().sort((a, b) => Date.parse(facts.get(a.id)?.factsTriedAt ?? 0) - Date.parse(facts.get(b.id)?.factsTriedAt ?? 0));
    for (const y of queue) {
      if (out.recordsFetched + out.recordsFailed >= cap || used() + 1 > budget) break;
      await sleep(REQUEST_DELAY_MS);
      let wire = null;
      try {
        wire = await fetchBasicRecordDetailed(passkey, y.id);
        if (!wire.row) throw new Error("no basic record returned");
        fill(y.id, factsFromBasic(wire.row));
        out.recordsFetched += 1;
      } catch (err) {
        if (isRateLimitError(err)) throw err;
        recordFactsAttempt(facts, y.id);
        snapshot.factsAdded += 1;
        out.recordsFailed += 1;
        const message = redact(String(err?.message ?? err), passkey);
        console.warn(`[nightly] basic record for ${y.id} failed: ${message}`);
        if (!out.firstFailure) {
          out.firstFailure = {
            yfId: y.id,
            name: y.name,
            status: wire?.status ?? null,
            url: wire?.url ?? `api_basic.cgi?type=yachts&id_yacht=${y.id}&passkey=…`,
            error: message,
            ...(debug ? { body: redact(String(wire?.raw ?? ""), passkey).slice(0, 500) } : {}),
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
  return out;
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
      if (detail.facts && hasFacts(detail.facts) && recordFacts(snapshot.facts, yfId, { ...detail.facts, factsAt: detail.facts.fetchedAt })) snapshot.factsAdded += 1;
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
  let facts = { filled: 0, fromList: 0, recordsFetched: 0, recordsFailed: 0, offListIgnored: 0, remaining: snapshot.list.filter((y) => !snapshot.facts.get(y.id)?.factsAt).length, curtailed: false };
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
