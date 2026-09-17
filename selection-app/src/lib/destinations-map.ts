/**
 * Tier 2 draft → DestinationsPageConfig: what PREVIEW renders and PUBLISH freezes.
 * Yachts go through the Tier 3 mapping (mapDraftYacht) so the Yachtfolio
 * facts, the 16:10 image slots and the price maths are identical across
 * tiers; the destination blocks and the surrounding Atlas pins are resolved
 * from the caller-supplied snapshot so a published page never changes when
 * the website, the Atlas or Yachtfolio do.
 */

import type { AtlasBlock, DestinationsPageConfig, DestinationsPageDestination, DestinationsPageYacht } from "./types";
import type { ContentBlock, Tier2Draft, Tier2DraftYacht } from "./portal-types";
import { TIER2_DEFAULT_DISCLAIMER, TIER2_DEFAULT_SECTIONS, TIER2_DEFAULT_VAT_TEXT, TIER2_MAX_YACHTS, TIER2_MIN_YACHTS, tier2VatPctFromText } from "./portal-types";
import { CAMPAIGN_ATLAS_URL, mapDraftYacht, mapItineraryLinks } from "./portal-map";
import { slugify } from "@/server/yachtfolio/normalise.mjs";

/** What the mapping needs from the Atlas for the chosen destinations. */
export interface AtlasResolution {
  destinations: Record<string, { name: string; lat: number; lon: number; guideUrl: string }>;
  otherPins: DestinationsPageConfig["otherPins"];
}

const str = (v: string | undefined | null): string | undefined => {
  const t = (v ?? "").trim();
  return t || undefined;
};

function block(b: ContentBlock | undefined, fallback = ""): AtlasBlock {
  return { value: (b?.value ?? fallback).trim(), source: b?.source === "consultant" ? "consultant" : "atlas" };
}

/** The three chosen destination ids, in slot order (unchosen slots skipped). */
export function chosenDestinationIds(draft: Tier2Draft): string[] {
  return draft.destinations.map((d) => d.destinationId).filter((id): id is string => Boolean(id));
}

export function mapTier2Yacht(y: Tier2DraftYacht, validDestinationIds: Set<string>): DestinationsPageYacht | null {
  // VAT is a percentage on both tiers: the shared mapping turns it into an
  // amount and folds it into the total, so the rail card, the drawer and the
  // comparison grid read as they do on Tier 3. A yacht whose VAT was typed as
  // free text before the field was a percentage is read as one here; only a
  // yacht with no percentage at all falls back to the vatText line. The
  // Yachtfolio key features carry through as the drawer highlights.
  const vatPct = str(y.vatPct) ?? tier2VatPctFromText(y.vatText);
  const base = mapDraftYacht({ ...y, vatPct, notes: y.consultantNote });
  if (!base) return null;
  return {
    ...base,
    destinationIds: (y.destinationIds ?? []).filter((id) => validDestinationIds.has(id)),
    consultantNote: str(y.consultantNote),
    vatText: (tier2VatPctFromText(y.vatText) ? undefined : str(y.vatText)) ?? TIER2_DEFAULT_VAT_TEXT,
  };
}

export function tier2DraftToConfig(draft: Tier2Draft, slug: string, atlas: AtlasResolution): DestinationsPageConfig {
  const destinations: DestinationsPageDestination[] = [];
  for (const d of draft.destinations) {
    if (!d.destinationId) continue;
    const geo = atlas.destinations[d.destinationId];
    if (!geo) continue;
    const note = block(d.consultantNote);
    destinations.push({
      id: d.destinationId,
      name: (str(d.name) ?? geo.name).trim(),
      lat: geo.lat,
      lon: geo.lon,
      guideUrl: geo.guideUrl,
      eyebrow: block(d.eyebrow),
      deckLine: block(d.deckLine),
      description: block(d.description),
      ...(note.value ? { consultantNote: note } : {}),
      images: [block(d.images?.[0]), block(d.images?.[1])],
    });
  }
  const valid = new Set(destinations.map((d) => d.id));
  const yachts = draft.yachts
    .slice(0, TIER2_MAX_YACHTS)
    .map((y) => mapTier2Yacht(y, valid))
    .filter((y): y is DestinationsPageYacht => y !== null);
  const seasonEyebrow = str(draft.seasonNote?.eyebrow);
  const seasonBody = str(draft.seasonNote?.body);
  return {
    tier: 2,
    slug,
    clientNames: str(draft.clientNames) ?? "",
    clientGreeting: str(draft.clientGreeting) ?? "",
    introNote: str(draft.introNote) ?? "",
    ...(seasonBody ? { seasonNote: { eyebrow: seasonEyebrow ?? "A NOTE ON THE SEASON", body: seasonBody } } : {}),
    footerDisclaimer: str(draft.footerDisclaimer) ?? TIER2_DEFAULT_DISCLAIMER,
    destinations,
    yachts,
    otherPins: atlas.otherPins,
    // A draft saved before the Page Sections card existed is read as a new
    // one would be: every section on, dark theme (what the form shows on load).
    // Itinerary buttons go through the Tier 3 mapping: blank rows dropped,
    // capped at MAX_ITINERARY_LINKS.
    sections: {
      costs: draft.sections?.costs ?? TIER2_DEFAULT_SECTIONS.costs,
      itinerary: draft.sections?.itinerary ?? TIER2_DEFAULT_SECTIONS.itinerary,
      itineraryLinks: mapItineraryLinks({ itineraryLinks: draft.sections?.itineraryLinks }),
      compare: draft.sections?.compare ?? TIER2_DEFAULT_SECTIONS.compare,
    },
    theme: draft.theme === "light" ? "light" : "dark",
    consultant: {
      name: str(draft.consultant.name) ?? "",
      title: str(draft.consultant.title) ?? "",
      phone: str(draft.consultant.phone) ?? "",
      email: str(draft.consultant.email) ?? "",
      whatsapp: str(draft.consultant.whatsapp) ?? "",
      photoUrl: str(draft.consultant.photoUrl) ?? "",
    },
    atlasUrl: CAMPAIGN_ATLAS_URL,
    contentSources: Object.fromEntries(
      draft.destinations.filter((d) => d.destinationId && d.atlas).map((d) => [d.destinationId as string, d.atlas!.contentSource])
    ),
  };
}

/**
 * The base of the client page address, which publishSelection() completes
 * with a random tail. The form no longer offers an address field, so this is
 * the client's surname and the season; a draft saved while the field existed
 * keeps whatever was typed into it.
 */
export function tier2SlugBase(draft: Tier2Draft): string {
  return slugify(draft.slug || "") || suggestTier2Slug(draft.clientNames ?? "") || `destinations-${draft.id.slice(0, 8)}`;
}

/** Slug built from a client name: "Mr and Mrs Harrington" → "harrington-summer-2027". */
export function suggestTier2Slug(clientNames: string): string {
  const words = clientNames
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((w) => w && !/^(mr|mrs|ms|miss|dr|and|&|the|family|sir|lady|lord)$/i.test(w));
  const surname = words.length ? words[words.length - 1] : "";
  return slugify(surname ? `${surname} summer 2027` : "");
}

/** Problems that stop a publish, in the order the form shows them. */
export function tier2PublishProblems(draft: Tier2Draft): string[] {
  const problems: string[] = [];
  const chosen = chosenDestinationIds(draft);
  if (chosen.length !== 3) problems.push("Choose three destinations.");
  if (new Set(chosen).size !== chosen.length) problems.push("Each destination may be chosen once.");
  const named = draft.yachts.filter((y) => (y.name ?? "").trim());
  if (named.length < TIER2_MIN_YACHTS) problems.push("Add at least two yachts.");
  if (named.length > TIER2_MAX_YACHTS) problems.push(`No more than ${TIER2_MAX_YACHTS} yachts.`);
  if (!(draft.clientNames ?? "").trim()) problems.push("Enter the client name.");
  return problems;
}

/** Non-blocking warnings shown in the form. */
export function tier2Warnings(draft: Tier2Draft): string[] {
  const warnings: string[] = [];
  const chosen = chosenDestinationIds(draft);
  const named = draft.yachts.filter((y) => (y.name ?? "").trim());
  for (const y of named) {
    if (!(y.destinationIds ?? []).some((id) => chosen.includes(id))) warnings.push(`${y.name.trim().toUpperCase()} has no destination ticked.`);
  }
  for (const d of draft.destinations) {
    if (!d.destinationId) continue;
    if (!named.some((y) => (y.destinationIds ?? []).includes(d.destinationId as string))) {
      warnings.push(`${(d.name || d.destinationId).toUpperCase()} has no yachts.`);
    }
  }
  return warnings;
}
