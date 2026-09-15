/**
 * Selections (drafts), the per-consultant dashboard index, and versioned
 * publishing — SERVER-ONLY.
 *
 * Selections: portal/selections/<consultantId>/<id>.json   full editable draft
 * Index:      portal/index/<consultantId>.json              { items: { id: meta } }
 *             one small document per consultant carrying exactly what the
 *             dashboard table needs, rewritten on every save/publish/
 *             unpublish/delete — the list never parses full page configs.
 * Published:  portal/pages/<slug>/current.json         { slug, version, owner,
 *             consultantId, draftId, publishedAt, unpublished?, config }
 *             portal/pages/<slug>/versions/<n>.json     immutable history;
 *             unpublish flags current.json offline, rollback appends a new
 *             version copied from an old one, so history is never rewritten.
 *
 * A selection BELONGS to a consultant record (consultants/<id>.json) for its
 * whole life. `consultantId` is chosen once, at creation — from the picker
 * today, pre-filled from the signed-in consultant once real sign-in lands —
 * and is never taken from a save body, so it cannot be reassigned by anyone.
 * Every key is namespaced by that consultantId, so isolation is structural:
 * a consultant's dashboard reads only their own index, and a shared URL to
 * someone else's selection is a NOT_FOUND, not a permission check that could
 * be forgotten. Every entry point takes an `access` object built by
 * selectionAccess() in the auth module: { consultantId, identity }.
 *
 * `owner` is the signed-in identity that created the record, stamped
 * server-side for audit only. Client pages resolve consultantId live at
 * render (consultant-render.ts): specs freeze at publish, the consultant
 * does not.
 *
 * The earlier single working draft (portal/drafts/<identityId>/working.json)
 * is imported as a selection on the consultant's first dashboard load.
 *
 * Every save, publish, unpublish, rollback and delete also updates the
 * in-use index (in-use.mjs) so the nightly refresh knows which yachts are
 * referenced by a draft or a live page.
 *
 * Tiers: a selection is Tier 3 (Yacht Selection, the original shape) or
 * Tier 2 (Personalised Atlas). The tier is fixed at creation; everything
 * here is shared, and the few places that depend on the shape branch on
 * tierOf(). Published pages of both tiers share one slug namespace.
 */

import { randomUUID } from "node:crypto";
import { deleteJson, getJson, hashJson, listKeys, noteStorageError, putJson } from "./storage.mjs";
import { removeSelection as removeFromInUse, setSelectionYachts, yachtIdsOf } from "./in-use.mjs";

const NAMESPACE_RE = /^[A-Za-z0-9._@:-]{1,128}$/;
const SLUG_RE = /^[a-z0-9-]{1,120}$/;
const ID_RE = /^[A-Za-z0-9-]{8,64}$/;

export const SELECTIONS_PREFIX = "portal/selections/";
export const selectionKey = (consultantId, id) => `${SELECTIONS_PREFIX}${consultantId}/${id}.json`;
export const indexKey = (consultantId) => `portal/index/${consultantId}.json`;
const INDEX_PREFIX = "portal/index/";
const legacyWorkingKey = (identityId) => `portal/drafts/${identityId}/working.json`;
export const currentKey = (slug) => `portal/pages/${slug}/current.json`;
const versionKey = (slug, n) => `portal/pages/${slug}/versions/${n}.json`;

const fail = (code, message) => Object.assign(new Error(message), { code });

/** 2 for a Personalised Atlas, 3 for a Yacht Selection (and for anything saved before tiers). */
export function tierOf(record) {
  return record?.tier === 2 ? 2 : 3;
}

/** Client page path for a published record of either tier. */
export function clientPathFor(tier, slug) {
  return tier === 2 ? `/atlas/${slug}` : `/selection/${slug}`;
}

export function isValidSlug(slug) {
  return SLUG_RE.test(String(slug ?? ""));
}

/** The consultant namespace every key hangs off. */
function requireConsultantId(access) {
  const id = access?.consultantId;
  if (!id || !NAMESPACE_RE.test(id)) throw fail("FORBIDDEN", "No consultant record for this session.");
  return id;
}

function requireId(id) {
  if (!ID_RE.test(String(id ?? ""))) throw fail("INVALID", "Invalid selection id.");
  return String(id);
}

function ownerOf(identity) {
  return { id: identity?.id ?? "", email: identity?.email ?? "", name: identity?.name ?? "" };
}

/**
 * Who may switch the dashboard to "All consultants". PORTAL_MANAGERS is a
 * comma-separated list of consultant ids or emails; when it is unset (the
 * staging default) everyone may. With Microsoft sign-in the natural
 * replacement is a group claim on the token, checked in the same place.
 * Viewing all rows never opens them: getSelection() is namespace-bound.
 */
export function canViewAll(identity) {
  const raw = process.env.PORTAL_MANAGERS;
  if (!raw || !raw.trim()) return true;
  const allowed = new Set(raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
  const id = String(identity?.id ?? "").toLowerCase();
  const email = String(identity?.email ?? "").toLowerCase();
  return allowed.has(id) || (email !== "" && allowed.has(email));
}

/* ------------------------------------------------------------- metadata */

function namedYachtCount(draft) {
  return (draft?.yachts ?? []).filter((y) => (y?.name ?? "").trim()).length;
}

/** The dashboard row for a draft — derived, never edited by hand. */
export function metaOf(draft) {
  const p = draft.published;
  const tier = tierOf(draft);
  return {
    id: draft.id,
    tier,
    owner: draft.owner,
    consultantId: draft.consultantId ?? null,
    clientNames: draft.clientNames ?? "",
    headline: (tier === 2 ? draft.clientGreeting : draft.headline) ?? "",
    slug: draft.publishedSlug ?? null,
    yachtCount: namedYachtCount(draft),
    status: !p ? "draft" : p.live ? "published" : "unpublished",
    version: p?.version ?? 0,
    createdAt: draft.createdAt ?? draft.updatedAt,
    updatedAt: draft.updatedAt,
    publishedAt: p?.publishedAt ?? null,
    unpublishedAt: p?.unpublishedAt ?? null,
  };
}

export async function readIndex(consultantId) {
  const idx = await getJson(indexKey(consultantId));
  return idx && typeof idx === "object" && idx.items ? idx : { updatedAt: null, items: {} };
}

async function writeIndexEntry(consultantId, meta) {
  const idx = await readIndex(consultantId);
  // Autosave fires on every pause in typing; the row's metadata rarely
  // changes with it. Skip the index write when the row is unchanged, since
  // every write is a billed Blob operation.
  const { updatedAt: _u, ...next } = meta;
  const { updatedAt: _p, ...prev } = idx.items[meta.id] ?? {};
  if (idx.items[meta.id] && hashJson(next) === hashJson(prev)) return;
  idx.items[meta.id] = meta;
  idx.updatedAt = new Date().toISOString();
  await putJson(indexKey(consultantId), idx);
}

export async function removeIndexEntry(consultantId, id) {
  const idx = await readIndex(consultantId);
  if (!(id in idx.items)) return;
  delete idx.items[id];
  idx.updatedAt = new Date().toISOString();
  await putJson(indexKey(consultantId), idx);
}

/** Persist a draft under its consultant and its index row together, then the in-use index. */
export async function store(draft) {
  const consultantId = requireConsultantId({ consultantId: draft.consultantId });
  await putJson(selectionKey(consultantId, draft.id), draft);
  await writeIndexEntry(consultantId, metaOf(draft));
  await syncInUse(draft);
  return draft;
}

/**
 * Keep selections/in-use.json pointing at this selection's yachts: those in
 * the draft plus, when it is published, those frozen on the live page (a
 * yacht removed from the draft is still in use while the page shows it).
 * A storage failure here is logged and reported through /api/health; the
 * save itself has already succeeded and the index is rebuilt on demand.
 */
async function syncInUse(draft) {
  try {
    let config = null;
    if (draft.publishedSlug && isValidSlug(draft.publishedSlug)) {
      const current = await getJson(currentKey(draft.publishedSlug));
      if (current?.config && current.draftId === draft.id && !current.unpublished) config = current.config;
    }
    await setSelectionYachts(draft.id, yachtIdsOf(draft, config));
  } catch (err) {
    noteStorageError(`in-use index for selection ${draft.id}`, err);
  }
}

/* ---------------------------------------------------------- selections */

function emptyDestination() {
  const atlas = (value = "") => ({ value, source: "atlas" });
  return {
    destinationId: null,
    name: "",
    eyebrow: atlas(),
    deckLine: atlas(),
    description: atlas(),
    consultantNote: { value: "", source: "consultant" },
    images: [atlas(), atlas()],
    atlas: null,
  };
}

const TIER2_DISCLAIMER = "These vessels are offered subject to change, price change, and owners’ final approval.";

/**
 * The legacy per-selection contact block. Kept on the draft as the
 * holding-page fallback; the client page always renders the consultant
 * record live, so this is filled from the record at creation.
 */
function consultantBlockFrom(consultant) {
  return {
    name: consultant?.displayName ?? "",
    title: consultant?.jobTitle ?? "",
    phone: consultant?.phone ?? "",
    email: consultant?.email ?? "",
    whatsapp: consultant?.whatsapp ?? "",
    photoUrl: consultant?.photoStatus === "ok" ? consultant.photoUrl ?? "" : "",
  };
}

function baseDraft(identity, consultant) {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    owner: ownerOf(identity),
    consultantId: consultant.id,
    createdAt: now,
    updatedAt: now,
    clientNames: "",
    consultant: consultantBlockFrom(consultant),
  };
}

/** A new Personalised Atlas: three empty destination slots, no yachts yet. */
function emptyTier2Draft(identity, consultant) {
  return {
    ...baseDraft(identity, consultant),
    tier: 2,
    slug: "",
    clientGreeting: "",
    introNote: "",
    seasonNote: null,
    footerDisclaimer: TIER2_DISCLAIMER,
    destinations: [emptyDestination(), emptyDestination(), emptyDestination()],
    yachts: [],
  };
}

function emptyDraft(identity, consultant) {
  return {
    ...baseDraft(identity, consultant),
    tier: 3,
    season: "",
    region: "",
    headline: "",
    subHeadline: "",
    welcome: "",
    theme: "dark",
    yachts: [],
    sections: { costs: true, itinerary: true, itineraryLinks: [], compare: true },
  };
}

/**
 * Import the pre-dashboard single working draft as a selection, once, under
 * the session consultant. An empty legacy draft is simply discarded.
 */
async function migrateLegacyDraft(access) {
  const consultantId = requireConsultantId(access);
  const identityId = access.identity?.id;
  if (!identityId || !NAMESPACE_RE.test(identityId)) return;
  const legacy = await getJson(legacyWorkingKey(identityId));
  if (!legacy) return;
  const hasContent =
    (legacy.clientNames ?? "").trim() ||
    (legacy.headline ?? "").trim() ||
    namedYachtCount(legacy) > 0 ||
    legacy.publishedSlug;
  if (hasContent) {
    const id = ID_RE.test(String(legacy.id ?? "")) ? legacy.id : randomUUID();
    if (!(await getJson(selectionKey(consultantId, id)))) {
      const now = new Date().toISOString();
      let published;
      if (legacy.publishedSlug && isValidSlug(legacy.publishedSlug)) {
        const cur = await getJson(currentKey(legacy.publishedSlug));
        if (cur?.version) {
          published = {
            version: cur.version,
            publishedAt: cur.publishedAt,
            live: !cur.unpublished,
            unpublishedAt: cur.unpublishedAt ?? null,
          };
        }
      }
      await store({
        ...legacy,
        id,
        owner: ownerOf(access.identity),
        consultantId,
        createdAt: legacy.updatedAt ?? now,
        updatedAt: legacy.updatedAt ?? now,
        ...(published ? { published } : {}),
      });
    }
  }
  await deleteJson(legacyWorkingKey(identityId));
}

/** Dashboard rows, newest edited first. scope "all" needs canViewAll. */
export async function listSelections(access, { scope = "mine" } = {}) {
  const consultantId = requireConsultantId(access);
  await migrateLegacyDraft(access);
  let items;
  if (scope === "all") {
    if (!canViewAll(access.identity)) throw fail("FORBIDDEN", "You may only view your own selections.");
    const keys = await listKeys(INDEX_PREFIX);
    const indexes = await Promise.all(keys.map((k) => getJson(k)));
    items = indexes.flatMap((idx) => Object.values(idx?.items ?? {}));
  } else {
    items = Object.values((await readIndex(consultantId)).items);
  }
  return items.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

/**
 * One of the session consultant's own selections, or NOT_FOUND. The key is
 * namespaced by consultantId, so another consultant's id (from a shared
 * URL) simply does not exist here — view, edit, publish and every other
 * route go through this.
 */
export async function getSelection(access, id) {
  const consultantId = requireConsultantId(access);
  const draft = await getJson(selectionKey(consultantId, requireId(id)));
  if (!draft) throw fail("NOT_FOUND", "This selection does not exist or is not yours.");
  return draft;
}

/**
 * Create an empty selection for `consultant` (an active consultant record,
 * validated by the route), or duplicate one of the session consultant's own
 * as a fresh draft for a new client: the yachts (and their images, rates and
 * highlights) carry across; the client name, welcome greeting, per-yacht
 * notes to the client and any publish state are cleared. A duplicate stays
 * with the consultant who owns the source.
 */
export async function createSelection(access, { duplicateOf, tier, consultant } = {}) {
  let draft;
  if (duplicateOf) {
    const src = await getSelection(access, duplicateOf);
    const owningConsultant = consultant?.id === src.consultantId ? consultant : { id: src.consultantId };
    // A duplicate keeps its source's tier — the tier is fixed once created.
    const base = tierOf(src) === 2 ? emptyTier2Draft(access.identity, owningConsultant) : emptyDraft(access.identity, owningConsultant);
    draft = {
      ...src,
      id: base.id,
      tier: tierOf(src),
      owner: ownerOf(access.identity),
      consultantId: src.consultantId,
      createdAt: base.createdAt,
      updatedAt: base.updatedAt,
      clientNames: "",
      ...(tierOf(src) === 2
        ? {
            slug: "",
            clientGreeting: "",
            introNote: "",
            yachts: (src.yachts ?? []).map((y) => ({ ...y, uid: randomUUID(), consultantNote: "" })),
          }
        : {
            welcome: "",
            yachts: (src.yachts ?? []).map((y) => ({ ...y, uid: randomUUID(), notes: "" })),
          }),
    };
    delete draft.publishedSlug;
    delete draft.published;
  } else {
    if (!consultant?.id) throw fail("INVALID", "Choose the consultant this selection belongs to.");
    draft = Number(tier) === 2 ? emptyTier2Draft(access.identity, consultant) : emptyDraft(access.identity, consultant);
  }
  return store(draft);
}

/**
 * Save a selection. Owner, consultant, creation date and publish state are
 * always taken from the stored record, so nothing in the request body can
 * forge or reassign them — a body carrying a different consultantId is
 * rejected outright rather than silently ignored.
 */
export async function saveSelection(access, id, incoming) {
  const existing = await getSelection(access, id);
  if (incoming?.consultantId != null && incoming.consultantId !== existing.consultantId) {
    throw fail("FORBIDDEN", "A selection cannot be moved to another consultant.");
  }
  const stored = {
    ...incoming,
    id: existing.id,
    tier: tierOf(existing),
    owner: existing.owner ?? ownerOf(access.identity),
    consultantId: existing.consultantId,
    createdAt: existing.createdAt,
    publishedSlug: existing.publishedSlug,
    published: existing.published,
    updatedAt: new Date().toISOString(),
  };
  if (!stored.publishedSlug) delete stored.publishedSlug;
  if (!stored.published) delete stored.published;
  return store(stored);
}

/** Delete a never-published draft. Published selections are unpublished instead. */
export async function deleteSelection(access, id) {
  const consultantId = requireConsultantId(access);
  const existing = await getSelection(access, id);
  if (existing.published) {
    throw fail("CONFLICT", "Published selections are unpublished, never deleted, so the version history survives.");
  }
  await deleteJson(selectionKey(consultantId, existing.id));
  await removeIndexEntry(consultantId, existing.id);
  try {
    await removeFromInUse(existing.id);
  } catch (err) {
    noteStorageError(`in-use index for deleted selection ${existing.id}`, err);
  }
}

/* ---------------------------------------------------------- publishing */

export async function getPublishedPage(slug) {
  if (!isValidSlug(slug)) return null;
  const record = await getJson(currentKey(slug));
  return record && !record.unpublished ? record : null;
}

/** The consultant a published record belongs to: consultantId, else (pre-records pages) the owner identity. */
function belongsTo(current, access) {
  if (current?.consultantId) return current.consultantId === access.consultantId;
  return !current?.owner?.id || current.owner.id === access.identity?.id;
}

async function ownedCurrent(access, slug) {
  const current = await getJson(currentKey(slug));
  if (current && !belongsTo(current, access)) {
    throw fail("FORBIDDEN", "This client page belongs to another consultant.");
  }
  return current;
}

function publishStateOf(record) {
  return {
    version: record.version,
    publishedAt: record.publishedAt,
    live: !record.unpublished,
    unpublishedAt: record.unpublishedAt ?? null,
  };
}

/**
 * Publish a selection as a versioned client page. Reuses its slug on
 * republish; otherwise claims slugBase, suffixing -2, -3… past any slug that
 * belongs to someone else.
 */
export async function publishSelection({ access, id, slugBase, buildConfig }) {
  const draft = await getSelection(access, id);

  let slug = draft.publishedSlug && isValidSlug(draft.publishedSlug) ? draft.publishedSlug : null;
  if (slug) {
    await ownedCurrent(access, slug);
  } else {
    if (!isValidSlug(slugBase)) throw fail("INVALID", "Cannot derive a client page address.");
    slug = slugBase;
    for (let i = 2; i <= 50; i++) {
      const existing = await getJson(currentKey(slug));
      if (!existing || belongsTo(existing, access)) break;
      slug = `${slugBase}-${i}`;
    }
  }

  const current = await ownedCurrent(access, slug);
  const record = {
    slug,
    version: (current?.version ?? 0) + 1,
    owner: ownerOf(access.identity),
    // Resolved live on every render of the client page.
    consultantId: draft.consultantId,
    draftId: draft.id,
    publishedAt: new Date().toISOString(),
    config: buildConfig(slug),
  };
  await putJson(versionKey(slug, record.version), record);
  await putJson(currentKey(slug), record);

  await store({ ...draft, publishedSlug: slug, published: publishStateOf(record) });
  return { slug, version: record.version };
}

/** Take the client page offline; the record and every version are kept. */
export async function unpublishSelection(access, id) {
  const draft = await getSelection(access, id);
  if (!draft.publishedSlug) throw fail("CONFLICT", "This selection has not been published.");
  const current = await ownedCurrent(access, draft.publishedSlug);
  if (!current) throw fail("NOT_FOUND", "The published page no longer exists.");
  if (!current.unpublished) {
    const record = { ...current, unpublished: true, unpublishedAt: new Date().toISOString() };
    await putJson(currentKey(draft.publishedSlug), record);
    await store({ ...draft, published: publishStateOf(record) });
  }
  return { slug: draft.publishedSlug };
}

/** Version history of a published selection, newest first. */
export async function listVersions(access, id) {
  const draft = await getSelection(access, id);
  if (!draft.publishedSlug) return [];
  const current = await ownedCurrent(access, draft.publishedSlug);
  if (!current) return [];
  const versions = [];
  for (let n = current.version; n >= 1; n--) {
    const rec = await getJson(versionKey(draft.publishedSlug, n));
    if (!rec) continue;
    versions.push({
      version: n,
      publishedAt: rec.publishedAt,
      yachtCount: rec.config?.yachts?.length ?? 0,
      clientNames: rec.config?.clientNames ?? "",
      headline: (rec.config?.tier === 2 ? rec.config?.clientGreeting : rec.config?.headline) ?? "",
      rolledBackFrom: rec.rolledBackFrom ?? null,
      isCurrent: n === current.version && !current.unpublished,
    });
  }
  return versions;
}

/**
 * Restore the live client page to an earlier version's content. Appends a
 * new version (history is never rewritten) and puts the page back online.
 * The editable draft is left untouched.
 */
export async function rollbackSelection(access, id, toVersion) {
  const draft = await getSelection(access, id);
  if (!draft.publishedSlug) throw fail("CONFLICT", "This selection has not been published.");
  const slug = draft.publishedSlug;
  const current = await ownedCurrent(access, slug);
  if (!current) throw fail("NOT_FOUND", "The published page no longer exists.");
  const n = Number(toVersion);
  if (!Number.isInteger(n) || n < 1 || n > current.version) throw fail("INVALID", "No such version.");
  const target = await getJson(versionKey(slug, n));
  if (!target) throw fail("NOT_FOUND", "That version is missing from storage.");

  const record = {
    ...target,
    version: current.version + 1,
    owner: ownerOf(access.identity),
    consultantId: draft.consultantId,
    draftId: draft.id,
    publishedAt: new Date().toISOString(),
    rolledBackFrom: n,
    unpublished: false,
    unpublishedAt: null,
  };
  await putJson(versionKey(slug, record.version), record);
  await putJson(currentKey(slug), record);
  await store({ ...draft, published: publishStateOf(record) });
  return { slug, version: record.version, rolledBackFrom: n };
}
