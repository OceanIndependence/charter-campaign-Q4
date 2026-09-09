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

/**
 * Campaign tiers built in the portal. Tier 3 is the original Yacht Selection;
 * Tier 2 is the Personalised Atlas (three destinations on the globe plus a
 * yacht rail). Selections saved before tiers existed have no field: read
 * them as Tier 3 with selectionTier().
 */
export type Tier = 2 | 3;

/** Fields every selection shares, whichever tier it renders as. */
export interface SelectionBase {
  id: string;
  tier?: Tier;
  /** Consultant identity that owns this draft (stamped server-side) */
  owner?: PageOwner;
  updatedAt: string;
  clientNames: string;
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

export function selectionTier(s: { tier?: Tier } | null | undefined): Tier {
  return s?.tier === 2 ? 2 : 3;
}

/** Tier 3 — Yacht Selection. */
export interface PortalDraft extends SelectionBase {
  tier?: 3;
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
}

/* ------------------------------------------------------------ Tier 2 */

/**
 * One editable block of destination copy or imagery. Populated from the 2027
 * Atlas (source "atlas") when a destination is chosen; the first consultant
 * edit flips it to "consultant". The client page derives its attribution
 * label ("FROM THE 2027 ATLAS" / "CURATED FOR YOU BY <NAME>") from source.
 */
export interface ContentBlock {
  value: string;
  source: "atlas" | "consultant";
}

/** The Atlas defaults for a destination, kept so "Restore Atlas text" works offline. */
export interface AtlasDefaults {
  eyebrow: string;
  deckLine: string;
  description: string;
  /** Prepared 2000×1250 URLs, most relevant first */
  images: string[];
  /** Whether the copy came from the live website or the checked-in snapshot */
  contentSource: "live" | "cache";
  fetchedAt: string;
}

/** One of the three destination slots on a Tier 2 draft. */
export interface Tier2DestinationDraft {
  /** Tier 1 destination id (data/destinations.json), null while unchosen */
  destinationId: string | null;
  /** Display name as shown on the page (from the Atlas) */
  name: string;
  eyebrow: ContentBlock;
  deckLine: ContentBlock;
  description: ContentBlock;
  /** Optional — blank hides the note */
  consultantNote: ContentBlock;
  /** Two 16:10 images */
  images: [ContentBlock, ContentBlock];
  atlas: AtlasDefaults | null;
  /** Cruising-area terms from the Atlas, used to pre-tick yachts (region terms prefixed "region:") */
  areaTerms?: string[];
}

/**
 * A Tier 2 yacht: the Tier 3 draft yacht (Yachtfolio facts, key features,
 * gallery and image slots, auto-filled the same way) plus the rail and
 * drawer fields.
 */
export interface Tier2DraftYacht extends DraftYacht {
  /** One or more of the draft's three destination ids */
  destinationIds: string[];
  /** One line, signed with the consultant's first name on the page */
  consultantNote: string;
  /** Drawer VAT row text (there is no VAT percentage on Tier 2) */
  vatText: string;
}

export interface SeasonNote {
  eyebrow: string;
  body: string;
}

export const TIER2_DEFAULT_DISCLAIMER = "These vessels are offered subject to change, price change, and owners’ final approval.";
export const TIER2_DEFAULT_VAT_TEXT = "Varies by location";
/**
 * The APA percentage every tier starts from: the Tier 3 form default, the
 * Tier 2 default and the public fleet page's "plus N% APA" all read this.
 * Consultants override it per yacht in their drafts; the public page never
 * sees those overrides.
 */
export const DEFAULT_APA_PCT = 35;
export const TIER2_DEFAULT_APA = String(DEFAULT_APA_PCT);
export const TIER2_MIN_YACHTS = 2;
export const TIER2_MAX_YACHTS = 8;

/** Tier 2 — Personalised Atlas. */
export interface Tier2Draft extends SelectionBase {
  tier: 2;
  /** Client page address under /atlas/ — auto from the client name, editable */
  slug: string;
  /** The h1 line */
  clientGreeting: string;
  /** The consultant's paragraph; signed with their first name on the page */
  introNote: string;
  seasonNote: SeasonNote | null;
  footerDisclaimer: string;
  /** Always three slots */
  destinations: [Tier2DestinationDraft, Tier2DestinationDraft, Tier2DestinationDraft];
  yachts: Tier2DraftYacht[];
}

export type AnySelection = PortalDraft | Tier2Draft;

export function emptyContentBlock(value = "", source: ContentBlock["source"] = "atlas"): ContentBlock {
  return { value, source };
}

export function emptyTier2Destination(): Tier2DestinationDraft {
  return {
    destinationId: null,
    name: "",
    eyebrow: emptyContentBlock(),
    deckLine: emptyContentBlock(),
    description: emptyContentBlock(),
    consultantNote: emptyContentBlock("", "consultant"),
    images: [emptyContentBlock(), emptyContentBlock()],
    atlas: null,
  };
}

export function emptyTier2Yacht(uid: string): Tier2DraftYacht {
  return {
    ...emptyDraftYacht(uid),
    apaPct: TIER2_DEFAULT_APA,
    destinationIds: [],
    consultantNote: "",
    vatText: TIER2_DEFAULT_VAT_TEXT,
  };
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
  tier: Tier;
  owner: PageOwner;
  clientNames: string;
  /** Tier 3: page headline; Tier 2: the client greeting */
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

export const TIER_LABEL: Record<Tier, string> = { 2: "Personalised Atlas", 3: "Yacht Selection" };

/** Where a published selection lives: /atlas/<slug> for Tier 2, /selection/<slug> for Tier 3. */
export function clientPagePath(tier: Tier, slug: string): string {
  return tier === 2 ? `/atlas/${slug}` : `/selection/${slug}`;
}

/* --------------------------------------------- Tier 1 content for the form */

/** One Atlas destination as offered by the Tier 2 destination pickers. */
export interface AtlasDestinationOption {
  id: string;
  name: string;
  level: number;
  regionId: string;
  regionName: string;
  /** "Mediterranean · Italy" — the ancestors above this destination */
  pathLabel: string;
  lat: number | null;
  lon: number | null;
  featured: boolean;
}

/** Response of GET /api/atlas/destinations/:id — the prepared defaults for one destination. */
export interface AtlasDestinationContent {
  id: string;
  name: string;
  atlas: AtlasDefaults;
  /** Terms (destination and place names) used to map Yachtfolio cruising areas onto it */
  areaTerms: string[];
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
  /** Blob-operation accounting for this request (diagnostic) */
  blob?: Record<string, unknown>;
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
    apaPct: String(DEFAULT_APA_PCT),
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
