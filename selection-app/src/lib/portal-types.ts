/**
 * Charter Portal form state (drafts) — the editable superset of the Tier 3
 * PageConfig. Field values are strings while being edited; mapping to the
 * typed PageConfig happens in portal-map.ts.
 */

/** One prepared image in a yacht's gallery, shared by fleet detail and drafts. */
export interface GalleryImage {
  /** Yachtfolio id_file — stable identity for React keys and selection */
  id: number;
  /** EXTERIOR | LIFESTYLE | INTERIOR */
  category: string;
  /** Cropped 2000×1250 URL used on the page */
  url: string;
  /** Cropped 1000×625 URL used as the picker thumbnail */
  smallUrl: string;
  /** Yachtfolio source filename — used to spot the same photo in two galleries */
  filename?: string | null;
}

export interface DraftYacht {
  /** Stable local key for React lists */
  uid: string;
  /** Yachtfolio id once picked from the fleet dropdown */
  yfId: number | null;
  name: string;
  lengthM: string;
  yearRefit: string;
  guests: string;
  crew: string;
  /** e.g. "6 (5 double, 1 twin)" */
  staterooms: string;
  cruisingArea: string;
  /** ISO currency code for the rate (auto-filled, editable, default EUR) */
  currency: string;
  weeklyRate: string;
  weeklyRateIsFrom: boolean;
  /** Which Yachtfolio season/tier the auto-filled rate came from */
  rateSeason: "summer" | "winter";
  rateTier: "low" | "high";
  /** Summer/winter 2027 rate matrix from Yachtfolio, for switching offline */
  rateOptions?: RateOptions;
  apaPct: string;
  /** VAT percentage; blank shows "TBC" and drops out of the total */
  vatPct: string;
  notes: string;
  /** One key feature per line (auto-filled from Yachtfolio, editable) */
  keyFeatures: string;
  /**
   * The prepared gallery for this yacht (all categories, capped), refreshed
   * on each fleet pick. Held in the draft so the thumbnail picker survives a
   * reload without re-fetching; dropped at publish — only the four chosen
   * slot URLs below are frozen into the page.
   */
  gallery: GalleryImage[];
  /** The four page slots — each holds the chosen image's 2000×1250 URL */
  leadImageUrl: string;
  interiorImageUrl: string;
  exteriorImageUrl: string;
  lifestyleImageUrl: string;
  /** The yacht's Yachtfolio e-brochure link, pasted by the consultant */
  brochureUrl: string;
}

export interface RateSeasonOption {
  low: number | null;
  high: number | null;
  currency: string | null;
  label: string;
}

export interface RateOptions {
  summer: RateSeasonOption;
  winter: RateSeasonOption;
}

export interface PageOwner {
  /** Durable owner key — Microsoft object ID once live, a stub id for now */
  id: string;
  email: string;
  name: string;
}

export interface PortalDraft {
  id: string;
  /** Consultant identity that owns this draft (stamped server-side) */
  owner?: PageOwner;
  updatedAt: string;
  clientNames: string;
  season: string;
  region: string;
  headline: string;
  /** Cover eyebrow override (falls back to "{N} YACHT(S), HELD FOR YOUR REVIEW") */
  subHeadline: string;
  /** Optional consultant welcome greeting (cover falls back to a generated line) */
  welcome: string;
  /** Client page theme; absent means dark */
  theme?: "dark" | "light";
  yachts: DraftYacht[];
  sections: {
    costs: boolean;
    itinerary: boolean;
    itineraryUrl: string;
    compare: boolean;
  };
  consultant: {
    name: string;
    title: string;
    phone: string;
    email: string;
    whatsapp: string;
    photoUrl: string;
  };
  /** Set after first publish so republishing keeps the same client URL */
  publishedSlug?: string;
  /** Set server-side on creation */
  createdAt?: string;
  /** Publish state, maintained server-side on publish/unpublish/rollback */
  published?: PublishState;
}

export interface PublishState {
  version: number;
  publishedAt: string;
  /** false once unpublished — the record and its versions are kept */
  live: boolean;
  unpublishedAt: string | null;
}

export type SelectionStatus = "draft" | "published" | "unpublished";

/** Dashboard row — stored in the per-consultant index at save time. */
export interface SelectionMeta {
  id: string;
  owner: PageOwner;
  clientNames: string;
  headline: string;
  slug: string | null;
  yachtCount: number;
  status: SelectionStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  unpublishedAt: string | null;
}

/** One entry in a published selection's version history. */
export interface VersionInfo {
  version: number;
  publishedAt: string;
  yachtCount: number;
  clientNames: string;
  headline: string;
  rolledBackFrom: number | null;
  isCurrent: boolean;
}

/** Dashboard heading for a selection: page title, else client name. */
export function selectionTitle(m: { headline?: string; clientNames?: string }): string {
  return (m.headline ?? "").trim() || (m.clientNames ?? "").trim() || "Untitled selection";
}

export interface FleetEntry {
  id: number;
  name: string;
  registryPort: string;
}

export interface FleetCache {
  syncedAt: string;
  count: number;
  yachts: FleetEntry[];
  /** Yachts that have disappeared from Yachtfolio since an earlier sync */
  removed: Record<string, { name: string; removedAt: string }>;
}

/** Response of GET /api/fleet/:yfId/images — the gallery and default slots. */
export interface FleetImages {
  yfId: number;
  fetchedAt: string;
  gallery: GalleryImage[];
  leadImageUrl: string;
  interiorImageUrl: string;
  exteriorImageUrl: string;
  lifestyleImageUrl: string;
  warnings: string[];
}

/** Response of GET /api/fleet/:yfId — auto-fill facts for the form (no images). */
export interface FleetDetail {
  yfId: number;
  fetchedAt: string;
  targetSeason: string;
  name: string;
  lengthM: number | null;
  yearRefit: string;
  guests: number | null;
  crew: number | null;
  builder: string;
  staterooms: string;
  cruisingArea: string;
  currency: string;
  weeklyRate: number | null;
  weeklyRateIsFrom: boolean;
  rateSeason: "summer" | "winter";
  rateTier: "low" | "high";
  rateOptions: RateOptions;
  description: string;
  keyFeatures: string[];
  dataSource: string | null;
  missing: string[];
  warnings: string[];
}

export function emptyDraftYacht(uid: string): DraftYacht {
  return {
    uid,
    yfId: null,
    name: "",
    lengthM: "",
    yearRefit: "",
    guests: "",
    crew: "",
    staterooms: "",
    cruisingArea: "",
    currency: "EUR",
    weeklyRate: "",
    weeklyRateIsFrom: false,
    rateSeason: "summer",
    rateTier: "low",
    apaPct: "35",
    vatPct: "",
    notes: "",
    keyFeatures: "",
    gallery: [],
    leadImageUrl: "",
    interiorImageUrl: "",
    exteriorImageUrl: "",
    lifestyleImageUrl: "",
    brochureUrl: "",
  };
}
