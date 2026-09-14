/**
 * Bounded backfills — SERVER-ONLY. Shared by scripts/backfill-sirv.mjs and
 * the CRON_SECRET-guarded admin routes so they can be run without a local
 * environment. Both are batch-sized and safe to call repeatedly until they
 * report nothing left.
 *
 *  - backfillSirv: every yacht in selections/in-use.json whose images are not
 *    yet on Sirv gets prepareYachtImages(yfId, { force: true }), at most
 *    `limit` yachts per call. It never reads fleet.json to choose yachts and
 *    deletes nothing from the Blob IMAGES store.
 *  - backfillFacts: picker facts (builder, length, base port) for listed
 *    yachts that have none yet, at most `limit` per call — the same gap fill
 *    the nightly run does from its leftover budget, without waiting for it.
 */

import { inUseYachtIds } from "./in-use.mjs";
import { readYachtRecord } from "./yacht-records.mjs";
import { getImageStore } from "./image-store/index.mjs";
import { prepareYachtImages } from "./image-store/sirv-pipeline.mjs";
import { sirvOps } from "./image-store/sirv-client.mjs";
import { isRateLimitError, redact, yachtfolioOps } from "./yachtfolio/client.mjs";
import { fetchFleetSnapshot, persistFleet, storageFailure } from "./fleet.mjs";
import { fillFactsGaps } from "./nightly.mjs";

export const DEFAULT_SIRV_BATCH = 10;
export const DEFAULT_FACTS_BATCH = 100;

/** True when every prepared image of the record is on Sirv and the job is finished. */
export function isOnSirv(record) {
  const img = record?.images;
  if (!img || img.status === "none" || img.status === "preparing") return false;
  return img.store === "sirv" && img.order.length > 0 && img.order.every((e) => e.store === "sirv" && e.key);
}

export async function backfillSirv({ limit = DEFAULT_SIRV_BATCH } = {}) {
  if (getImageStore() !== "sirv") {
    throw Object.assign(new Error("IMAGE_STORE is not sirv (or Sirv is not fully configured) — nothing to backfill to."), { code: "CONFLICT" });
  }
  const yfBefore = yachtfolioOps().total;
  const sirvBefore = sirvOps();
  let inUse;
  const pending = [];
  try {
    inUse = await inUseYachtIds();
    for (const yfId of inUse) {
      const record = await readYachtRecord(yfId);
      if (!isOnSirv(record)) pending.push(yfId);
    }
  } catch (err) {
    throw storageFailure("read in-use index or records for the Sirv backfill", err);
  }
  const batch = pending.slice(0, Math.max(0, Number(limit) || DEFAULT_SIRV_BATCH));
  const results = [];
  let curtailed = false;
  for (const yfId of batch) {
    try {
      const r = await prepareYachtImages(yfId, { force: true });
      results.push({ yfId, claimed: r.claimed, status: r.record?.images?.status ?? null, uploaded: r.stats?.uploaded ?? 0, failed: r.stats?.failed ?? 0, rateLimited: r.rateLimited });
      if (r.rateLimited) {
        curtailed = true;
        break;
      }
    } catch (err) {
      if (isRateLimitError(err)) {
        curtailed = true;
        results.push({ yfId, error: "Yachtfolio rate limit" });
        break;
      }
      if (err?.code === "STORAGE") throw err;
      results.push({ yfId, error: redact(String(err?.message ?? err), process.env.YACHTFOLIO_PASSKEY) });
    }
  }
  const processed = results.filter((r) => r.claimed && !r.error && !r.rateLimited).length;
  const sirvAfter = sirvOps();
  const out = {
    inUse: inUse.length,
    pending: pending.length,
    processed,
    remaining: pending.length - processed,
    curtailed,
    yachtfolioCalls: yachtfolioOps().total - yfBefore,
    sirvCalls: sirvAfter.calls - sirvBefore.calls,
    sirvUploads: sirvAfter.uploads - sirvBefore.uploads,
    results,
  };
  console.log(`[backfill-sirv] ${out.inUse} in use, ${out.pending} not yet on Sirv, ${processed} processed this call, ${out.remaining} remaining${curtailed ? " (curtailed by a Yachtfolio rate limit)" : ""}; Yachtfolio calls ${out.yachtfolioCalls}, Sirv uploads ${out.sirvUploads}`);
  return out;
}

export async function backfillFacts({ limit = DEFAULT_FACTS_BATCH, debug = false } = {}) {
  const yfBefore = yachtfolioOps().total;
  const snapshot = await fetchFleetSnapshot();
  const cap = Math.max(0, Number(limit) || DEFAULT_FACTS_BATCH);
  // Budget: the one basic-list call plus two calls per yacht, since a record
  // that fails is retried once by the client before it counts as failed.
  const facts = await fillFactsGaps(snapshot, { cap, budget: cap * 2 + 1, debug });
  const sync = await persistFleet(snapshot);
  const out = { ...facts, fleetWritten: sync.fleetWritten, yachtfolioCalls: yachtfolioOps().total - yfBefore, blob: sync.blob };
  console.log(`[backfill-facts] filled ${facts.filled}, remaining ${facts.remaining}${facts.curtailed ? " (curtailed by a Yachtfolio rate limit)" : ""}; fleet.json ${sync.fleetWritten ? "written" : "unchanged"}; Yachtfolio calls ${out.yachtfolioCalls}`);
  return out;
}
