import type { PageConfig, Yacht } from "./types";

/**
 * Demo content matching the design handoff prototype (Mr and Mrs Harrington,
 * consultant Lucy). In production this object is fetched per client from the
 * Charter Portal API — see getPageConfig().
 */

const DEMO_THUMBS = {
  interior: "/assets/demo-interior.jpg",
  deck: "/assets/demo-deck.jpg",
  watertoys: "/assets/demo-lifestyle.jpg",
};

function demoYacht(
  y: Omit<
    Yacht,
    "apaPct" | "leadImageUrl" | "interiorImageUrl" | "deckImageUrl" | "watertoysImageUrl" | "brochureUrl"
  > &
    Partial<Pick<Yacht, "interiorImageUrl" | "deckImageUrl" | "watertoysImageUrl">>
): Yacht {
  return {
    apaPct: 35,
    leadImageUrl: `/assets/drops/ys-${y.id}-lead.webp`,
    interiorImageUrl: DEMO_THUMBS.interior,
    deckImageUrl: DEMO_THUMBS.deck,
    watertoysImageUrl: DEMO_THUMBS.watertoys,
    brochureUrl: "#",
    ...y,
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
    location: "Naples, Italy",
    cruisingArea: "AMALFI COAST",
    availability: "July on request, August open",
    weeklyRateEUR: 245000,
    notes: "The yacht you know. I would expect her July weeks to be committed before Christmas.",
    interiorImageUrl: "/assets/drops/ys-serenity-t1.webp",
    deckImageUrl: "/assets/drops/ys-serenity-t2.webp",
    watertoysImageUrl: "/assets/drops/ys-serenity-t3.webp",
  }),
  demoYacht({
    id: "eternal-spark",
    name: "ETERNAL SPARK",
    tagline: "WELLNESS FLAGSHIP",
    lengthM: 50,
    yearRefit: "2023",
    guests: 12,
    staterooms: { count: 6, breakdown: "5 double, 1 twin" },
    location: "Bodrum, Turkey",
    cruisingArea: "TURKISH RIVIERA",
    availability: "Open for summer 2027",
    weeklyRateEUR: 334800,
    notes: "Worth stretching for — a wellness-focused flagship with a vast beach club.",
    interiorImageUrl: "/assets/drops/ys-eternal-spark-t1.webp",
    deckImageUrl: "/assets/drops/ys-eternal-spark-t2.webp",
    watertoysImageUrl: "/assets/drops/ys-eternal-spark-t3.webp",
  }),
  demoYacht({
    id: "lafayette",
    name: "LAFAYETTE",
    tagline: "COASTAL PACE",
    lengthM: 36,
    yearRefit: "2024",
    guests: 10,
    staterooms: { count: 5, breakdown: "4 double, 1 twin" },
    location: "Cannes, France",
    cruisingArea: "FRENCH RIVIERA",
    availability: "Open except the second week of August",
    weeklyRateEUR: 130000,
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
    location: "Athens, Greece",
    cruisingArea: "SARONIC & CYCLADES",
    availability: "Open for summer 2027",
    weeklyRateEUR: 79000,
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
    location: "Palma, Spain",
    cruisingArea: "THE BALEARICS",
    availability: "Open for summer 2027",
    weeklyRateEUR: 195000,
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
    location: "Split, Croatia",
    cruisingArea: "THE ADRIATIC",
    availability: "Open except the final week of July",
    weeklyRateEUR: 120000,
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
    location: "Corfu, Greece",
    cruisingArea: "IONIAN ISLANDS",
    availability: "Open for summer 2027",
    weeklyRateEUR: 105000,
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
    location: "Saint-Tropez, France",
    cruisingArea: "FRENCH RIVIERA",
    availability: "July on request",
    weeklyRateEUR: 88000,
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
    location: "Olbia, Sardinia",
    cruisingArea: "SARDINIA & CORSICA",
    availability: "Open for summer 2027",
    weeklyRateEUR: 92000,
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
    location: "Mykonos, Greece",
    cruisingArea: "THE CYCLADES",
    availability: "Open for summer 2027",
    weeklyRateEUR: 150000,
    notes: "The Cyclades done properly — she carries every watertoy your family could ask for.",
  }),
];

export const demoConfig: PageConfig = {
  slug: "harrington-summer-2027",
  clientNames: "Mr and Mrs Harrington",
  season: "Summer 2027",
  region: "Mediterranean",
  headline: "Yacht Charter Selection",
  yachts,
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
