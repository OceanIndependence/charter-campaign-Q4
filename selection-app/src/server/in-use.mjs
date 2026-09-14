/**
 * The in-use index — SERVER-ONLY.
 *
 * selections/in-use.json maps each Yachtfolio id to the selections that
 * reference it: { "<yfId>": ["<selectionId>", …] }. A yacht is in use while
 * it appears in a consultant's draft or on that draft's published page. The
 * nightly refresh reads this index, never fleet.json, to decide which yachts
 * to look at, so yachts nobody has picked are never fetched in detail or
 * have images prepared.
 *
 * The index is maintained inside the save, publish and delete paths in
 * pages.mjs. Concurrent saves of two different selections can race on the
 * read-modify-write; the loser's change is picked up by the next save of
 * that selection or by rebuildInUseIndex(), the one place list() is used.
 */

import { getJson, hashJson, listKeys, putJson } from "./storage.mjs";

export const IN_USE_KEY = "selections/in-use.json";
const SELECTIONS_PREFIX = "portal/selections/";
const currentKey = (slug) => `portal/pages/${slug}/current.json`;

function normalise(index) {
  const out = {};
  for (const [id, sels] of Object.entries(index ?? {})) {
    const yfId = Number(id);
    if (!Number.isInteger(yfId) || yfId <= 0 || !Array.isArray(sels)) continue;
    const clean = [...new Set(sels.map(String))].sort();
    if (clean.length) out[String(yfId)] = clean;
  }
  return out;
}

/** The index, or {} when none has been written yet. Storage errors propagate. */
export async function readInUseIndex() {
  return normalise(await getJson(IN_USE_KEY));
}

/** Yachtfolio ids currently in use, ascending. */
export async function inUseYachtIds() {
  return Object.keys(await readInUseIndex()).map(Number).sort((a, b) => a - b);
}

/** Yachtfolio ids referenced by a draft and, when published, by its live page config. */
export function yachtIdsOf(draft, publishedConfig = null) {
  const ids = new Set();
  for (const y of draft?.yachts ?? []) if (Number.isInteger(y?.yfId) && y.yfId > 0) ids.add(y.yfId);
  for (const y of publishedConfig?.yachts ?? []) if (Number.isInteger(y?.yachtfolioId) && y.yachtfolioId > 0) ids.add(y.yachtfolioId);
  return [...ids].sort((a, b) => a - b);
}

/** Pure: the index with `selectionId` referencing exactly `yfIds`. */
export function withSelection(index, selectionId, yfIds) {
  const next = {};
  const wanted = new Set(yfIds.map(String));
  for (const [id, sels] of Object.entries(index)) {
    const kept = sels.filter((s) => s !== selectionId);
    if (wanted.has(id)) kept.push(selectionId);
    if (kept.length) next[id] = kept;
  }
  for (const id of wanted) if (!next[id]) next[id] = [selectionId];
  return normalise(next);
}

async function writeIfChanged(before, after) {
  if (hashJson(before) === hashJson(after)) return false;
  await putJson(IN_USE_KEY, after);
  return true;
}

/** Point the index at exactly these yachts for one selection. Returns true when written. */
export async function setSelectionYachts(selectionId, yfIds) {
  const before = await readInUseIndex();
  return writeIfChanged(before, withSelection(before, String(selectionId), yfIds));
}

/** Drop a deleted selection from the index. Returns true when written. */
export async function removeSelection(selectionId) {
  return setSelectionYachts(selectionId, []);
}

/**
 * Rebuild the index from every stored selection. The only permitted
 * list() — one advanced operation per thousand selections — and never on a
 * runtime path: it backs POST /api/admin/rebuild-in-use-index.
 */
export async function rebuildInUseIndex() {
  const keys = (await listKeys(SELECTIONS_PREFIX)).filter((k) => k.endsWith(".json"));
  let index = {};
  let selections = 0;
  let published = 0;
  for (const key of keys) {
    const draft = await getJson(key);
    if (!draft?.id) continue;
    selections += 1;
    let config = null;
    if (draft.publishedSlug) {
      const current = await getJson(currentKey(draft.publishedSlug));
      if (current?.config && current.draftId === draft.id && !current.unpublished) {
        config = current.config;
        published += 1;
      }
    }
    index = withSelection(index, String(draft.id), yachtIdsOf(draft, config));
  }
  const before = await readInUseIndex();
  const written = await writeIfChanged(before, index);
  return { selections, published, yachts: Object.keys(index).length, written };
}
