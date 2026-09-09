/**
 * Yachtfolio cruising areas → Atlas destinations. One matcher for every tier:
 * the Tier 2 form pre-ticks a picked yacht's destinations with it, and the
 * public fleet page filters the fleet for a destination with it.
 *
 * A destination's `areaTerms` come from `areaTermsFor()` in
 * src/server/atlas/content.ts: its own name, its places, its country, all
 * lower-cased, plus `region:<region name>`. A destination matches when one of
 * its own terms appears in the area string (word-boundary match); when none
 * of the candidates match that way, every candidate whose region term matches
 * is returned instead ("WEST MEDITERRANEAN" → every Mediterranean candidate).
 */

export interface AreaCandidate {
  id: string;
  areaTerms: string[];
}

const escape = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** True when `term` appears in `area` as a whole word (case-insensitive). */
export function areaHasTerm(area: string, term: string): boolean {
  if (!term) return false;
  return new RegExp(`(^|[^a-z])${escape(term.toLowerCase())}([^a-z]|$)`).test(area.toLowerCase());
}

/**
 * The candidate ids the cruising-area string points at, specific matches
 * first, region matches as the fallback. Empty when nothing matches.
 */
export function matchDestinationsByArea(cruisingArea: string | null | undefined, candidates: AreaCandidate[]): string[] {
  const area = (cruisingArea ?? "").trim();
  if (!area) return [];
  const specific = candidates.filter((c) => c.areaTerms.some((t) => !t.startsWith("region:") && areaHasTerm(area, t)));
  if (specific.length) return specific.map((c) => c.id);
  return candidates.filter((c) => c.areaTerms.some((t) => t.startsWith("region:") && areaHasTerm(area, t.slice(7)))).map((c) => c.id);
}

/** How a single destination matches an area string: by its own terms, by region only, or not at all. */
export function areaMatchLevel(cruisingArea: string | null | undefined, candidate: AreaCandidate): "specific" | "region" | null {
  const area = (cruisingArea ?? "").trim();
  if (!area) return null;
  if (candidate.areaTerms.some((t) => !t.startsWith("region:") && areaHasTerm(area, t))) return "specific";
  if (candidate.areaTerms.some((t) => t.startsWith("region:") && areaHasTerm(area, t.slice(7)))) return "region";
  return null;
}
