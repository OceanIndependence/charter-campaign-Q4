import type { AtlasDestination, AtlasSnapshot, AtlasYacht } from "./types";
import type { GlobePin } from "./globe";

/** Indexed view of the snapshot, built once on the client. */
export interface AtlasIndex {
  snapshot: AtlasSnapshot;
  byId: Map<string, AtlasDestination>;
  /** Regions in the website's own order */
  regions: AtlasDestination[];
}

export function buildIndex(snapshot: AtlasSnapshot): AtlasIndex {
  const byId = new Map(snapshot.destinations.map((d) => [d.id, d]));
  const order = snapshot.site.regionOrder ?? [];
  const regions = snapshot.destinations
    .filter((d) => d.level === 1)
    .sort((a, b) => {
      const ia = order.indexOf(a.id);
      const ib = order.indexOf(b.id);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.name.localeCompare(b.name, "en-GB");
    });
  return { snapshot, byId, regions };
}

export function children(d: AtlasDestination, index: AtlasIndex): AtlasDestination[] {
  return d.childIds.map((id) => index.byId.get(id)).filter((c): c is AtlasDestination => !!c);
}

export function parentOf(d: AtlasDestination, index: AtlasIndex): AtlasDestination | null {
  return d.parentId ? (index.byId.get(d.parentId) ?? null) : null;
}

export function regionOf(d: AtlasDestination, index: AtlasIndex): AtlasDestination | null {
  return index.byId.get(d.regionId) ?? null;
}

/** Every destination beneath d (children, grandchildren…). */
export function descendants(d: AtlasDestination, index: AtlasIndex): AtlasDestination[] {
  const out: AtlasDestination[] = [];
  const walk = (x: AtlasDestination) => {
    for (const c of children(x, index)) {
      out.push(c);
      walk(c);
    }
  };
  walk(d);
  return out;
}

/** The Mediterranean destinations the intro panel leads with, in this order. */
export const POPULAR_IDS = ["mediterranean/croatia", "mediterranean/italy", "mediterranean/france", "mediterranean/greece", "mediterranean/turkey"];

/** Pins labelled on the resting globe; everything else is a dot until zoomed. */
export const RESTING_LABEL_IDS = new Set([...POPULAR_IDS, "mediterranean/spain"]);

const hasCoords = (d: AtlasDestination): d is AtlasDestination & { lat: number; lon: number } => d.lat != null && d.lon != null;

export function toPin(d: AtlasDestination): GlobePin | null {
  if (!hasCoords(d)) return null;
  return { id: d.id, name: d.name, lat: d.lat, lon: d.lon, featured: d.featured, priority: RESTING_LABEL_IDS.has(d.id) };
}

/**
 * The resting globe: one pin per country / area (level 2). A region with no
 * pages beneath it (Antarctica, say) is pinned itself so nothing is missed.
 */
export function topLevelPins(index: AtlasIndex): GlobePin[] {
  const pins: GlobePin[] = [];
  for (const region of index.regions) {
    const kids = children(region, index);
    const source = kids.length ? kids : [region];
    for (const d of source) {
      const pin = toPin(d);
      if (pin) pins.push(pin);
    }
  }
  return pins;
}

/**
 * Pins that appear when d is selected: its children, or, for a leaf deep in
 * the tree, its siblings (so a cruising ground keeps its neighbours in view).
 * Anything already on the resting globe is left out.
 */
export function subPinsFor(d: AtlasDestination, index: AtlasIndex, topIds: Set<string>): GlobePin[] {
  let set = children(d, index);
  if (!set.length && d.level >= 3) {
    const parent = parentOf(d, index);
    if (parent) set = children(parent, index);
  }
  return set.filter((x) => !topIds.has(x.id)).map(toPin).filter((p): p is GlobePin => !!p);
}

/** Zoom to fly to when a destination is selected, by depth. */
export function zoomFor(d: AtlasDestination): number {
  if (d.level <= 1) return 1.5;
  if (d.level === 2) return d.featured ? 2.8 : 2.4;
  if (d.level === 3) return 4.2;
  return 5.4;
}

/** "CAPRI · POSITANO · AMALFI" — the places beneath a destination. */
export function placesLine(d: AtlasDestination, index: AtlasIndex): string {
  return children(d, index)
    .map((c) => c.name)
    .join(" · ");
}

/** Panel eyebrow: "MEDITERRANEAN · 2027 SEASON" or "MEDITERRANEAN · ITALY". */
export function eyebrowFor(d: AtlasDestination, index: AtlasIndex): string {
  const region = regionOf(d, index);
  if (d.level <= 2 || !region) return `${(region ?? d).name} · 2027 season`;
  const parent = parentOf(d, index);
  return `${region.name} · ${parent ? parent.name : "2027 season"}`;
}

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

/** House style: one–nine as words, 10+ as numerals. */
export function countWords(n: number): string {
  return n < 10 ? WORDS[n] : String(n);
}

export function plural(n: number, singular: string, pluralForm = singular + "s"): string {
  return n === 1 ? singular : pluralForm;
}

/** What the children of a destination are called at each depth. */
export function childrenLabel(d: AtlasDestination, n: number): string {
  if (d.level <= 1) return plural(n, "destination");
  if (d.level === 2) return plural(n, "cruising ground");
  return plural(n, "place");
}

/** Sirv renditions: swap the ?w= parameter. Other hosts are returned as-is. */
export function sirv(url: string | null, width: number): string | undefined {
  if (!url) return undefined;
  if (!/oceanindependence\.sirv\.com/.test(url)) return url;
  return url.replace(/\?.*$/, "") + `?w=${width}`;
}

export function sirvSrcSet(url: string | null, widths: number[]): string | undefined {
  if (!url || !/oceanindependence\.sirv\.com/.test(url)) return undefined;
  return widths.map((w) => `${sirv(url, w)} ${w}w`).join(", ");
}

/** "From EUR 334,800 per week" — ISO code, space, comma-grouped, no symbol. */
export function fmtYachtRate(y: AtlasYacht): string | undefined {
  if (y.weeklyRate == null || !y.currency) return y.rateRaw ? y.rateRaw.replace(/\s*\/\s*week/i, " per week") : undefined;
  return `${y.weeklyRateIsFrom ? "From " : ""}${y.currency} ${y.weeklyRate.toLocaleString("en-GB")} per week`;
}

/** "50M · BILGIN YACHTS · 2021 · 12 GUESTS" */
export function fmtYachtMeta(y: AtlasYacht): string {
  const parts: string[] = [];
  if (y.lengthM != null) parts.push(`${Math.round(y.lengthM)}M`);
  if (y.builder) parts.push(y.builder);
  if (y.year) parts.push(String(y.year));
  if (y.guests) parts.push(`${y.guests} guests`);
  return (parts.length ? parts.join(" · ") : y.specsRaw).toUpperCase();
}

/**
 * A sentence or two of the page's own copy — the panel leads with this and
 * moves straight on to the cruising grounds; the full guide stays a link away.
 */
export function shortIntro(d: AtlasDestination, sentences = 2): string {
  const source = d.lede || d.paragraphs[0] || d.summary || "";
  const parts = source.match(/[^.!?]+[.!?]+(?:["”’'])?(?=\s|$)/g);
  if (!parts) return source.trim();
  return parts
    .slice(0, sentences)
    .map((s) => s.trim())
    .join(" ");
}

