/**
 * The demo Personalised Atlas — SERVER-ONLY.
 *
 * "Mr and Mrs Harrington, summer 2027", the page in the Tier 2 design export,
 * rebuilt as a real Tier 2 draft: destinations from the 2027 Atlas snapshot
 * (Amalfi Coast, Sardinia, the Aeolian Islands), yachts from the demo fleet,
 * copy from the export. Two uses:
 *
 *  - /atlas/harrington-summer-2027 renders demoAtlasConfig() when no page has
 *    been published under that slug, so the build can be reviewed on a
 *    deployment with no storage and no Yachtfolio passkey;
 *  - the first dashboard load in demo mode seeds the same draft into the
 *    signed-in consultant's selections, so the Tier 2 form can be reviewed
 *    with real content in it.
 *
 * Every figure is demo data; APA is 35 per cent and the totals are computed
 * by the shared mapping, never typed in.
 */

import type { AtlasPageConfig } from "@/lib/types";
import type { AnySelection, ContentBlock, Tier2Draft, Tier2DraftYacht, Tier2DestinationDraft } from "@/lib/portal-types";
import { TIER2_DEFAULT_DISCLAIMER, emptyTier2Yacht } from "@/lib/portal-types";
import { tier2DraftToConfig } from "@/lib/atlas-map";
import { atlasCopyFor, atlasResolutionFor, getAtlasIndex, imageCandidates } from "@/server/atlas/content";
import { demoDetail, demoImages, isDemoFleet } from "./fleet.mjs";
import { createSelection, listSelections, saveSelection } from "../pages.mjs";
import type { ConsultantIdentity } from "../auth/types";

export const DEMO_TIER2_SLUG = "harrington-summer-2027";

const AMALFI = "mediterranean/italy/amalfi-coast";
const SARDINIA = "mediterranean/italy/sardinia";
const AEOLIAN = "mediterranean/italy/sicily/aeolian-islands";

const consultant = (v: string): ContentBlock => ({ value: v, source: "consultant" });
const atlas = (v: string): ContentBlock => ({ value: v, source: "atlas" });

function destination(id: string, edits: { eyebrow: string; deckLine: string; description?: string; note?: string; firstImage?: string }): Tier2DestinationDraft {
  const index = getAtlasIndex();
  const dest = index.byId.get(id);
  if (!dest) throw new Error(`Demo destination ${id} is not in the Atlas snapshot.`);
  const copy = atlasCopyFor(dest, index);
  const candidates = imageCandidates(dest, index);
  const images: [ContentBlock, ContentBlock] = [
    edits.firstImage ? consultant(edits.firstImage) : atlas(candidates[0] ?? ""),
    atlas(candidates.find((u) => u !== (edits.firstImage ?? candidates[0])) ?? candidates[0] ?? ""),
  ];
  return {
    destinationId: id,
    name: dest.name,
    eyebrow: consultant(edits.eyebrow),
    deckLine: consultant(edits.deckLine),
    description: edits.description ? consultant(edits.description) : atlas(copy.description),
    consultantNote: consultant(edits.note ?? ""),
    images,
    atlas: { ...copy, images: candidates, contentSource: "cache", fetchedAt: new Date().toISOString() },
  };
}

function yacht(
  yfId: number,
  edits: { destinations: string[]; known?: boolean; note: string; highlights: [string, string][] }
): Tier2DraftYacht {
  const detail = demoDetail(yfId);
  const images = demoImages(yfId);
  if (!detail || !images) throw new Error(`Demo yacht ${yfId} is missing.`);
  return {
    ...emptyTier2Yacht(`demo-${yfId}`),
    yfId,
    name: detail.name,
    lengthM: String(detail.lengthM),
    yearRefit: detail.yearRefit,
    guests: String(detail.guests),
    crew: String(detail.crew),
    staterooms: detail.staterooms,
    cruisingArea: detail.cruisingArea,
    currency: detail.currency,
    weeklyRate: String(detail.weeklyRate),
    weeklyRateIsFrom: false,
    rateOptions: detail.rateOptions,
    gallery: images.gallery,
    leadImageUrl: images.leadImageUrl,
    interiorImageUrl: images.interiorImageUrl,
    exteriorImageUrl: images.exteriorImageUrl,
    lifestyleImageUrl: images.lifestyleImageUrl,
    destinationIds: edits.destinations,
    knownYacht: Boolean(edits.known),
    consultantNote: edits.note,
    highlights: [
      { title: edits.highlights[0][0], line: edits.highlights[0][1] },
      { title: edits.highlights[1][0], line: edits.highlights[1][1] },
      { title: edits.highlights[2][0], line: edits.highlights[2][1] },
    ],
  };
}

/** The Harrington draft, owned by whoever it is seeded for. */
export function demoTier2Draft(): Omit<Tier2Draft, "id" | "owner" | "createdAt" | "updatedAt"> {
  return {
    tier: 2,
    clientNames: "Mr and Mrs Harrington",
    slug: DEMO_TIER2_SLUG,
    clientGreeting: "Mr and Mrs Harrington, your summer 2027.",
    introNote:
      "Last July you cruised the Amalfi Coast aboard SERENITY. As one of the first to secure your dates last season, I wanted you to see the 2027 season before we open it more widely.",
    seasonNote: {
      eyebrow: "A NOTE ON JULY",
      body:
        "You chartered in the third week of July, consistently the most requested week of the Mediterranean season. Owners are confirming 2027 calendars now, and the strongest yachts typically commit their July weeks before Christmas.",
    },
    footerDisclaimer: TIER2_DEFAULT_DISCLAIMER,
    destinations: [
      destination(AMALFI, {
        eyebrow: "RETURN, BUT DEEPER",
        deckLine: "The coast you know, the corners you missed",
        description:
          "You will know the shape of this coast already: the watchtowers, the lemon terraces, Positano’s campanile appearing behind the headland. What rewards a return is everything the day visitors never reach.",
        note: "I would expect SERENITY’s July weeks to be committed before Christmas.",
        firstImage: "/assets/demo/amalfi-coast-1.jpg",
      }),
      destination(SARDINIA, {
        eyebrow: "THE NATURAL NEXT STEP",
        deckLine: "Two islands, one week, no repetition",
      }),
      destination(AEOLIAN, {
        eyebrow: "THE ROAD LESS TRAVELLED",
        deckLine: "Seven volcanic islands north of Sicily",
        note: "I have one further candidate holding a Sicily season, worth a conversation rather than a card.",
      }),
    ],
    yachts: [
      yacht(900001, {
        destinations: [AMALFI],
        known: true,
        note: "Same Captain, same crew, and the corners you missed.",
        highlights: [
          ["LO SCOGLIO, NERANO", "Lunch on the water, reached only by tender"],
          ["DA ADOLFO, POSITANO", "No road access, so you arrive by boat"],
          ["LI GALLI AT FIRST LIGHT", "An early-morning swim before the day boats arrive"],
        ],
      }),
      yacht(900002, {
        destinations: [AMALFI, SARDINIA],
        note: "Sleek 2024 delivery, ideal for coastal hopping.",
        highlights: [
          ["DELIVERED 2024", "The newest yacht on this shortlist"],
          ["QUIET AT ANCHOR", "Volvo IPS and Zero Speed Stabilizers"],
          ["FULL-BEAM MASTER", "The master stateroom runs the width of the yacht"],
        ],
      }),
      yacht(900003, {
        destinations: [SARDINIA],
        note: "A step up in every direction: wellness deck, vast beach club.",
        highlights: [
          ["THE MADDALENA ARCHIPELAGO", "A marine reserve of pink-sand islets"],
          ["BONIFACIO", "A citadel carved into Corsica’s white cliffs"],
          ["CALA COTICCIO, CAPRERA", "At its best early in the morning"],
        ],
      }),
      yacht(900004, {
        destinations: [SARDINIA],
        note: "Effortless family charters with a devoted crew.",
        highlights: [
          ["SMALL-HARBOUR FRIENDLY", "Fits where the 50-metre yachts anchor off"],
          ["FLY BRIDGE DINING", "Ten at the table under the Bimini"],
          ["WATERTOYS", "Seabobs, paddleboards and a donut for the children"],
        ],
      }),
      yacht(900005, {
        destinations: [AEOLIAN],
        note: "Riva glamour, sized for the islands.",
        highlights: [
          ["STROMBOLI AFTER DARK", "The crater watched from the water"],
          ["CALA JUNCO, PANAREA", "A natural amphitheatre of green stone"],
          ["SALINA", "Malvasia tastings above the sea"],
        ],
      }),
      yacht(900006, {
        destinations: [AEOLIAN, AMALFI],
        note: "Refitted in 2025, with a sky lounge that opens onto the upper deck.",
        highlights: [
          ["SIX STATEROOMS", "Room for 12 guests across two families"],
          ["SKY LOUNGE", "Opens fully onto the upper deck"],
          ["DIVING INSTRUCTOR", "Certified instruction on board for the Aeolian reefs"],
        ],
      }),
    ],
    consultant: {
      name: "Lucy",
      title: "Charter Consultant, Ocean Independence",
      phone: "+41 44 000 00 00",
      email: "lucy@oceanindependence.com",
      whatsapp: "https://wa.me/41440000000",
      photoUrl: "/assets/demo/lucy-photo.jpg",
    },
  };
}

/** The published-shape config the demo page renders (same mapping as publish). */
export function demoAtlasConfig(): AtlasPageConfig {
  const now = new Date().toISOString();
  const draft: Tier2Draft = { ...demoTier2Draft(), id: "demo-harrington", createdAt: now, updatedAt: now };
  const ids = draft.destinations.map((d) => d.destinationId).filter((x): x is string => Boolean(x));
  return tier2DraftToConfig(draft, DEMO_TIER2_SLUG, atlasResolutionFor(ids));
}

/** Whether /atlas/<slug> may fall back to the demo page (DEMO_PAGES=false disables it). */
export function demoPagesEnabled(): boolean {
  return String(process.env.DEMO_PAGES ?? "true").toLowerCase() !== "false";
}

/**
 * Demo mode, first dashboard load, nothing there yet: seed the Harrington
 * draft so the Tier 2 form opens with content. Returns the seeded draft or
 * null when nothing was done.
 */
export async function seedDemoSelection(identity: ConsultantIdentity): Promise<AnySelection | null> {
  if (!isDemoFleet() || !demoPagesEnabled()) return null;
  const existing = (await listSelections(identity)) as Array<{ id: string }>;
  if (existing.length) return null;
  const created = (await createSelection(identity, { tier: 2 })) as Tier2Draft;
  const seeded = {
    ...demoTier2Draft(),
    id: created.id,
    owner: created.owner,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
    consultant: {
      ...demoTier2Draft().consultant,
      name: identity.name || "Lucy",
      email: identity.email || "lucy@oceanindependence.com",
    },
  };
  return (await saveSelection(identity, created.id, seeded)) as AnySelection;
}
