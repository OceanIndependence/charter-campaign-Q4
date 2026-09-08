/**
 * Shape of data/destinations.json — the content snapshot written by
 * `npm run import:destinations` (scripts/import-destinations.mjs) and read by
 * the 2027 Atlas page. Build-time content: the page never calls the website.
 */

export interface AtlasKeyFact {
  label: string;
  value: string;
}

export type GeoConfidence = "high" | "medium" | "low" | "none";

export interface AtlasGeo {
  /** site-map · reference · children-centroid · nominatim · parent · manual */
  source: string | null;
  confidence: GeoConfidence;
  /** Human-readable reasons this destination was (or was not) flagged for review */
  flags: string[];
  siteLat: number | null;
  siteLon: number | null;
  siteZoom: number | null;
}

export interface AtlasDestination {
  /** Path under /yacht-charter/destinations/, e.g. "mediterranean/italy" */
  id: string;
  slug: string;
  name: string;
  url: string;
  /** 1 = region, 2 = country / area, 3 = cruising ground, 4 = place */
  level: number;
  parentId: string | null;
  regionId: string;
  lat: number | null;
  lon: number | null;
  geo: AtlasGeo;
  heroImage: string | null;
  heroMobile: string | null;
  heroVideo: string | null;
  ogImage: string | null;
  /** Image from the parent page's destination card */
  cardImage: string | null;
  /** Card summary from the parent page (falls back to the meta description) */
  summary: string;
  metaTitle: string;
  metaDescription: string;
  /** Intro copy, verbatim: the large lede block then the body paragraphs */
  lede: string;
  paragraphs: string[];
  /** "Why visit?" tick list */
  whyVisit: string[];
  keyFacts: AtlasKeyFact[];
  childIds: string[];
  /** Keys into AtlasSnapshot.yachts, in the order the page lists them */
  yachtIds: string[];
  /** Has featured charter yachts — mint pin on the globe */
  featured: boolean;
}

export interface AtlasYacht {
  id: string;
  name: string;
  url: string | null;
  /** Sirv lead image at ?w=2000 (16:10) */
  image: string | null;
  specsRaw: string;
  rateRaw: string;
  lengthM: number | null;
  lengthFt: string | null;
  builder: string | null;
  year: number | null;
  guests: number | null;
  currency: string | null;
  weeklyRate: number | null;
  weeklyRateIsFrom: boolean;
  tags: string[];
}

export interface AtlasReviewItem {
  id: string;
  name: string;
  lat: number | null;
  lon: number | null;
  confidence: GeoConfidence;
  flags: string[];
}

export interface AtlasSnapshot {
  generatedAt: string;
  source: string;
  site: {
    title: string;
    description: string;
    heroImage: string | null;
    ogImage: string | null;
    regionOrder: string[];
  };
  counts: {
    pages: number;
    regions: number;
    destinations: number;
    yachts: number;
    review: number;
    errors: number;
  };
  destinations: AtlasDestination[];
  yachts: Record<string, AtlasYacht>;
  review: AtlasReviewItem[];
  errors: Array<{ url: string; error: string }>;
}
