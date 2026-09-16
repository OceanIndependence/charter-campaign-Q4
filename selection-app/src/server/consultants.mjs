/**
 * Consultant records — SERVER-ONLY.
 *
 * One private JSON document per consultant at consultants/<id>.json is the
 * single source of truth for who prepared a client page and how the client
 * reaches them. The layout follows yacht-records.mjs exactly: a versioned
 * record, a reader that tells "no record" (null) from a storage failure
 * (throw), and a writer over putJson. Three sources of truth, none of which
 * overlap:
 *
 *   - the seed CSV (scripts/import-consultants.mjs), imported once, which
 *     establishes the initial set;
 *   - the admin screen, which owns displayName, jobTitle, email, photoUrl
 *     and status from the moment of import onwards, and — for the owner
 *     alone — isAdmin and its two grant stamps;
 *   - the consultant, who edits phone and whatsapp and nothing else.
 *
 * Microsoft Entra only establishes identity: on sign-in the record is
 * matched on objectId, then on email; a person in neither gets a record
 * with source "sso" created from the token claims. Claims never overwrite
 * an existing value.
 *
 *   {
 *     version: 1,
 *     id,             internal, stable, assigned at creation (the filename)
 *     objectId,       Entra object ID; null until first sign-in
 *     email,          lowercase; sign-in address and the address shown to clients
 *     displayName, jobTitle,
 *     phone, whatsapp,                consultant-editable
 *     photoUrl, photoStatus,          "ok" | "missing" (HEAD-checked)
 *     source,         "csv" (seed import) | "sso" (created at sign-in) | "admin" (added on the admin screen)
 *     status,         "active" | "inactive"
 *     isAdmin,        owner-controlled; an INACTIVE record is never an admin
 *     adminGrantedBy, adminGrantedAt  who granted it and when; cleared on revoke
 *     updatedAt, updatedBy
 *   }
 *
 * consultants/index.json carries one summary row per record (everything
 * but phone and whatsapp) so sign-in can look a record up by objectId or
 * email, and the admin list can render, with one free read and no billed
 * list() on a runtime path — the same reasoning as portal/index/<owner>.json.
 * Every record write rewrites its index row. Two admins saving at once can
 * race on the index; rebuildConsultantIndex() (the import script's
 * --rebuild-index) puts it right from the records.
 *
 * Uniqueness of email and objectId is enforced among ACTIVE records only,
 * and every look-up prefers an active record. That is what lets an admin
 * reconcile a stray "sso" record with a seeded one: mark the stray
 * inactive, correct the seeded record's email, and the next sign-in claims
 * the seeded record (consultant-session.ts) even though the inactive stray
 * still carries the same address and, until then, the same objectId.
 */

import { randomUUID } from "node:crypto";
import { getJson, listKeys, putJson } from "./storage.mjs";

export const RECORD_VERSION = 1;
export const INDEX_KEY = "consultants/index.json";
const RECORDS_PREFIX = "consultants/";
export const recordKey = (id) => `${RECORDS_PREFIX}${id}.json`;

const ID_RE = /^[A-Za-z0-9-]{8,64}$/;
export const STATUSES = ["active", "inactive"];
export const SOURCES = ["csv", "sso", "admin"];
export const PHOTO_STATUSES = ["ok", "missing"];

/** Team photos live here; the space in the folder name is already encoded. */
export const PHOTO_BASE_URL = "https://cdn.oceanindependence.com/Team%20Images/";
const PHOTO_CHECK_TIMEOUT_MS = 10_000;

const fail = (code, message) => Object.assign(new Error(message), { code });

/* ----------------------------------------------------------------- shape */

export function newConsultantId() {
  return randomUUID();
}

export function isValidConsultantId(id) {
  return ID_RE.test(String(id ?? ""));
}

/** Lowercased, trimmed address; "" when there is none. */
export function normaliseEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

const str = (v) => String(v ?? "").trim();

export function emptyConsultantRecord(id) {
  return {
    version: RECORD_VERSION,
    id,
    objectId: null,
    email: "",
    displayName: "",
    jobTitle: "",
    phone: "",
    whatsapp: "",
    photoUrl: "",
    photoStatus: "missing",
    source: "sso",
    status: "active",
    isAdmin: false,
    adminGrantedBy: "",
    adminGrantedAt: null,
    updatedAt: null,
    updatedBy: null,
  };
}

/** Coerce a stored or incoming record onto the shape; unknown enum values fall back. */
function normaliseRecord(id, rec) {
  const base = emptyConsultantRecord(id);
  const out = { ...base, ...(rec ?? {}), version: RECORD_VERSION, id };
  out.objectId = str(out.objectId) || null;
  out.email = normaliseEmail(out.email);
  out.displayName = str(out.displayName);
  out.jobTitle = str(out.jobTitle);
  out.phone = str(out.phone);
  out.whatsapp = str(out.whatsapp);
  out.photoUrl = str(out.photoUrl);
  if (!PHOTO_STATUSES.includes(out.photoStatus)) out.photoStatus = "missing";
  if (!SOURCES.includes(out.source)) out.source = base.source;
  if (!STATUSES.includes(out.status)) out.status = base.status;
  out.isAdmin = out.isAdmin === true;
  out.adminGrantedBy = normaliseEmail(out.adminGrantedBy);
  out.adminGrantedAt = out.adminGrantedAt ? String(out.adminGrantedAt) : null;
  out.updatedAt = out.updatedAt ? String(out.updatedAt) : null;
  out.updatedBy = out.updatedBy ? String(out.updatedBy) : null;
  return out;
}

/** Set the audit stamp. There is no audit log beyond this. */
export function stampConsultant(record, updatedBy, now = new Date()) {
  record.updatedAt = now.toISOString();
  record.updatedBy = str(updatedBy) || "unknown";
  return record;
}

/** The index row: the record without the two consultant-owned fields. */
export function indexRowOf(record) {
  const { phone: _p, whatsapp: _w, version: _v, ...row } = record;
  return row;
}

/* --------------------------------------------------------------- storage */

/** A valid record, or null for a missing one. Any other storage error propagates. */
export async function readConsultantRecord(id) {
  if (!isValidConsultantId(id)) return null;
  const rec = await getJson(recordKey(id));
  if (!rec || typeof rec !== "object") return null;
  if (rec.version !== RECORD_VERSION || String(rec.id) !== String(id)) return null;
  return normaliseRecord(id, rec);
}

/** The index, or an empty one when none has been written yet. Storage errors propagate. */
export async function readConsultantIndex() {
  const idx = await getJson(INDEX_KEY);
  if (!idx || typeof idx !== "object" || !idx.items || typeof idx.items !== "object") {
    return { version: RECORD_VERSION, updatedAt: null, items: {} };
  }
  return idx;
}

async function writeIndexRow(record) {
  const idx = await readConsultantIndex();
  idx.items[record.id] = indexRowOf(record);
  idx.updatedAt = new Date().toISOString();
  await putJson(INDEX_KEY, idx);
}

/**
 * Persist a record and its index row. An ACTIVE record may not share its
 * email or objectId with another active record: an address must resolve to
 * exactly one active consultant at sign-in. Inactive records are outside
 * the check, so a stray can be retired while the seeded record takes over
 * its address. Callers stamp updatedAt/updatedBy first (stampConsultant).
 */
export async function writeConsultantRecord(record) {
  const rec = normaliseRecord(record.id, record);
  if (!isValidConsultantId(rec.id)) throw fail("INVALID", "Invalid consultant id.");
  if (rec.status === "active") {
    if (rec.email) {
      const other = await findConsultantIdByEmail(rec.email, { activeOnly: true });
      if (other && other !== rec.id) throw fail("CONFLICT", `Another active consultant record already uses ${rec.email}.`);
    }
    if (rec.objectId) {
      const other = await findConsultantIdByObjectId(rec.objectId, { activeOnly: true });
      if (other && other !== rec.id) throw fail("CONFLICT", "Another active consultant record is already claimed by this sign-in.");
    }
  }
  await putJson(recordKey(rec.id), rec);
  await writeIndexRow(rec);
  return rec;
}

/** Every index row, by display name. One free read. */
export async function listConsultants() {
  const idx = await readConsultantIndex();
  return Object.values(idx.items).sort((a, b) => String(a.displayName).localeCompare(String(b.displayName), "en-GB"));
}

/** The active match if there is one, else (unless activeOnly) an inactive match, else null. */
function pickPreferringActive(rows, matches, { activeOnly = false } = {}) {
  const hits = rows.filter(matches);
  return hits.find((r) => r.status === "active") ?? (activeOnly ? null : hits[0]) ?? null;
}

/** Id of the record with this email — an active one first. */
export async function findConsultantIdByEmail(email, opts = {}) {
  const wanted = normaliseEmail(email);
  if (!wanted) return null;
  return pickPreferringActive(await listConsultants(), (r) => normaliseEmail(r.email) === wanted, opts)?.id ?? null;
}

/** Id of the record claimed by this objectId — an active one first. */
export async function findConsultantIdByObjectId(objectId, opts = {}) {
  const wanted = str(objectId);
  if (!wanted) return null;
  return pickPreferringActive(await listConsultants(), (r) => str(r.objectId) === wanted, opts)?.id ?? null;
}

export async function findConsultantByEmail(email, opts = {}) {
  const id = await findConsultantIdByEmail(email, opts);
  return id ? readConsultantRecord(id) : null;
}

export async function findConsultantByObjectId(objectId, opts = {}) {
  const id = await findConsultantIdByObjectId(objectId, opts);
  return id ? readConsultantRecord(id) : null;
}

/**
 * Rebuild consultants/index.json from every record. The only list() in
 * this module — one billed operation per thousand records — and never on
 * a runtime path: the import script's --rebuild-index flag.
 */
export async function rebuildConsultantIndex() {
  const keys = (await listKeys(RECORDS_PREFIX)).filter((k) => k.endsWith(".json") && k !== INDEX_KEY);
  const items = {};
  for (const key of keys) {
    const id = key.slice(RECORDS_PREFIX.length, -".json".length);
    const rec = await readConsultantRecord(id);
    if (rec) items[rec.id] = indexRowOf(rec);
  }
  await putJson(INDEX_KEY, { version: RECORD_VERSION, updatedAt: new Date().toISOString(), items });
  return { records: Object.keys(items).length };
}

/* ---------------------------------------------------------------- photos */

/** A few letters NFKD decomposition leaves alone. */
const LETTER_MAP = { ß: "ss", æ: "ae", œ: "oe", ø: "o", đ: "d", ł: "l", þ: "th" };

/**
 * "Barbara Müller" → "barbara-muller"; "Daphne D'Offay" → "daphne-doffay".
 * Lowercase, transliterate to ASCII, strip apostrophes and full stops, join
 * the remaining words with hyphens.
 */
export function photoSlug(displayName) {
  return str(displayName)
    .toLowerCase()
    .replace(/[ßæœøđłþ]/g, (c) => LETTER_MAP[c] ?? c)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’‘.]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The team photo a display name would have on the CDN, or "" when no slug can be made. */
export function derivedPhotoUrl(displayName) {
  const slug = photoSlug(displayName);
  return slug ? `${PHOTO_BASE_URL}${slug}.jpg` : "";
}

/**
 * HEAD the photo URL. Resolves to { status: "ok" | "missing", httpStatus,
 * error }: "ok" only for a 2xx with an image content type (or none). A
 * server that refuses HEAD is retried with a GET whose body is discarded.
 * Never throws — a missing photo is a fact to record, not a failure.
 */
export async function checkPhotoDetail(url) {
  const target = str(url);
  if (!/^https:\/\//i.test(target)) return { status: "missing", httpStatus: null, error: target ? "Not an https URL." : "No URL." };
  const attempt = async (method) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PHOTO_CHECK_TIMEOUT_MS);
    try {
      const res = await fetch(target, { method, redirect: "follow", signal: ctrl.signal, cache: "no-store" });
      if (method === "GET") await res.body?.cancel?.().catch(() => {});
      return res;
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    let res = await attempt("HEAD");
    if (res.status === 405 || res.status === 501) res = await attempt("GET");
    const type = (res.headers.get("content-type") ?? "").toLowerCase();
    const ok = res.ok && (!type || type.startsWith("image/"));
    return { status: ok ? "ok" : "missing", httpStatus: res.status, error: ok ? null : type && !type.startsWith("image/") ? `Not an image (${type}).` : null };
  } catch (err) {
    return { status: "missing", httpStatus: null, error: err?.name === "AbortError" ? "Timed out." : String(err?.message ?? err) };
  }
}

/** "ok" or "missing" for a photo URL. */
export async function checkPhoto(url) {
  return (await checkPhotoDetail(url)).status;
}
