/**
 * Gallery helpers shared by the Blob pipeline (fleet.mjs) and the Sirv
 * pipeline (image-store/sirv-pipeline.mjs) — SERVER-ONLY, no storage.
 */

import { fetchBrochure } from "./client.mjs";
import { hashJson } from "../storage.mjs";

/**
 * The facts request fetches the brochure; the images request that follows a
 * moment later reuses it from here instead of calling Yachtfolio again.
 * (Overridable only so tests can change a mock gallery between calls.)
 */
const BROCHURE_MEMO_MS = Number(process.env.FLEET_BROCHURE_MEMO_MS) || 5 * 60 * 1000;
const brochureMemo = new Map();

export function rememberBrochure(yfId, brochure) {
  brochureMemo.set(Number(yfId), { brochure, at: Date.now() });
}

/** The yacht's brochure, from the memo when recent (never when `fresh`). */
export async function brochureFor(passkey, yfId, { fresh = false } = {}) {
  const memo = brochureMemo.get(Number(yfId));
  if (!fresh && memo && Date.now() - memo.at < BROCHURE_MEMO_MS) return memo.brochure;
  const { json: brochure } = await fetchBrochure(passkey, yfId);
  rememberBrochure(yfId, brochure);
  return brochure;
}

/** Run fn over items with at most `limit` in flight; results keep item order. */
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Yachtfolio media URLs embed the passkey — strip it before storing or logging. */
export function stripSecret(url) {
  try {
    const u = new URL(url);
    u.searchParams.delete("api");
    u.searchParams.delete("passkey");
    return u.toString();
  } catch {
    return String(url).replace(/([?&])(api|passkey)=[^&]*/gi, "$1").replace(/[?&]+$/, "");
  }
}

/**
 * Index of the main image in a selectGalleryImages() list: the yacht's
 * profile shot (first FULL), else the first EXTERIOR, else 0. With
 * GALLERY_ORDER starting FULL, EXTERIOR this is normally already position 0.
 */
export function leadIndex(selected) {
  const i = selected.findIndex((s) => s.category === "FULL");
  if (i >= 0) return i;
  const j = selected.findIndex((s) => s.category === "EXTERIOR");
  return j >= 0 ? j : 0;
}

/** The same list with the main image moved to position 0. */
export function orderWithLead(selected) {
  const i = leadIndex(selected);
  return i <= 0 ? [...selected] : [selected[i], ...selected.slice(0, i), ...selected.slice(i + 1)];
}

/** The gallery entry the portal and the picker render, from a record's order[] entry. */
export function galleryFileOf(entry, urls = { url: entry.url, smallUrl: entry.smallUrl }) {
  return { id: Number(entry.yfImageId) || entry.yfImageId, category: entry.category, url: urls.url, smallUrl: urls.smallUrl, filename: entry.filename ?? null };
}

/**
 * Default slot assignment from the prepared files ({ url, category,
 * filename }). The lead is always the yacht's profile shot from Yachtfolio
 * (the FULL gallery, else the first exterior) — never another category.
 * Each other slot takes the first unused image of its own category; when
 * Yachtfolio has none in that category, an image from the other categories
 * is chosen (unused first) by a pick that is stable for this yacht, so
 * repeated runs never differ. The consultant can change any of these in the
 * form's picker.
 */
export function defaultSlots(files, yfId) {
  const notes = [];
  const byCategory = (cat) => files.filter((f) => f.category === cat).map((f) => f.url);
  const full = byCategory("FULL");
  const exterior = byCategory("EXTERIOR");
  const lifestyle = byCategory("LIFESTYLE");
  const interior = byCategory("INTERIOR");
  const used = new Set();
  const take = (url) => {
    if (url) used.add(url);
    return url ?? "";
  };
  let salt = 0;
  const stableFrom = (urls) => {
    if (!urls.length) return undefined;
    salt += 1;
    const seed = parseInt(hashJson(`${yfId}:${salt}`).slice(0, 8), 16);
    return urls[seed % urls.length];
  };
  const unused = (urls) => urls.filter((u) => !used.has(u));
  const pick = (own, others) =>
    take(unused(own)[0] ?? stableFrom(unused(others)) ?? stableFrom(own) ?? stableFrom(others));
  const leadImageUrl = take(full[0] ?? exterior[0]);
  if (files.length && !leadImageUrl) {
    notes.push("no profile or exterior image in Yachtfolio — paste a lead image URL in the form.");
  }
  // The exterior slot must show a different picture from the lead. The
  // profile shot in FULL is usually the same photo as the first exterior
  // (uploaded to both), so exclude any exterior sharing the lead's source
  // filename and, when the lead is the profile shot, prefer the second
  // exterior over the first.
  const leadFile = files.find((f) => f.url === leadImageUrl);
  const notLeadPhoto = (f) =>
    f.url !== leadImageUrl && !(leadFile?.filename && f.filename && f.filename === leadFile.filename);
  const exteriorFiles = files.filter((f) => f.category === "EXTERIOR" && notLeadPhoto(f));
  const ranked =
    full.length && exteriorFiles.length > 1
      ? [...exteriorFiles.slice(1), exteriorFiles[0]].map((f) => f.url)
      : exteriorFiles.map((f) => f.url);
  const exteriorForSlot = ranked.length ? ranked : exterior;
  const interiorImageUrl = pick(interior, [...exteriorForSlot, ...lifestyle]);
  const exteriorImageUrl = pick(exteriorForSlot, [...lifestyle, ...interior]);
  const lifestyleImageUrl = pick(lifestyle, [...exterior, ...interior]);
  if (files.length) {
    for (const [cat, list] of [["interior", interior], ["exterior", exterior], ["lifestyle", lifestyle]]) {
      if (!list.length) notes.push(`no ${cat} images in Yachtfolio — another image was chosen for that slot; change it in the picker if needed.`);
    }
  }
  return { leadImageUrl, interiorImageUrl, exteriorImageUrl, lifestyleImageUrl, notes };
}
