/**
 * Draft → PageConfig mapping: what PREVIEW renders and PUBLISH freezes.
 * The Tier 3 page hides rows for missing fields, so blank draft fields map
 * to undefined rather than empty strings.
 */

import { MAX_ITINERARY_LINKS, type ItineraryLink, type PageConfig, type Yacht } from "./types";
import type { DraftYacht, PortalDraft } from "./portal-types";
import { slugify } from "@/server/yachtfolio/normalise.mjs";

/**
 * Campaign-wide "Explore all 2027 destinations" link — the Tier 1 atlas page
 * served by this app at /2027-charter-season (same deployment, so relative).
 */
export const CAMPAIGN_ATLAS_URL = "/2027-charter-season";

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

function mapKeyFeatures(v: string | undefined): string[] | undefined {
  const items = (v ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length ? items : undefined;
}

export function mapDraftYacht(y: DraftYacht): Yacht | null {
  const name = (y.name ?? "").trim();
  if (!name) return null;

  const weeklyRate = num(y.weeklyRate);
  const currency = (str(y.currency) ?? "EUR").toUpperCase();
  const apaPct = num(y.apaPct);
  const vatPct = num(y.vatPct);
  const deliveryFee = num(y.deliveryFee);

  // Compute price components in the yacht's own currency and freeze them, so
  // the published page never recalculates. A component exists only when both
  // the rate and its percentage are present.
  const apaAmount = weeklyRate != null && apaPct != null ? Math.round((weeklyRate * apaPct) / 100) : undefined;
  const vatAmount = weeklyRate != null && vatPct != null ? Math.round((weeklyRate * vatPct) / 100) : undefined;
  const totalAmount =
    weeklyRate != null ? weeklyRate + (apaAmount ?? 0) + (vatAmount ?? 0) + (deliveryFee ?? 0) : undefined;

  return {
    id: slugify(name) || y.uid,
    ...(y.yfId ? { yachtfolioId: y.yfId } : {}),
    name: name.toUpperCase(),
    lengthM: num(y.lengthM),
    yearRefit: str(y.yearRefit),
    guests: num(y.guests) ? Math.round(num(y.guests) as number) : undefined,
    crew: num(y.crew) ? Math.round(num(y.crew) as number) : undefined,
    staterooms: mapStaterooms(y.staterooms),
    cruisingArea: str(y.cruisingArea),
    ...(weeklyRate != null ? { currency, weeklyRate } : {}),
    weeklyRateIsFrom: y.weeklyRateIsFrom || undefined,
    ...(apaPct != null ? { apaPct } : {}),
    ...(apaAmount != null ? { apaAmount } : {}),
    ...(vatPct != null ? { vatPct } : {}),
    ...(vatAmount != null ? { vatAmount } : {}),
    ...(deliveryFee != null ? { deliveryFee } : {}),
    ...(totalAmount != null ? { totalAmount } : {}),
    notes: str(y.notes),
    keyFeatures: mapKeyFeatures(y.keyFeatures),
    leadImageUrl: str(y.leadImageUrl) ?? "",
    interiorImageUrl: str(y.interiorImageUrl) ?? str(y.leadImageUrl) ?? "",
    exteriorImageUrl: str(y.exteriorImageUrl) ?? str(y.leadImageUrl) ?? "",
    lifestyleImageUrl: str(y.lifestyleImageUrl) ?? str(y.leadImageUrl) ?? "",
    brochureUrl: str(y.brochureUrl) ?? "#",
  };
}

/**
 * The itinerary buttons to freeze into the published page: blank rows
 * dropped, text and URLs trimmed, capped at MAX_ITINERARY_LINKS. A draft
 * saved before several itineraries were possible carries one itineraryUrl
 * instead, which becomes the single link.
 */
function mapItineraryLinks(sections: PortalDraft["sections"]): ItineraryLink[] | undefined {
  const rows: Array<{ label?: string; url?: string }> = sections.itineraryLinks?.length
    ? sections.itineraryLinks
    : [{ url: sections.itineraryUrl }];
  const links: ItineraryLink[] = [];
  for (const row of rows) {
    const url = str(row.url);
    if (!url) continue;
    const label = str(row.label);
    links.push(label ? { label, url } : { url });
    if (links.length === MAX_ITINERARY_LINKS) break;
  }
  return links.length ? links : undefined;
}

export function draftToPageConfig(draft: PortalDraft, slug: string): PageConfig {
  const itineraryLinks = mapItineraryLinks(draft.sections);
  return {
    slug,
    clientNames: str(draft.clientNames) ?? "",
    season: str(draft.season) ?? "",
    region: str(draft.region) ?? "",
    headline: str(draft.headline) ?? "Yacht Charter Selection",
    subHeadline: str(draft.subHeadline),
    welcome: str(draft.welcome),
    yachts: draft.yachts.map(mapDraftYacht).filter((y): y is Yacht => y !== null),
    sections: {
      costs: draft.sections.costs,
      itinerary: draft.sections.itinerary,
      itineraryLinks,
      // Mirror the first link into the pre-multi-link field so a page
      // published now still renders if the app is ever rolled back.
      itineraryUrl: itineraryLinks?.[0]?.url,
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
    atlasUrl: CAMPAIGN_ATLAS_URL,
    theme: draft.theme === "light" ? "light" : "dark",
  };
}

export function draftSlugBase(draft: PortalDraft): string {
  return (
    slugify(`${draft.clientNames ?? ""} ${draft.season ?? ""}`) ||
    `presentation-${draft.id.slice(0, 8)}`
  );
}
