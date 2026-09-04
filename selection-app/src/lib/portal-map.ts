/**
 * Draft → PageConfig mapping: what PREVIEW renders and PUBLISH freezes.
 * The Tier 3 page hides rows for missing fields, so blank draft fields map
 * to undefined rather than empty strings.
 */

import type { PageConfig, Yacht } from "./types";
import type { DraftYacht, PortalDraft } from "./portal-types";
import { slugify } from "@/server/yachtfolio/normalise.mjs";

const str = (v: string | undefined): string | undefined => {
  const t = (v ?? "").trim();
  return t || undefined;
};

const num = (v: string | undefined): number | undefined => {
  const t = (v ?? "").replace(/[^\d.]/g, "");
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

function mapStaterooms(v: string): Yacht["staterooms"] {
  const t = v.trim();
  if (!t) return undefined;
  const m = t.match(/^(\d+)\s*(?:\(([^)]*)\))?/);
  if (!m) return undefined;
  return { count: Number(m[1]), breakdown: (m[2] ?? "").trim() };
}

export function mapDraftYacht(y: DraftYacht): Yacht | null {
  const name = (y.name ?? "").trim();
  if (!name) return null;
  return {
    id: slugify(name) || y.uid,
    ...(y.yfId ? { yachtfolioId: y.yfId } : {}),
    name: name.toUpperCase(),
    lengthM: num(y.lengthM),
    yearRefit: str(y.yearRefit),
    guests: num(y.guests) ? Math.round(num(y.guests) as number) : undefined,
    staterooms: mapStaterooms(y.staterooms),
    location: str(y.location),
    cruisingArea: str(y.cruisingArea)?.toUpperCase(),
    availability: str(y.availability),
    weeklyRateEUR: num(y.weeklyRateEUR),
    weeklyRateIsFrom: y.weeklyRateIsFrom || undefined,
    apaPct: num(y.apaPct) ?? 35,
    notes: str(y.notes),
    leadImageUrl: str(y.leadImageUrl) ?? "",
    interiorImageUrl: str(y.interiorImageUrl) ?? str(y.leadImageUrl) ?? "",
    deckImageUrl: str(y.deckImageUrl) ?? str(y.leadImageUrl) ?? "",
    watertoysImageUrl: str(y.watertoysImageUrl) ?? str(y.leadImageUrl) ?? "",
    brochureUrl: str(y.brochureUrl) ?? "#",
  };
}

export function draftToPageConfig(draft: PortalDraft, slug: string): PageConfig {
  return {
    slug,
    clientNames: str(draft.clientNames) ?? "",
    season: str(draft.season) ?? "",
    region: str(draft.region) ?? "",
    headline: str(draft.headline) ?? "Yacht Charter Selection",
    yachts: draft.yachts.map(mapDraftYacht).filter((y): y is Yacht => y !== null),
    sections: {
      costs: draft.sections.costs,
      itinerary: draft.sections.itinerary,
      itineraryUrl: str(draft.sections.itineraryUrl),
      compare: draft.sections.compare,
    },
    consultant: {
      name: str(draft.consultant.name) ?? "",
      title: str(draft.consultant.title) ?? "",
      phone: str(draft.consultant.phone) ?? "",
      email: str(draft.consultant.email) ?? "",
      whatsapp: str(draft.consultant.whatsapp) ?? "",
      photoUrl: str(draft.consultant.photoUrl) ?? "",
    },
  };
}

export function draftSlugBase(draft: PortalDraft): string {
  return (
    slugify(`${draft.clientNames ?? ""} ${draft.season ?? ""}`) ||
    `presentation-${draft.id.slice(0, 8)}`
  );
}
