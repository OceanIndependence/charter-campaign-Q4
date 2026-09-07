/**
 * Charter Portal form state (drafts) — the editable superset of the Tier 3
 * PageConfig. Field values are strings while being edited; mapping to the
 * typed PageConfig happens in portal-map.ts.
 */

export interface DraftYacht {
  /** Stable local key for React lists */
  uid: string;
  /** Yachtfolio id once picked from the fleet dropdown */
  yfId: number | null;
  name: string;
  lengthM: string;
  yearRefit: string;
  guests: string;
  /** e.g. "6 (5 double, 1 twin)" */
  staterooms: string;
  cruisingArea: string;
  availability: string;
  /** ISO currency code for the rate (auto-filled, editable, default EUR) */
  currency: string;
  weeklyRate: string;
  weeklyRateIsFrom: boolean;
  apaPct: string;
  /** VAT percentage; blank shows "TBC" and drops out of the total */
  vatPct: string;
  notes: string;
  /** One key feature per line (auto-filled from Yachtfolio, editable) */
  keyFeatures: string;
  leadImageUrl: string;
  interiorImageUrl: string;
  deckImageUrl: string;
  watertoysImageUrl: string;
  brochureUrl: string;
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
  /** Optional consultant welcome greeting (cover falls back to a generated line) */
  welcome: string;
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

/** Response of GET /api/fleet/:yfId — auto-fill values for the form. */
export interface FleetDetail {
  yfId: number;
  fetchedAt: string;
  targetSeason: string;
  name: string;
  lengthM: number | null;
  yearRefit: string;
  guests: number | null;
  builder: string;
  staterooms: string;
  cruisingArea: string;
  availability: string;
  currency: string;
  weeklyRate: number | null;
  weeklyRateIsFrom: boolean;
  leadImageUrl: string;
  interiorImageUrl: string;
  deckImageUrl: string;
  watertoysImageUrl: string;
  brochureUrl: string;
  description: string;
  keyFeatures: string[];
  gallery: Array<{ category: string; url: string; smallUrl: string }>;
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
    staterooms: "",
    cruisingArea: "",
    availability: "",
    currency: "EUR",
    weeklyRate: "",
    weeklyRateIsFrom: false,
    apaPct: "35",
    vatPct: "",
    notes: "",
    keyFeatures: "",
    leadImageUrl: "",
    interiorImageUrl: "",
    deckImageUrl: "",
    watertoysImageUrl: "",
    brochureUrl: "",
  };
}
