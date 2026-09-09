/**
 * Fleet facts — SERVER-ONLY. The fleet-wide facts document the public fleet
 * page (/2027-charter-season/yachts/<destination>) renders from.
 *
 * The nightly fleet sync caches only the fleet list (id, name, port); length,
 * rate, currency and operating areas exist per yacht only after an on-demand
 * detail fetch. This module gives the Cron a second step that walks the fleet
 * and records those facts for every yacht, one basic record per yacht (the
 * brochure is fetched only when a yacht still has no lead image), inside a
 * time budget so a run always finishes: the stalest yachts go first and the
 * rest are picked up on the next run.
 *
 *   yachtfolio/fleet-facts.json  { updatedAt, yachts: { [id]: FleetFact } }
 *
 * Normalisation is the shared extractYachtFacts(); images go through the same
 * sharp pipeline and manifest as the portal (getYachtImages). Without a
 * passkey, or when the document is missing, the demo fleet is served so the
 * page still renders.
 */

import { REQUEST_DELAY_MS, fetchBasicRecord, loadPasskey, redact, sleep } from "./yachtfolio/client.mjs";
import { TARGET_SEASON, buildReference, extractRateOptions, extractYachtFacts, pickSeason } from "./yachtfolio/normalise.mjs";
import { getFleet, getYachtImages } from "./fleet.mjs";
import { getJson, putJson } from "./storage.mjs";
import { DEMO_YACHTS, demoDetail, demoImages, isDemoFleet } from "./demo/fleet.mjs";

export const FLEET_FACTS_KEY = "yachtfolio/fleet-facts.json";
const REFERENCE_KEY = "yachtfolio/reference.json";
/** Facts older than this are refreshed first on the next run. */
const FACTS_FRESH_MS = 24 * 60 * 60 * 1000;
const FACTS_VERSION = 1;

let memoryFacts = null;

/** Facts for one yacht, as stored. */
function factFrom(yfId, name, facts, rateOptions, images) {
  const summer = rateOptions?.summer ?? null;
  return {
    id: yfId,
    name: (facts.name ?? name ?? "").toUpperCase(),
    lengthM: facts.lengthM ?? null,
    yearRefit: facts.yearRefit ?? "",
    guests: facts.guests ?? null,
    crew: facts.crew ?? null,
    builder: facts.builder ?? "",
    staterooms: facts.staterooms ?? null,
    cruisingArea: facts.cruisingArea ?? "",
    currency: summer?.currency ?? facts.currency ?? null,
    rateMin: summer?.low ?? facts.weeklyRate ?? null,
    rateMax: summer?.high ?? null,
    rateSeason: TARGET_SEASON.label,
    dataSource: facts.dataSource ?? null,
    unavailableForTarget: Boolean(facts.unavailableForTarget),
    missing: facts.missing ?? [],
    leadImageUrl: images?.leadImageUrl ?? "",
    interiorImageUrl: images?.interiorImageUrl ?? "",
    exteriorImageUrl: images?.exteriorImageUrl ?? "",
    lifestyleImageUrl: images?.lifestyleImageUrl ?? "",
    factsAt: new Date().toISOString(),
  };
}

function demoFacts() {
  const yachts = {};
  for (const y of DEMO_YACHTS) {
    const d = demoDetail(y.id);
    const img = demoImages(y.id);
    yachts[String(y.id)] = {
      id: y.id,
      name: d.name,
      lengthM: d.lengthM,
      yearRefit: d.yearRefit,
      guests: d.guests,
      crew: d.crew,
      builder: d.builder,
      staterooms: d.staterooms ? { count: Number.parseInt(d.staterooms, 10) || null, breakdown: (d.staterooms.match(/\(([^)]*)\)/) ?? [])[1] ?? "" } : null,
      cruisingArea: d.cruisingArea,
      currency: d.currency,
      rateMin: d.rateOptions.summer.low,
      rateMax: d.rateOptions.summer.high,
      rateSeason: d.targetSeason,
      dataSource: d.dataSource,
      unavailableForTarget: false,
      missing: d.missing,
      leadImageUrl: img.leadImageUrl,
      interiorImageUrl: img.interiorImageUrl,
      exteriorImageUrl: img.exteriorImageUrl,
      lifestyleImageUrl: img.lifestyleImageUrl,
      factsAt: new Date().toISOString(),
    };
  }
  return { version: FACTS_VERSION, updatedAt: new Date().toISOString(), source: "demo", count: DEMO_YACHTS.length, yachts };
}

/**
 * The facts document the fleet page reads. `source` says where it came from:
 * "yachtfolio" (the Cron-built cache), "demo" (no passkey, or the cache is
 * missing — the caller logs this in the build report).
 */
export async function getFleetFacts() {
  if (isDemoFleet()) return demoFacts();
  let doc = memoryFacts;
  if (!doc) {
    try {
      doc = await getJson(FLEET_FACTS_KEY);
    } catch (err) {
      console.warn(`[fleet-facts] storage read failed: ${String(err?.message ?? err)}`);
      doc = null;
    }
  }
  if (!doc || doc.version !== FACTS_VERSION || !doc.yachts || !Object.keys(doc.yachts).length) {
    console.warn("[fleet-facts] no fleet facts cached yet — serving the demo fleet until the Cron has run.");
    return { ...demoFacts(), fallback: "facts cache missing" };
  }
  memoryFacts = doc;
  return { ...doc, source: "yachtfolio" };
}

/**
 * Cron step: refresh facts for as many yachts as fit in `budgetMs`, stalest
 * first. Returns what was done so the Cron log and /api/health can report it.
 */
export async function syncFleetFacts({ budgetMs = 75_000 } = {}) {
  const started = Date.now();
  if (isDemoFleet()) {
    return { demo: true, checked: 0, refreshed: 0, imagesPrepared: 0, remaining: 0, notes: ["demo fleet — no passkey, nothing synced"] };
  }
  const passkey = await loadPasskey([process.cwd()]);
  const fleet = await getFleet();
  const referenceData = (await getJson(REFERENCE_KEY)) ?? null;
  if (!referenceData?.seasons?.length) {
    return { checked: 0, refreshed: 0, imagesPrepared: 0, remaining: fleet.count, notes: ["reference data (seasons, operating areas) not cached yet — run the fleet sync first"] };
  }
  const reference = buildReference(referenceData);
  const targetSeason = pickSeason(reference.seasons);

  let doc = (await getJson(FLEET_FACTS_KEY)) ?? null;
  if (!doc || doc.version !== FACTS_VERSION) doc = { version: FACTS_VERSION, updatedAt: null, source: "yachtfolio", count: 0, yachts: {} };
  const notes = [];
  const now = Date.now();
  const queue = [...fleet.yachts]
    .map((y) => ({ ...y, at: Date.parse(doc.yachts[String(y.id)]?.factsAt ?? 0) || 0 }))
    .filter((y) => now - y.at > FACTS_FRESH_MS)
    .sort((a, b) => a.at - b.at);

  let refreshed = 0;
  let imagesPrepared = 0;
  let checked = 0;
  for (const y of queue) {
    if (Date.now() - started > budgetMs) break;
    checked += 1;
    try {
      const basic = await fetchBasicRecord(passkey, y.id);
      await sleep(REQUEST_DELAY_MS);
      // No brochure here: the basic record carries length, guests, rates and
      // operating_areas_new, which is all the listing needs.
      const facts = extractYachtFacts({ brochure: null, basic, reference, targetSeason });
      const rateOptions = extractRateOptions({ brochure: null, basic, reference });
      const previous = doc.yachts[String(y.id)];
      let images = previous
        ? { leadImageUrl: previous.leadImageUrl, interiorImageUrl: previous.interiorImageUrl, exteriorImageUrl: previous.exteriorImageUrl, lifestyleImageUrl: previous.lifestyleImageUrl }
        : null;
      if (!images?.leadImageUrl && Date.now() - started < budgetMs - 8000) {
        // First sight of this yacht: prepare its gallery through the shared,
        // manifest-driven pipeline (reuses anything already processed).
        try {
          images = await getYachtImages(y.id);
          imagesPrepared += 1;
        } catch (err) {
          notes.push(`${y.name} (${y.id}): images not prepared — ${redact(String(err?.message ?? err), passkey)}`);
        }
      }
      doc.yachts[String(y.id)] = factFrom(y.id, y.name, facts, rateOptions, images);
      refreshed += 1;
    } catch (err) {
      notes.push(`${y.name} (${y.id}): ${redact(String(err?.message ?? err), passkey)}`);
    }
  }
  // Yachts no longer in the fleet list leave the facts document.
  const current = new Set(fleet.yachts.map((y) => String(y.id)));
  for (const id of Object.keys(doc.yachts)) if (!current.has(id)) delete doc.yachts[id];
  doc.count = Object.keys(doc.yachts).length;
  doc.updatedAt = new Date().toISOString();
  if (refreshed) {
    await putJson(FLEET_FACTS_KEY, doc);
    memoryFacts = doc;
  }
  const remaining = queue.length - checked;
  const summary = `facts: ${refreshed} refreshed of ${queue.length} due (${remaining} left for the next run), ${imagesPrepared} galleries prepared, ${doc.count} yachts in the document`;
  console.log(`[fleet-facts] ${summary}`);
  return { checked, refreshed, imagesPrepared, remaining, count: doc.count, notes: [summary, ...notes] };
}
