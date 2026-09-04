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
  location?: string;
  cruisingArea?: string;
  availability?: string;
  weeklyRateEUR?: number;
  /** True when the Yachtfolio season rate is a range — render as "from" */
  weeklyRateIsFrom?: boolean;
  /** APA percentage of the charter fee; default 35 */
  apaPct: number;
  /** Consultant's personal note, rendered signed with the consultant name */
  notes?: string;
  /** All yacht imagery is 16:10, source 2000×1250 (Yachtfolio, cropped at build time) */
  leadImageUrl: string;
  interiorImageUrl: string;
  deckImageUrl: string;
  watertoysImageUrl: string;
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
  /** Up to 10 shortlisted yachts */
  yachts: Yacht[];
  sections: PageSections;
  consultant: Consultant;
  /** "Explore all destinations" link target (Tier 1 atlas) */
  atlasUrl?: string;
}
