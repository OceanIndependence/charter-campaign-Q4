/**
 * Fleet page selection — SERVER-ONLY. Which yachts from the fleet facts
 * document belong on /2027-charter-season/yachts/<destination>, decided the
 * same way for the page and for the coverage report (/api/fleet/report).
 *
 * A yacht qualifies when its Yachtfolio cruising area names the destination,
 * one of its places or its country (a "specific" match); when no yacht does,
 * every yacht whose area names the destination's region is listed instead
 * (a "region" match). Yachts the normaliser marked unavailable for the target
 * season are left out. Same matcher as the Tier 2 form (src/lib/area-match).
 */

import type { AtlasDestination } from "@/lib/atlas/types";
import type { AtlasIndex } from "@/lib/atlas/data";
import { areaMatchLevel, type AreaCandidate } from "@/lib/area-match";
import { areaTermsFor } from "@/server/atlas/content";

/** One yacht in yachtfolio/fleet-facts.json (see src/server/fleet-facts.mjs). */
export interface FactsYacht {
  id: number;
  name: string;
  lengthM: number | null;
  yearRefit: string;
  guests: number | null;
  crew: number | null;
  builder: string;
  staterooms: { count: number | null; breakdown: string } | null;
  cruisingArea: string;
  currency: string | null;
  rateMin: number | null;
  rateMax: number | null;
  rateSeason?: string;
  dataSource: string | null;
  unavailableForTarget: boolean;
  missing: string[];
  leadImageUrl: string;
  interiorImageUrl: string;
  exteriorImageUrl: string;
  lifestyleImageUrl: string;
  factsAt?: string;
}

export interface FleetFactsDoc {
  source: string;
  fallback?: string;
  updatedAt: string;
  count?: number;
  yachts: Record<string, FactsYacht>;
}

export type MatchLevel = "specific" | "region";

export interface FleetSelection {
  candidate: AreaCandidate;
  /** The yachts to list, with how each one matched */
  yachts: Array<{ yacht: FactsYacht; level: MatchLevel }>;
  /** "specific" when at least one yacht names the destination, "region" for the fallback, "none" for the empty state */
  level: MatchLevel | "none";
}

/** The Tier 2 matcher's candidate for a destination: own terms plus `region:` terms. */
export function areaCandidateFor(dest: AtlasDestination, index: AtlasIndex): AreaCandidate {
  const { areaTerms, regionTerms } = areaTermsFor(dest, index);
  return { id: dest.id, areaTerms: [...areaTerms, ...regionTerms.map((t) => `region:${t}`)] };
}

export function selectFleetForDestination(dest: AtlasDestination, index: AtlasIndex, facts: FleetFactsDoc): FleetSelection {
  const candidate = areaCandidateFor(dest, index);
  const matched = Object.values(facts.yachts ?? {})
    .map((yacht) => ({ yacht, level: areaMatchLevel(yacht.cruisingArea, candidate) }))
    .filter((m): m is { yacht: FactsYacht; level: MatchLevel } => m.level !== null && !m.yacht.unavailableForTarget);
  const specific = matched.filter((m) => m.level === "specific");
  const yachts = specific.length ? specific : matched;
  return { candidate, yachts, level: specific.length ? "specific" : yachts.length ? "region" : "none" };
}
