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
  staterooms?: Staterooms;
  cruisingArea?: string;
  availability?: string;
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

export interface PageConfig {
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
}
