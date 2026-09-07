/**
 * Draft storage and versioned publishing, owned by a consultant identity —
 * SERVER-ONLY.
 *
 * Drafts:    portal/drafts/<ownerId>/working.json   (one working draft per
 *            consultant; owner-namespaced so isolation is structural)
 * Published: portal/pages/<slug>/current.json        { slug, version, owner,
 *            draftId, publishedAt, config }
 *            portal/pages/<slug>/versions/<n>.json    (immutable history)
 *
 * `owner` ({ id, email, name }) is the consultant's identity, stamped
 * server-side from the session — never from the request body. Ownership is
 * keyed on owner.id (the Microsoft object ID once live; a fixed id under the
 * dev stub). The Tier 3 route /selection/<slug> renders current.json for
 * anyone (client pages are the deliverable); only the owner may edit their
 * draft or republish their page.
 *
 * The owner-namespaced key layout is identical whether owner.id comes from
 * the stub or from Microsoft, so swapping the provider changes nothing here.
 */

import { randomUUID } from "node:crypto";
import { getJson, putJson } from "./storage.mjs";

const OWNER_RE = /^[A-Za-z0-9._@:-]{1,128}$/;
const SLUG_RE = /^[a-z0-9-]{1,120}$/;

const workingKey = (ownerId) => `portal/drafts/${ownerId}/working.json`;
const currentKey = (slug) => `portal/pages/${slug}/current.json`;
const versionKey = (slug, n) => `portal/pages/${slug}/versions/${n}.json`;

export function isValidSlug(slug) {
  return SLUG_RE.test(String(slug ?? ""));
}

function requireOwnerId(identity) {
  const id = identity?.id;
  if (!id || !OWNER_RE.test(id)) throw new Error("Invalid consultant identity.");
  return id;
}

function ownerOf(identity) {
  return { id: identity.id, email: identity.email ?? "", name: identity.name ?? "" };
}

/** A consultant's working draft, or null if they have none yet. */
export async function getWorkingDraft(identity) {
  return getJson(workingKey(requireOwnerId(identity)));
}

/** Create an empty working draft owned by this identity (contact prefilled). */
function emptyDraft(identity) {
  return {
    id: randomUUID(),
    owner: ownerOf(identity),
    updatedAt: new Date().toISOString(),
    clientNames: "",
    season: "",
    region: "",
    headline: "",
    yachts: [],
    sections: { costs: true, itinerary: true, itineraryUrl: "", compare: true },
    consultant: {
      name: identity.name ?? "",
      title: "Charter Consultant, Ocean Independence",
      phone: "",
      email: identity.email ?? "",
      whatsapp: "",
      photoUrl: "",
    },
  };
}

/** Return the consultant's working draft, creating an empty one if needed. */
export async function getOrCreateWorkingDraft(identity) {
  const existing = await getWorkingDraft(identity);
  if (existing) return existing;
  const draft = emptyDraft(identity);
  await putJson(workingKey(requireOwnerId(identity)), draft);
  return draft;
}

/**
 * Save the consultant's working draft. Owner is always (re)stamped from the
 * session identity, so a forged owner in the body cannot take effect.
 */
export async function saveWorkingDraft(identity, incoming) {
  const ownerId = requireOwnerId(identity);
  const existing = await getWorkingDraft(identity);
  const stored = {
    ...incoming,
    id: existing?.id ?? incoming?.id ?? randomUUID(),
    owner: ownerOf(identity),
    publishedSlug: existing?.publishedSlug ?? incoming?.publishedSlug,
    updatedAt: new Date().toISOString(),
  };
  await putJson(workingKey(ownerId), stored);
  return stored;
}

export async function getPublishedPage(slug) {
  if (!isValidSlug(slug)) return null;
  return getJson(currentKey(slug));
}

/**
 * Publish the consultant's working draft as a versioned client page.
 * Reuses the draft's slug on republish (owner-checked); otherwise claims
 * slugBase, suffixing -2, -3… past any slug owned by someone else.
 */
export async function publishWorkingDraft({ identity, slugBase, buildConfig }) {
  requireOwnerId(identity);
  const draft = await getWorkingDraft(identity);
  if (!draft) throw new Error("No working draft to publish.");

  let slug = draft.publishedSlug && isValidSlug(draft.publishedSlug) ? draft.publishedSlug : null;

  if (slug) {
    const existing = await getJson(currentKey(slug));
    if (existing && existing.owner?.id && existing.owner.id !== identity.id) {
      // Another consultant owns this slug — never overwrite it.
      const err = new Error("This client page is owned by another consultant.");
      err.code = "FORBIDDEN";
      throw err;
    }
  } else {
    slug = slugBase;
    for (let i = 2; i <= 50; i++) {
      const existing = await getJson(currentKey(slug));
      if (!existing || existing.owner?.id === identity.id) break;
      slug = `${slugBase}-${i}`;
    }
  }

  const current = await getJson(currentKey(slug));
  if (current && current.owner?.id && current.owner.id !== identity.id) {
    const err = new Error("This client page is owned by another consultant.");
    err.code = "FORBIDDEN";
    throw err;
  }

  const version = (current?.version ?? 0) + 1;
  const record = {
    slug,
    version,
    owner: ownerOf(identity),
    draftId: draft.id,
    publishedAt: new Date().toISOString(),
    config: buildConfig(slug),
  };
  await putJson(versionKey(slug, version), record);
  await putJson(currentKey(slug), record);

  if (draft.publishedSlug !== slug) {
    await putJson(workingKey(identity.id), { ...draft, publishedSlug: slug });
  }
  return { slug, version };
}
