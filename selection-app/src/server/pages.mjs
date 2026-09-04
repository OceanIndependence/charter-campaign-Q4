/**
 * Draft storage and versioned publishing — SERVER-ONLY.
 *
 * Drafts:    portal/drafts/<draftId>.json (autosaved by the form)
 * Published: portal/pages/<slug>/current.json  { slug, version, draftId, publishedAt, config }
 *            portal/pages/<slug>/versions/<n>.json (immutable history)
 *
 * The Tier 3 route /selection/<slug> renders current.json. A published
 * config is a self-contained snapshot — text plus our own processed image
 * copies — so a yacht later disappearing from Yachtfolio never breaks a
 * client page that has already been sent.
 */

import { getJson, putJson } from "./storage.mjs";

const draftKey = (id) => `portal/drafts/${id}.json`;
const currentKey = (slug) => `portal/pages/${slug}/current.json`;
const versionKey = (slug, n) => `portal/pages/${slug}/versions/${n}.json`;

const DRAFT_ID_RE = /^[a-z0-9-]{8,64}$/;
const SLUG_RE = /^[a-z0-9-]{1,120}$/;

export function isValidDraftId(id) {
  return DRAFT_ID_RE.test(String(id ?? ""));
}

export function isValidSlug(slug) {
  return SLUG_RE.test(String(slug ?? ""));
}

export async function getDraft(id) {
  if (!isValidDraftId(id)) return null;
  return getJson(draftKey(id));
}

export async function saveDraft(draft) {
  if (!isValidDraftId(draft?.id)) throw new Error("Invalid draft id.");
  const stored = { ...draft, updatedAt: new Date().toISOString() };
  await putJson(draftKey(draft.id), stored);
  return stored;
}

export async function getPublishedPage(slug) {
  if (!isValidSlug(slug)) return null;
  return getJson(currentKey(slug));
}

/**
 * Publish a draft's mapped config. Reuses the draft's existing slug on
 * republish; otherwise claims `slugBase` (suffixed -2, -3… if another
 * draft holds it). Returns { slug, version }.
 */
export async function publishConfig({ draft, slugBase, buildConfig }) {
  let slug = draft.publishedSlug && isValidSlug(draft.publishedSlug) ? draft.publishedSlug : null;

  if (!slug) {
    slug = slugBase;
    for (let i = 2; i <= 20; i++) {
      const existing = await getJson(currentKey(slug));
      if (!existing || existing.draftId === draft.id) break;
      slug = `${slugBase}-${i}`;
    }
  }

  const current = await getJson(currentKey(slug));
  const version = (current?.version ?? 0) + 1;
  const config = buildConfig(slug);
  const record = {
    slug,
    version,
    draftId: draft.id,
    publishedAt: new Date().toISOString(),
    config,
  };
  await putJson(versionKey(slug, version), record);
  await putJson(currentKey(slug), record);

  if (draft.publishedSlug !== slug) {
    await putJson(draftKey(draft.id), { ...draft, publishedSlug: slug });
  }
  return { slug, version };
}
