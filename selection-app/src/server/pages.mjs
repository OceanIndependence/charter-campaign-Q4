/**
 * Selections (drafts), the per-consultant dashboard index, and versioned
 * publishing — SERVER-ONLY.
 *
 * Selections: portal/selections/<ownerId>/<id>.json   full editable draft
 * Index:      portal/index/<ownerId>.json              { items: { id: meta } }
 *             one small document per consultant carrying exactly what the
 *             dashboard table needs, rewritten on every save/publish/
 *             unpublish/delete — the list never parses full page configs.
 * Published:  portal/pages/<slug>/current.json         { slug, version, owner,
 *             draftId, publishedAt, unpublished?, config }
 *             portal/pages/<slug>/versions/<n>.json     immutable history;
 *             unpublish flags current.json offline, rollback appends a new
 *             version copied from an old one, so history is never rewritten.
 *
 * `owner` is stamped server-side from the session, never from the request
 * body; every key is owner-namespaced so isolation is structural. The layout
 * is the same whether owner.id comes from the dev stub or from Microsoft.
 *
 * The earlier single working draft (portal/drafts/<ownerId>/working.json) is
 * imported as a selection on the consultant's first dashboard load.
 *
 * Tiers: a selection is Tier 3 (Yacht Selection, the original shape) or
 * Tier 2 (Personalised Atlas). The tier is fixed at creation; everything
 * here is shared, and the few places that depend on the shape branch on
 * tierOf(). Published pages of both tiers share one slug namespace.
 */

import { randomUUID } from "node:crypto";
import { deleteJson, getJson, hashJson, listKeys, putJson } from "./storage.mjs";

const OWNER_RE = /^[A-Za-z0-9._@:-]{1,128}$/;
const SLUG_RE = /^[a-z0-9-]{1,120}$/;
const ID_RE = /^[A-Za-z0-9-]{8,64}$/;

const selectionKey = (ownerId, id) => `portal/selections/${ownerId}/${id}.json`;
const indexKey = (ownerId) => `portal/index/${ownerId}.json`;
const INDEX_PREFIX = "portal/index/";
const legacyWorkingKey = (ownerId) => `portal/drafts/${ownerId}/working.json`;
const currentKey = (slug) => `portal/pages/${slug}/current.json`;
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

function requireOwnerId(identity) {
  const id = identity?.id;
  if (!id || !OWNER_RE.test(id)) throw fail("FORBIDDEN", "Invalid consultant identity.");
  return id;
}

function requireId(id) {
  if (!ID_RE.test(String(id ?? ""))) throw fail("INVALID", "Invalid selection id.");
  return String(id);
}

function ownerOf(identity) {
  return { id: identity.id, email: identity.email ?? "", name: identity.name ?? "" };
}

/**
 * Who may switch the dashboard to "All consultants". PORTAL_MANAGERS is a
 * comma-separated list of consultant ids or emails; when it is unset (the
 * staging default) everyone may. With Microsoft sign-in the natural
 * replacement is a group claim on the token, checked in the same place.
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
function metaOf(draft) {
  const p = draft.published;
  const tier = tierOf(draft);
  return {
    id: draft.id,
    tier,
    owner: draft.owner,
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

async function readIndex(ownerId) {
  const idx = await getJson(indexKey(ownerId));
  return idx && typeof idx === "object" && idx.items ? idx : { updatedAt: null, items: {} };
}

async function writeIndexEntry(ownerId, meta) {
  const idx = await readIndex(ownerId);
  // Autosave fires on every pause in typing; the row's metadata rarely
  // changes with it. Skip the index write when the row is unchanged, since
  // every write is a billed Blob operation.
  const { updatedAt: _u, ...next } = meta;
  const { updatedAt: _p, ...prev } = idx.items[meta.id] ?? {};
  if (idx.items[meta.id] && hashJson(next) === hashJson(prev)) return;
  idx.items[meta.id] = meta;
  idx.updatedAt = new Date().toISOString();
  await putJson(indexKey(ownerId), idx);
}

async function removeIndexEntry(ownerId, id) {
  const idx = await readIndex(ownerId);
  if (!(id in idx.items)) return;
  delete idx.items[id];
  idx.updatedAt = new Date().toISOString();
  await putJson(indexKey(ownerId), idx);
}

/** Persist a draft and its index row together. */
async function store(ownerId, draft) {
  await putJson(selectionKey(ownerId, draft.id), draft);
  await writeIndexEntry(ownerId, metaOf(draft));
  return draft;
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

/** A new Personalised Atlas: three empty destination slots, no yachts yet. */
function emptyTier2Draft(identity) {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tier: 2,
    owner: ownerOf(identity),
    createdAt: now,
    updatedAt: now,
    clientNames: "",
    slug: "",
    clientGreeting: "",
    introNote: "",
    seasonNote: null,
    footerDisclaimer: TIER2_DISCLAIMER,
    destinations: [emptyDestination(), emptyDestination(), emptyDestination()],
    yachts: [],
    consultant: consultantOf(identity),
  };
}

function consultantOf(identity) {
  return {
    name: identity.name ?? "",
    title: "Charter Consultant, Ocean Independence",
    phone: "",
    email: identity.email ?? "",
    whatsapp: "",
    photoUrl: "",
  };
}

function emptyDraft(identity) {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tier: 3,
    owner: ownerOf(identity),
    createdAt: now,
    updatedAt: now,
    clientNames: "",
    season: "",
    region: "",
    headline: "",
    subHeadline: "",
    welcome: "",
    theme: "dark",
    yachts: [],
    sections: { costs: true, itinerary: true, itineraryUrl: "", compare: true },
    consultant: consultantOf(identity),
  };
}

/**
 * Import the pre-dashboard single working draft as a selection, once. An
 * empty legacy draft is simply discarded.
 */
async function migrateLegacyDraft(identity) {
  const ownerId = requireOwnerId(identity);
  const legacy = await getJson(legacyWorkingKey(ownerId));
  if (!legacy) return;
  const hasContent =
    (legacy.clientNames ?? "").trim() ||
    (legacy.headline ?? "").trim() ||
    namedYachtCount(legacy) > 0 ||
    legacy.publishedSlug;
  if (hasContent) {
    const id = ID_RE.test(String(legacy.id ?? "")) ? legacy.id : randomUUID();
    if (!(await getJson(selectionKey(ownerId, id)))) {
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
      await store(ownerId, {
        ...legacy,
        id,
        owner: ownerOf(identity),
        createdAt: legacy.updatedAt ?? now,
        updatedAt: legacy.updatedAt ?? now,
        ...(published ? { published } : {}),
      });
    }
  }
  await deleteJson(legacyWorkingKey(ownerId));
}

/** Dashboard rows, newest edited first. scope "all" needs canViewAll. */
export async function listSelections(identity, { scope = "mine" } = {}) {
  const ownerId = requireOwnerId(identity);
  await migrateLegacyDraft(identity);
  let items;
  if (scope === "all") {
    if (!canViewAll(identity)) throw fail("FORBIDDEN", "You may only view your own selections.");
    const keys = await listKeys(INDEX_PREFIX);
    const indexes = await Promise.all(keys.map((k) => getJson(k)));
    items = indexes.flatMap((idx) => Object.values(idx?.items ?? {}));
  } else {
    items = Object.values((await readIndex(ownerId)).items);
  }
  return items.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

/** The consultant's own selection, or a NOT_FOUND error. */
export async function getSelection(identity, id) {
  const ownerId = requireOwnerId(identity);
  const draft = await getJson(selectionKey(ownerId, requireId(id)));
  if (!draft) throw fail("NOT_FOUND", "This selection does not exist or is not yours.");
  return draft;
}

/**
 * Create an empty selection, or duplicate one of the consultant's own as a
 * fresh draft for a new client: the yachts (and their images, rates and
 * highlights) carry across; the client name, welcome greeting, per-yacht
 * notes to the client and any publish state are cleared.
 */
export async function createSelection(identity, { duplicateOf, tier } = {}) {
  const ownerId = requireOwnerId(identity);
  let draft = Number(tier) === 2 ? emptyTier2Draft(identity) : emptyDraft(identity);
  if (duplicateOf) {
    const src = await getSelection(identity, duplicateOf);
    // A duplicate keeps its source's tier — the tier is fixed once created.
    const base = tierOf(src) === 2 ? emptyTier2Draft(identity) : emptyDraft(identity);
    draft = {
      ...src,
      id: base.id,
      tier: tierOf(src),
      owner: ownerOf(identity),
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
  }
  return store(ownerId, draft);
}

/**
 * Save a selection. Owner, creation date and publish state are always taken
 * from the stored record, so nothing in the request body can forge them.
 */
export async function saveSelection(identity, id, incoming) {
  const ownerId = requireOwnerId(identity);
  const existing = await getSelection(identity, id);
  const stored = {
    ...incoming,
    id: existing.id,
    tier: tierOf(existing),
    owner: ownerOf(identity),
    createdAt: existing.createdAt,
    publishedSlug: existing.publishedSlug,
    published: existing.published,
    updatedAt: new Date().toISOString(),
  };
  if (!stored.publishedSlug) delete stored.publishedSlug;
  if (!stored.published) delete stored.published;
  return store(ownerId, stored);
}

/** Delete a never-published draft. Published selections are unpublished instead. */
export async function deleteSelection(identity, id) {
  const ownerId = requireOwnerId(identity);
  const existing = await getSelection(identity, id);
  if (existing.published) {
    throw fail("CONFLICT", "Published selections are unpublished, never deleted, so the version history survives.");
  }
  await deleteJson(selectionKey(ownerId, existing.id));
  await removeIndexEntry(ownerId, existing.id);
}

/* ---------------------------------------------------------- publishing */

export async function getPublishedPage(slug) {
  if (!isValidSlug(slug)) return null;
  const record = await getJson(currentKey(slug));
  return record && !record.unpublished ? record : null;
}

async function ownedCurrent(identity, slug) {
  const current = await getJson(currentKey(slug));
  if (current && current.owner?.id && current.owner.id !== identity.id) {
    throw fail("FORBIDDEN", "This client page is owned by another consultant.");
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
 * republish; otherwise claims slugBase, suffixing -2, -3… past any slug owned
 * by someone else.
 */
export async function publishSelection({ identity, id, slugBase, buildConfig }) {
  const ownerId = requireOwnerId(identity);
  const draft = await getSelection(identity, id);

  let slug = draft.publishedSlug && isValidSlug(draft.publishedSlug) ? draft.publishedSlug : null;
  if (slug) {
    await ownedCurrent(identity, slug);
  } else {
    if (!isValidSlug(slugBase)) throw fail("INVALID", "Cannot derive a client page address.");
    slug = slugBase;
    for (let i = 2; i <= 50; i++) {
      const existing = await getJson(currentKey(slug));
      if (!existing || existing.owner?.id === identity.id) break;
      slug = `${slugBase}-${i}`;
    }
  }

  const current = await ownedCurrent(identity, slug);
  const record = {
    slug,
    version: (current?.version ?? 0) + 1,
    owner: ownerOf(identity),
    draftId: draft.id,
    publishedAt: new Date().toISOString(),
    config: buildConfig(slug),
  };
  await putJson(versionKey(slug, record.version), record);
  await putJson(currentKey(slug), record);

  await store(ownerId, { ...draft, publishedSlug: slug, published: publishStateOf(record) });
  return { slug, version: record.version };
}

/** Take the client page offline; the record and every version are kept. */
export async function unpublishSelection(identity, id) {
  const ownerId = requireOwnerId(identity);
  const draft = await getSelection(identity, id);
  if (!draft.publishedSlug) throw fail("CONFLICT", "This selection has not been published.");
  const current = await ownedCurrent(identity, draft.publishedSlug);
  if (!current) throw fail("NOT_FOUND", "The published page no longer exists.");
  if (!current.unpublished) {
    const record = { ...current, unpublished: true, unpublishedAt: new Date().toISOString() };
    await putJson(currentKey(draft.publishedSlug), record);
    await store(ownerId, { ...draft, published: publishStateOf(record) });
  }
  return { slug: draft.publishedSlug };
}

/** Version history of a published selection, newest first. */
export async function listVersions(identity, id) {
  const draft = await getSelection(identity, id);
  if (!draft.publishedSlug) return [];
  const current = await ownedCurrent(identity, draft.publishedSlug);
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
export async function rollbackSelection(identity, id, toVersion) {
  const ownerId = requireOwnerId(identity);
  const draft = await getSelection(identity, id);
  if (!draft.publishedSlug) throw fail("CONFLICT", "This selection has not been published.");
  const slug = draft.publishedSlug;
  const current = await ownedCurrent(identity, slug);
  if (!current) throw fail("NOT_FOUND", "The published page no longer exists.");
  const n = Number(toVersion);
  if (!Number.isInteger(n) || n < 1 || n > current.version) throw fail("INVALID", "No such version.");
  const target = await getJson(versionKey(slug, n));
  if (!target) throw fail("NOT_FOUND", "That version is missing from storage.");

  const record = {
    ...target,
    version: current.version + 1,
    owner: ownerOf(identity),
    draftId: draft.id,
    publishedAt: new Date().toISOString(),
    rolledBackFrom: n,
    unpublished: false,
    unpublishedAt: null,
  };
  await putJson(versionKey(slug, record.version), record);
  await putJson(currentKey(slug), record);
  await store(ownerId, { ...draft, published: publishStateOf(record) });
  return { slug, version: record.version, rolledBackFrom: n };
}
