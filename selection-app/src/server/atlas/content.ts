/**
 * Tier 1 destination content for Tier 2 — SERVER-ONLY.
 *
 * Reuses the 2027 Atlas pipeline rather than duplicating it:
 *   - data/destinations.json, the checked-in snapshot written by
 *     `npm run import:destinations`, is the cache and the source of the
 *     destination tree, coordinates and pins (src/lib/atlas/data.ts);
 *   - src/server/atlas/website.mjs, the crawler's page parser, re-reads one
 *     destination page live when a consultant chooses it, so the copy is as
 *     fresh as the website. When the fetch fails or times out the snapshot
 *     copy is used and the destination is logged as served from cache;
 *   - src/server/yachtfolio/images.mjs (sharp) crops the website imagery to
 *     2000×1250 and the IMAGES store keeps the result under atlas/images/.
 */

import { createHash } from "node:crypto";
import snapshot from "../../../data/destinations.json";
import type { AtlasDestination, AtlasSnapshot } from "@/lib/atlas/types";
import { buildIndex, children, eyebrowFor, parentOf, regionOf, shortIntro, topLevelPins, type AtlasIndex } from "@/lib/atlas/data";
import type { AtlasDefaults, AtlasDestinationContent, AtlasDestinationOption } from "@/lib/portal-types";
import type { AtlasPagePin } from "@/lib/types";
import { parsePage, USER_AGENT } from "./website.mjs";
import { cropToSizes } from "../yachtfolio/images.mjs";
import { fileExists, fileUrl, putFile } from "../storage.mjs";

const LIVE_TIMEOUT_MS = 6000;
const IMAGE_TIMEOUT_MS = 15000;
const IMAGE_PREFIX = "atlas/images/";
/** How many website images are prepared per destination (the page uses two). */
const MAX_IMAGES = 4;

let indexCache: AtlasIndex | null = null;

/** The Atlas snapshot, indexed once per process. */
export function getAtlasIndex(): AtlasIndex {
  if (!indexCache) indexCache = buildIndex(snapshot as unknown as AtlasSnapshot);
  return indexCache;
}

export function atlasGeneratedAt(): string {
  return (snapshot as unknown as AtlasSnapshot).generatedAt;
}

/* ------------------------------------------------------------- options */

/** Every destination id, region by region (Mediterranean first), depth-first. */
export function listDestinationOptions(): AtlasDestinationOption[] {
  const index = getAtlasIndex();
  const out: AtlasDestinationOption[] = [];
  const walk = (d: AtlasDestination, ancestors: AtlasDestination[]) => {
    const region = regionOf(d, index) ?? d;
    out.push({
      id: d.id,
      name: d.name || d.slug,
      level: d.level,
      regionId: d.regionId,
      regionName: region.name || region.slug,
      pathLabel: ancestors.map((a) => a.name || a.slug).join(" · "),
      lat: d.lat,
      lon: d.lon,
      featured: d.featured,
    });
    for (const c of children(d, index)) walk(c, [...ancestors, d]);
  };
  for (const region of index.regions) walk(region, []);
  return out;
}

/* ---------------------------------------------------------- live refresh */

export interface ResolvedDestination {
  dest: AtlasDestination;
  source: "live" | "cache";
  reason?: string;
}

/**
 * The destination's copy and imagery as of now: re-read from the website
 * page, falling back to the snapshot. Coordinates, children and the region
 * tree always come from the snapshot (they are geocoded at import time).
 */
export async function resolveDestination(id: string, { live = true }: { live?: boolean } = {}): Promise<ResolvedDestination | null> {
  const index = getAtlasIndex();
  const cached = index.byId.get(id);
  if (!cached) return null;
  if (!live) return { dest: cached, source: "cache", reason: "live refresh disabled" };
  try {
    const res = await fetch(cached.url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(LIVE_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const page = parsePage(cached.url, await res.text()) as {
      name: string;
      metaTitle: string;
      metaDescription: string;
      ogImage: string | null;
      heroImage: string | null;
      heroMobile: string | null;
      lede: string;
      paragraphs: string[];
      keyFacts: Array<{ label: string; value: string }>;
    };
    const dest: AtlasDestination = {
      ...cached,
      name: page.name || cached.name,
      metaTitle: page.metaTitle || cached.metaTitle,
      metaDescription: page.metaDescription || cached.metaDescription,
      ogImage: page.ogImage ?? cached.ogImage,
      heroImage: page.heroImage ?? cached.heroImage,
      heroMobile: page.heroMobile ?? cached.heroMobile,
      lede: page.lede || cached.lede,
      paragraphs: page.paragraphs.length ? page.paragraphs : cached.paragraphs,
      keyFacts: page.keyFacts.length ? page.keyFacts : cached.keyFacts,
    };
    return { dest, source: "live" };
  } catch (err) {
    const reason = String((err as Error)?.message ?? err);
    console.warn(`[atlas] ${id}: website fetch failed (${reason}) — content served from the cached Atlas snapshot (${atlasGeneratedAt()})`);
    return { dest: cached, source: "cache", reason };
  }
}

/* --------------------------------------------------------------- copy */

function firstSentence(text: string): string {
  const m = text.match(/^[^.!?]+[.!?]/);
  return (m ? m[0] : text).trim();
}

/** "Positano, Capri and Ravello" from "Amalfi Coast Yacht Charter: Positano, Capri and Ravello". */
function titleTail(metaTitle: string): string | null {
  const m = metaTitle.split("|")[0].match(/:\s*(.+)$/);
  return m ? m[1].trim() : null;
}

/** The Atlas default for each copy block. */
export function atlasCopyFor(dest: AtlasDestination, index: AtlasIndex): Pick<AtlasDefaults, "eyebrow" | "deckLine" | "description"> {
  const popular = dest.keyFacts.find((f) => /popular destinations/i.test(f.label))?.value;
  const kids = children(dest, index).map((c) => c.name).filter(Boolean);
  const deckLine =
    titleTail(dest.metaTitle) ??
    (popular ? popular : null) ??
    (kids.length ? kids.join(" · ") : null) ??
    firstSentence(dest.summary || dest.metaDescription || "");
  const description = shortIntro(dest, 2) || dest.summary || dest.metaDescription;
  return {
    eyebrow: eyebrowFor(dest, index).toUpperCase(),
    deckLine: deckLine.replace(/\.$/, ""),
    description,
  };
}

/** Terms a Yachtfolio cruising-area string is matched against for this destination. */
export function areaTermsFor(dest: AtlasDestination, index: AtlasIndex): { areaTerms: string[]; regionTerms: string[] } {
  const terms = new Set<string>();
  const clean = (s: string) => s.replace(/^the\s+/i, "").trim().toLowerCase();
  terms.add(clean(dest.name));
  for (const c of children(dest, index)) if (c.name) terms.add(clean(c.name));
  let p = parentOf(dest, index);
  while (p && p.level >= 2) {
    if (p.name) terms.add(clean(p.name));
    p = parentOf(p, index);
  }
  const region = regionOf(dest, index);
  const regionTerms = region?.name ? [clean(region.name)] : [];
  return { areaTerms: [...terms].filter(Boolean), regionTerms };
}

/* -------------------------------------------------------------- images */

/** Distinct website image candidates for a destination, most relevant first. */
export function imageCandidates(dest: AtlasDestination, index: AtlasIndex): string[] {
  const out: string[] = [];
  const add = (u: string | null | undefined) => {
    if (!u) return;
    // A WordPress "-800x1250" rendition is a crop of its parent; skip it when the
    // parent is already listed.
    const base = u.replace(/-\d+x\d+(\.\w+)$/, "$1");
    if (out.some((x) => x === u || x.replace(/-\d+x\d+(\.\w+)$/, "$1") === base)) return;
    out.push(u);
  };
  add(dest.heroImage);
  add(dest.cardImage);
  add(dest.ogImage);
  for (const c of children(dest, index)) add(c.cardImage ?? c.heroImage);
  const parent = parentOf(dest, index);
  if (parent) add(parent.heroImage ?? parent.cardImage);
  add(dest.heroMobile);
  return out;
}

function imageKey(url: string): string {
  return `${IMAGE_PREFIX}${createHash("sha1").update(url).digest("hex")}`;
}

/**
 * Crop one website image to 2000×1250 (and 1000×625) through the shared sharp
 * pipeline and store it in the public IMAGES store; already-prepared images
 * are reused. Returns the prepared URL, or the source URL when the image
 * cannot be prepared (the page still renders it 16:10 by CSS).
 */
export async function prepareAtlasImage(url: string): Promise<{ url: string; smallUrl: string; prepared: boolean }> {
  const base = imageKey(url);
  const keys = { large: `${base}.jpg`, small: `${base}-sm.jpg` };
  try {
    if (await fileExists(keys.large)) {
      const [large, small] = await Promise.all([fileUrl(keys.large), fileUrl(keys.small)]);
      if (large) return { url: large, smallUrl: small ?? large, prepared: true };
    }
    const res = await fetch(url, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    const sizes = await cropToSizes(bytes);
    const urls: Record<string, string> = {};
    await Promise.all(
      sizes.map(async (size: { suffix: string; buffer: Buffer }) => {
        const key = size.suffix === "-sm" ? keys.small : keys.large;
        urls[size.suffix === "-sm" ? "small" : "large"] = await putFile(key, size.buffer, "image/jpeg");
      })
    );
    return { url: urls.large, smallUrl: urls.small ?? urls.large, prepared: true };
  } catch (err) {
    console.warn(`[atlas] image not prepared, using the website URL as-is: ${url} (${String((err as Error)?.message ?? err)})`);
    return { url, smallUrl: url, prepared: false };
  }
}

/* -------------------------------------------------------------- content */

/**
 * Everything the Tier 2 form needs when a destination is chosen: the Atlas
 * default for each block (live copy where the website answered), prepared
 * 16:10 images and the cruising-area terms.
 */
export async function getDestinationContent(id: string, { live = true, images = true } = {}): Promise<AtlasDestinationContent | null> {
  const index = getAtlasIndex();
  const resolved = await resolveDestination(id, { live });
  if (!resolved) return null;
  const { dest, source } = resolved;
  const copy = atlasCopyFor(dest, index);
  const candidates = imageCandidates(dest, index).slice(0, MAX_IMAGES);
  const prepared = images ? await Promise.all(candidates.map((u) => prepareAtlasImage(u))) : candidates.map((u) => ({ url: u }));
  const { areaTerms, regionTerms } = areaTermsFor(dest, index);
  return {
    id: dest.id,
    name: dest.name || dest.slug,
    atlas: {
      ...copy,
      images: prepared.map((p) => p.url),
      contentSource: source,
      fetchedAt: new Date().toISOString(),
    },
    areaTerms: [...areaTerms, ...regionTerms.map((t) => `region:${t}`)],
  };
}

/* ----------------------------------------------------------------- geo */

export interface DestinationGeo {
  id: string;
  name: string;
  lat: number;
  lon: number;
  guideUrl: string;
}

/** Name, coordinates and guide URL for a chosen destination (snapshot). */
export function destinationGeo(id: string): DestinationGeo | null {
  const d = getAtlasIndex().byId.get(id);
  if (!d || d.lat == null || d.lon == null) return null;
  return { id: d.id, name: d.name || d.slug, lat: d.lat, lon: d.lon, guideUrl: d.url };
}

/** The resting Atlas pins (one per country / area) minus the chosen destinations. */
export function otherPinsFor(chosenIds: string[]): AtlasPagePin[] {
  const chosen = new Set(chosenIds);
  return topLevelPins(getAtlasIndex())
    .filter((p) => !chosen.has(p.id))
    .map((p) => ({ id: p.id, name: p.name, lat: p.lat, lon: p.lon }));
}

/** The snapshot facts the publish mapping needs for a set of chosen destinations. */
export function atlasResolutionFor(chosenIds: string[]): { destinations: Record<string, DestinationGeo>; otherPins: AtlasPagePin[] } {
  const destinations: Record<string, DestinationGeo> = {};
  for (const id of chosenIds) {
    const geo = destinationGeo(id);
    if (geo) destinations[id] = geo;
  }
  return { destinations, otherPins: otherPinsFor(Object.keys(destinations)) };
}
