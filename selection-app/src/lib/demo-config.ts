import type { PageConfig, Yacht } from "./types";
import generatedData from "../../data/yachts.json";

/**
 * Demo content matching the design handoff prototype (Mr and Mrs Harrington,
 * consultant Lucy). In production this object is fetched per client from the
 * Charter Portal API — see getPageConfig().
 */

const DEMO_THUMBS = {
  interior: "/assets/demo-interior.jpg",
  exterior: "/assets/demo-deck.jpg",
  lifestyle: "/assets/demo-lifestyle.jpg",
};

/**
 * Demo builder: fills image defaults and computes the frozen price
 * components (APA at the given percentage, TOTAL = rate + APA; VAT stays TBC)
 * exactly as the publish mapping does, so demo pages render via the same
 * stored-amount path as real ones.
 */
function demoYacht(
  y: Omit<
    Yacht,
    | "apaAmount"
    | "vatAmount"
    | "totalAmount"
    | "leadImageUrl"
    | "interiorImageUrl"
    | "exteriorImageUrl"
    | "lifestyleImageUrl"
    | "brochureUrl"
  > &
    Partial<Pick<Yacht, "interiorImageUrl" | "exteriorImageUrl" | "lifestyleImageUrl">>
): Yacht {
  const currency = y.currency ?? "EUR";
  const apaPct = y.apaPct ?? 35;
  const apaAmount = y.weeklyRate != null ? Math.round((y.weeklyRate * apaPct) / 100) : undefined;
  const totalAmount = y.weeklyRate != null ? y.weeklyRate + (apaAmount ?? 0) : undefined;
  return {
    leadImageUrl: `/assets/drops/ys-${y.id}-lead.webp`,
    interiorImageUrl: DEMO_THUMBS.interior,
    exteriorImageUrl: DEMO_THUMBS.exterior,
    lifestyleImageUrl: DEMO_THUMBS.lifestyle,
    brochureUrl: "#",
    ...y,
    currency,
    apaPct,
    ...(apaAmount != null ? { apaAmount } : {}),
    ...(totalAmount != null ? { totalAmount } : {}),
  };
}

const yachts: Yacht[] = [
  demoYacht({
    id: "serenity",
    name: "SERENITY",
    tagline: "THE YACHT YOU KNOW",
    lengthM: 47,
    yearRefit: "2019 / 2024",
    guests: 12,
    staterooms: { count: 6, breakdown: "5 double, 1 twin" },
    cruisingArea: "AMALFI COAST",
    availability: "July on request, August open",
    weeklyRate: 245000,
    notes: "The yacht you know. I would expect her July weeks to be committed before Christmas.",
    interiorImageUrl: "/assets/drops/ys-serenity-t1.webp",
    exteriorImageUrl: "/assets/drops/ys-serenity-t2.webp",
    lifestyleImageUrl: "/assets/drops/ys-serenity-t3.webp",
  }),
  demoYacht({
    id: "eternal-spark",
    name: "ETERNAL SPARK",
    tagline: "WELLNESS FLAGSHIP",
    lengthM: 50,
    yearRefit: "2023",
    guests: 12,
    staterooms: { count: 6, breakdown: "5 double, 1 twin" },
    cruisingArea: "TURKISH RIVIERA",
    availability: "Open for summer 2027",
    weeklyRate: 334800,
    notes: "Worth stretching for — a wellness-focused flagship with a vast beach club.",
    interiorImageUrl: "/assets/drops/ys-eternal-spark-t1.webp",
    exteriorImageUrl: "/assets/drops/ys-eternal-spark-t2.webp",
    lifestyleImageUrl: "/assets/drops/ys-eternal-spark-t3.webp",
  }),
  demoYacht({
    id: "lafayette",
    name: "LAFAYETTE",
    tagline: "COASTAL PACE",
    lengthM: 36,
    yearRefit: "2024",
    guests: 10,
    staterooms: { count: 5, breakdown: "4 double, 1 twin" },
    cruisingArea: "FRENCH RIVIERA",
    availability: "Open except the second week of August",
    weeklyRate: 130000,
    notes: "A sleek 2024 delivery, ideal if you fancy coastal hopping at pace.",
  }),
  demoYacht({
    id: "damari",
    name: "DAMARI",
    tagline: "THE FAMILY FAVOURITE",
    lengthM: 29,
    yearRefit: "2018 / 2023",
    guests: 10,
    staterooms: { count: 5, breakdown: "3 double, 2 twin" },
    cruisingArea: "SARONIC & CYCLADES",
    availability: "Open for summer 2027",
    weeklyRate: 79000,
    notes: "Effortless and warm, with a devoted crew — my clients’ family favourite.",
  }),
  demoYacht({
    id: "aurelia",
    name: "AURELIA",
    tagline: "BALEARICS PROVEN",
    lengthM: 44,
    yearRefit: "2021",
    guests: 12,
    staterooms: { count: 6, breakdown: "4 double, 2 twin" },
    cruisingArea: "THE BALEARICS",
    availability: "Open for summer 2027",
    weeklyRate: 195000,
    notes: "A proven Balearics performer — her crew know every cala worth anchoring in.",
  }),
  demoYacht({
    id: "white-heron",
    name: "WHITE HERON",
    tagline: "FRESH FROM REFIT",
    lengthM: 40,
    yearRefit: "2017 / 2025",
    guests: 11,
    staterooms: { count: 5, breakdown: "4 double, 1 convertible" },
    cruisingArea: "THE ADRIATIC",
    availability: "Open except the final week of July",
    weeklyRate: 120000,
    notes: "Fresh from her 2025 refit — the Adriatic option if you fancy somewhere new.",
  }),
  demoYacht({
    id: "calypso-blue",
    name: "CALYPSO BLUE",
    tagline: "THE IONIAN, GENTLY",
    lengthM: 38,
    yearRefit: "2020",
    guests: 10,
    staterooms: { count: 5, breakdown: "3 double, 2 twin" },
    cruisingArea: "IONIAN ISLANDS",
    availability: "Open for summer 2027",
    weeklyRate: 105000,
    notes: "The Ionian at an easy pace — quiet anchorages and long lunches.",
  }),
  demoYacht({
    id: "mistral",
    name: "MISTRAL",
    tagline: "RIVIERA QUICK",
    lengthM: 33,
    yearRefit: "2019",
    guests: 8,
    staterooms: { count: 4, breakdown: "2 double, 2 twin" },
    cruisingArea: "FRENCH RIVIERA",
    availability: "July on request",
    weeklyRate: 88000,
    notes: "Compact, quick and glamorous — made for the Riviera’s short hops.",
  }),
  demoYacht({
    id: "alba",
    name: "ALBA",
    tagline: "SMERALDA CHARM",
    lengthM: 31,
    yearRefit: "2022",
    guests: 8,
    staterooms: { count: 4, breakdown: "3 double, 1 twin" },
    cruisingArea: "SARDINIA & CORSICA",
    availability: "Open for summer 2027",
    weeklyRate: 92000,
    notes: "A young boat with an easy charm — the Costa Smeralda suits her.",
  }),
  demoYacht({
    id: "odysseia",
    name: "ODYSSEA",
    tagline: "CYCLADES COMPLETE",
    lengthM: 42,
    yearRefit: "2016 / 2024",
    guests: 12,
    staterooms: { count: 6, breakdown: "5 double, 1 twin" },
    cruisingArea: "THE CYCLADES",
    availability: "Open for summer 2027",
    weeklyRate: 150000,
    notes: "The Cyclades done properly — she carries every watertoy your family could ask for.",
  }),
];

/**
 * data/yachts.json is generated at build time by scripts/fetch-yachtfolio.mjs.
 * When it carries real Yachtfolio data, it replaces the invented demo yachts;
 * otherwise (no passkey, staging) the demo content above keeps the page alive.
 */
interface GeneratedYachtData {
  source: string;
  yachts: Yacht[];
}
const generated = generatedData as unknown as GeneratedYachtData;
const activeYachts: Yacht[] =
  generated.source === "yachtfolio" && generated.yachts.length > 0 ? generated.yachts : yachts;

export const demoConfig: PageConfig = {
  slug: "harrington-summer-2027",
  clientNames: "Mr and Mrs Harrington",
  season: "Summer 2027",
  region: "Mediterranean",
  headline: "Yacht Charter Selection",
  yachts: activeYachts,
  sections: {
    costs: true,
    itinerary: true,
    itineraryUrl: "/personalised-atlas/",
    compare: true,
  },
  consultant: {
    name: "Lucy",
    title: "CHARTER CONSULTANT, OCEAN INDEPENDENCE",
    phone: "+41 44 000 00 00",
    email: "lucy@ocyachts.com",
    whatsapp: "https://wa.me/41440000000",
    photoUrl: "/assets/drops/lucy-photo.webp",
  },
  atlasUrl: "/atlas/",
};

const configs: Record<string, PageConfig> = {
  [demoConfig.slug]: demoConfig,
};

/**
 * Swap point for the Charter Portal API: replace the record lookup with a
 * fetch of the published page config for this client slug.
 */
export async function getPageConfig(slug: string): Promise<PageConfig | null> {
  return configs[slug] ?? null;
}

export function getAllSlugs(): string[] {
  return Object.keys(configs);
}
