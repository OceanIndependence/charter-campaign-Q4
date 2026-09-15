/**
 * One-off test-fixture backfill — SERVER-ONLY. Run from the portal import
 * page, never on build or deploy.
 *
 * Every selection in the store before consultant records existed is a test.
 * This attaches all of them to ONE consultant record (Eleanor Bartoli
 * Turner, a row in data/consultants-seed.csv) by moving each draft into her
 * namespace — portal/selections/<eleanorId>/<id>.json — rewriting its
 * dashboard index row, deleting the old copy, and stamping consultantId on
 * its published record so the client page renders her block.
 *
 * It is a fixture, not a fallback: selections created from now on take
 * their consultant from the picker at creation and there is no default.
 * Idempotent — a second run finds everything already in place and changes
 * nothing. The only list() is the one-off scan of portal/selections/.
 */

import { deleteJson, getJson, listKeys, putJson } from "./storage.mjs";
import { findConsultantByEmail } from "./consultants.mjs";
import { importConsultantSeed } from "./consultant-import.mjs";
import { SELECTIONS_PREFIX, currentKey, metaOf, readIndex, removeIndexEntry, selectionKey, indexKey } from "./pages.mjs";

export const FIXTURE_EMAIL = "eleanor@ocyachts.com";

/**
 * @param {ReadonlyArray<{ line: number, name: string, jobTitle: string, phone: string, email: string, whatsapp: string, photoUrl: string }>} seedRows
 * @param {{ updatedBy: string }} opts
 */
export async function attachFixtureConsultant(seedRows, { updatedBy }) {
  // 1. The fixture record: created from her seed row by the same import
  //    function as everyone else (skipped if she already has a record).
  const row = seedRows.find((r) => String(r.email).toLowerCase() === FIXTURE_EMAIL);
  if (!row) throw new Error(`The seed list has no row for ${FIXTURE_EMAIL}.`);
  const imported = await importConsultantSeed([row], { updatedBy });
  const fixture = await findConsultantByEmail(FIXTURE_EMAIL);
  if (!fixture) throw new Error(`No consultant record for ${FIXTURE_EMAIL} after import.`);

  // 2. Every stored selection, wherever it currently lives.
  const keys = (await listKeys(SELECTIONS_PREFIX)).filter((k) => k.endsWith(".json"));
  const moved = [];
  const alreadyAttached = [];
  const skipped = [];
  const pagesUpdated = [];

  for (const key of keys) {
    const rel = key.slice(SELECTIONS_PREFIX.length);
    const parts = rel.split("/");
    if (parts.length !== 2) {
      skipped.push({ key, reason: "Unexpected key shape." });
      continue;
    }
    const [namespace, file] = parts;
    const draft = await getJson(key);
    if (!draft?.id) {
      skipped.push({ key, reason: "Not a selection document." });
      continue;
    }
    const inPlace = namespace === fixture.id && draft.consultantId === fixture.id;
    if (inPlace) {
      alreadyAttached.push({ id: draft.id, clientNames: draft.clientNames ?? "" });
    } else {
      const next = { ...draft, consultantId: fixture.id };
      await putJson(selectionKey(fixture.id, draft.id), next);
      // Index row under the fixture; drop the old namespace's copy.
      const idx = await readIndex(fixture.id);
      idx.items[draft.id] = metaOf(next);
      idx.updatedAt = new Date().toISOString();
      await putJson(indexKey(fixture.id), idx);
      if (namespace !== fixture.id) {
        await deleteJson(key);
        await removeIndexEntry(namespace, draft.id);
      }
      moved.push({ id: draft.id, from: namespace, clientNames: draft.clientNames ?? "", file });
    }

    // 3. The published record, so the live page renders the fixture.
    if (draft.publishedSlug) {
      const current = await getJson(currentKey(draft.publishedSlug));
      if (current && current.draftId === draft.id && current.consultantId !== fixture.id) {
        await putJson(currentKey(draft.publishedSlug), { ...current, consultantId: fixture.id });
        pagesUpdated.push({ slug: draft.publishedSlug, live: !current.unpublished });
      }
    }
  }

  return {
    ranAt: new Date().toISOString(),
    fixture: { id: fixture.id, displayName: fixture.displayName, email: fixture.email, photoStatus: fixture.photoStatus, status: fixture.status },
    fixtureCreated: imported.created.length === 1,
    selectionsFound: keys.length,
    moved,
    alreadyAttached,
    skipped,
    pagesUpdated,
  };
}
