/**
 * Tier 2 draft → AtlasPageConfig: what PREVIEW renders and PUBLISH freezes.
 * Yachts go through the Tier 3 mapping (mapDraftYacht) so the Yachtfolio
 * facts, the 16:10 image slots and the price maths are identical across
 * tiers; the destination blocks and the surrounding Atlas pins are resolved
 * from the caller-supplied snapshot so a published page never changes when
 * the website, the Atlas or Yachtfolio do.
 */

import type { AtlasBlock, AtlasPageConfig, AtlasPageDestination, AtlasPageYacht } from "./types";
import type { ContentBlock, Tier2Draft, Tier2DraftYacht } from "./portal-types";
import { TIER2_DEFAULT_DISCLAIMER, TIER2_DEFAULT_VAT_TEXT, TIER2_MAX_YACHTS } from "./portal-types";
import { CAMPAIGN_ATLAS_URL, mapDraftYacht } from "./portal-map";
import { slugify } from "@/server/yachtfolio/normalise.mjs";

/** What the mapping needs from the Atlas for the chosen destinations. */
export interface AtlasResolution {
  destinations: Record<string, { name: string; lat: number; lon: number; guideUrl: string }>;
  otherPins: AtlasPageConfig["otherPins"];
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

export function mapTier2Yacht(y: Tier2DraftYacht, validDestinationIds: Set<string>): AtlasPageYacht | null {
  // Tier 2 has no VAT percentage: the drawer shows vatText and the total is
  // rate plus APA. Clear any stray percentage before the shared mapping runs.
  const base = mapDraftYacht({ ...y, vatPct: "", notes: y.consultantNote, keyFeatures: "" });
  if (!base) return null;
  const highlights = (y.highlights ?? [])
    .map((h) => ({ title: (h?.title ?? "").trim(), line: (h?.line ?? "").trim() }))
    .filter((h) => h.title || h.line);
  return {
    ...base,
    destinationIds: (y.destinationIds ?? []).filter((id) => validDestinationIds.has(id)),
    knownYacht: Boolean(y.knownYacht),
    consultantNote: str(y.consultantNote),
    vatText: str(y.vatText) ?? TIER2_DEFAULT_VAT_TEXT,
    highlights,
  };
}

export function tier2DraftToConfig(draft: Tier2Draft, slug: string, atlas: AtlasResolution): AtlasPageConfig {
  const destinations: AtlasPageDestination[] = [];
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
    .filter((y): y is AtlasPageYacht => y !== null);
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

/** Slug the client page is published under: the form's slug, else the client name. */
export function tier2SlugBase(draft: Tier2Draft): string {
  return slugify(draft.slug || "") || slugify(`${draft.clientNames ?? ""} summer 2027`) || `atlas-${draft.id.slice(0, 8)}`;
}

/** Slug suggested from a client name: "Mr and Mrs Harrington" → "harrington-summer-2027". */
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
  if (named.length < 2) problems.push("Add at least two yachts.");
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
