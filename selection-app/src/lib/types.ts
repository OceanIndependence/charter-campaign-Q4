/**
 * Data model per the Tier 3 handoff README. In production every PageConfig
 * is assembled by the Charter Portal (consultant form → publish → unique
 * client URL); this app only renders it.
 */

export interface Staterooms {
  count: number;
  /** e.g. "5 double, 1 twin" */
  breakdown: string;
}

/**
 * Fields sourced from Yachtfolio may be absent for a given yacht; the UI
 * hides the corresponding row instead of rendering a null.
 */
export interface Yacht {
  id: string;
  /** Yachtfolio internal id, when the yacht came from the API */
  yachtfolioId?: number;
  /** Yacht names render in ALL CAPS */
  name: string;
  tagline?: string;
  lengthM?: number;
  /** e.g. "2019 / 2024" or "2023" */
  yearRefit?: string;
  guests?: number;
  crew?: number;
  staterooms?: Staterooms;
  cruisingArea?: string;
  /** ISO currency code for this yacht's rate (EUR, USD, GBP, …) */
  currency?: string;
  weeklyRate?: number;
  /** True when the Yachtfolio season rate is a range — render as "from" */
  weeklyRateIsFrom?: boolean;
  /**
   * Price components, all in `currency` and computed at publish time so the
   * published page never recalculates. A component is present only when the
   * consultant supplied its input; missing components hide their row.
   */
  apaPct?: number;
  apaAmount?: number;
  vatPct?: number;
  vatAmount?: number;
  totalAmount?: number;
  /** Consultant's personal note, rendered signed with the consultant name */
  notes?: string;
  /** All yacht imagery is 16:10, source 2000×1250 (Yachtfolio, cropped at build time) */
  leadImageUrl: string;
  interiorImageUrl: string;
  exteriorImageUrl: string;
  lifestyleImageUrl: string;
  brochureUrl: string;
  /** Plain-text description from the Yachtfolio brochure (HTML stripped) */
  description?: string;
  keyFeatures?: string[];
  /** Full downloaded gallery, ordered EXTERIOR, LIFESTYLE, INTERIOR */
  gallery?: Array<{ url: string; smallUrl: string; category: string }>;
}

export interface Consultant {
  name: string;
  title: string;
  phone: string;
  email: string;
  /** Full wa.me URL */
  whatsapp: string;
  photoUrl: string;
}

export interface PageSections {
  costs: boolean;
  itinerary: boolean;
  itineraryUrl?: string;
  compare: boolean;
}

/** Client page colour theme; dark is the default and the historical look. */
export type PageTheme = "dark" | "light";

export interface PageConfig {
  /** Absent on pages published before tiers existed — read as Tier 3 */
  tier?: 3;
  slug: string;
  clientNames: string;
  season: string;
  region: string;
  headline: string;
  /** Cover eyebrow; falls back to "{N} YACHT(S), HELD FOR YOUR REVIEW" */
  subHeadline?: string;
  /** Optional consultant welcome; falls back to a generated line on the cover */
  welcome?: string;
  /** Up to 10 shortlisted yachts */
  yachts: Yacht[];
  sections: PageSections;
  consultant: Consultant;
  /** "Explore all destinations" link target (Tier 1 atlas) */
  atlasUrl?: string;
  /** Colour theme; absent means dark */
  theme?: PageTheme;
}

/* ------------------------------------------------------------------ Tier 2 */

/** A copy or image block with its provenance, frozen at publish. */
export interface AtlasBlock {
  value: string;
  source: "atlas" | "consultant";
}

/** One of the three chosen destinations, resolved from the Atlas at publish time. */
export interface AtlasPageDestination {
  /** Tier 1 destination id, e.g. "mediterranean/italy/amalfi-coast" */
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** The destination guide on the website */
  guideUrl: string;
  eyebrow: AtlasBlock;
  deckLine: AtlasBlock;
  description: AtlasBlock;
  /** Absent when the consultant left it blank */
  consultantNote?: AtlasBlock;
  /** Two 16:10 images */
  images: [AtlasBlock, AtlasBlock];
}

/**
 * A Tier 2 yacht: the Tier 3 yacht (frozen Yachtfolio facts, with keyFeatures
 * as the drawer highlights) plus rail and drawer fields.
 */
export interface AtlasPageYacht extends Yacht {
  destinationIds: string[];
  /** One line, rendered signed with the consultant's first name */
  consultantNote?: string;
  /** Drawer VAT row text, e.g. "Varies by location" */
  vatText: string;
}

/** Every other Atlas destination, pinned dim on the globe; frozen at publish. */
export interface AtlasPagePin {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export interface AtlasPageConfig {
  tier: 2;
  slug: string;
  clientNames: string;
  clientGreeting: string;
  introNote: string;
  seasonNote?: { eyebrow: string; body: string };
  footerDisclaimer: string;
  destinations: AtlasPageDestination[];
  yachts: AtlasPageYacht[];
  otherPins: AtlasPagePin[];
  consultant: Consultant;
  /** The public Tier 1 page */
  atlasUrl: string;
  /** Diagnostic: which destinations resolved from the live website vs the snapshot */
  contentSources?: Record<string, "live" | "cache">;
}

export type AnyPageConfig = PageConfig | AtlasPageConfig;

export function isAtlasPageConfig(c: AnyPageConfig | null | undefined): c is AtlasPageConfig {
  return (c as AtlasPageConfig | undefined)?.tier === 2;
}
