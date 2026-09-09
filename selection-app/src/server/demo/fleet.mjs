/**
 * Demo fleet — SERVER-ONLY.
 *
 * When YACHTFOLIO_PASSKEY is absent the fleet service answers from this set
 * instead of Yachtfolio, so the portal form and the client pages still render
 * (on Vercel previews, in local development, in review). The yachts are the
 * ones in the Tier 2 design export; every figure is demo data. Images are
 * the export's, cropped to 2000×1250 through the sharp pipeline once and
 * committed under public/assets/demo/.
 *
 * Ids sit far above Yachtfolio's so a demo yacht can never collide with a
 * real one; `source: "demo"` marks every record.
 */

export const DEMO_SOURCE = "demo";

/** True when the fleet must be served from demo data. */
export function isDemoFleet() {
  return !process.env.YACHTFOLIO_PASSKEY;
}

const img = (name) => ({ url: `/assets/demo/${name}.jpg`, smallUrl: `/assets/demo/${name}-sm.jpg` });

/** Gallery entries: [id, category, image name]. */
const gallery = (rows) =>
  rows.map(([id, category, name], i) => ({ id, category, ...img(name), filename: `${name}.jpg`, order: i }));

export const DEMO_YACHTS = [
  {
    id: 900001,
    name: "SERENITY",
    registryPort: "Valletta",
    lengthM: 38,
    yearRefit: "2019 / 2024",
    guests: 10,
    crew: 7,
    builder: "",
    staterooms: "5 (1 master, 3 double, 1 twin)",
    cruisingArea: "WEST MEDITERRANEAN, ITALY, AMALFI COAST",
    currency: "EUR",
    rates: { summer: [150000, 165000], winter: [120000, 130000] },
    description:
      "SERENITY pairs a light, contemporary interior with a crew who know the Amalfi Coast tender-by-tender. Her sun deck Jacuzzi and beach club at sea level make her a natural fit for a family week between Capri and Positano.",
    keyFeatures: ["Sun deck Jacuzzi", "Beach club at sea level", "Zero Speed Stabilizers", "Same Captain and crew as 2026"],
    gallery: gallery([
      [9100011, "FULL", "serenity-lead"],
      [9100012, "EXTERIOR", "yacht-aft-deck"],
      [9100013, "INTERIOR", "serenity-1"],
      [9100014, "LIFESTYLE", "serenity-2"],
      [9100015, "LIFESTYLE", "serenity-3"],
    ]),
  },
  {
    id: 900002,
    name: "LAFAYETTE",
    registryPort: "Cannes",
    lengthM: 36,
    yearRefit: "2024",
    guests: 10,
    crew: 6,
    builder: "Amer",
    staterooms: "5 (1 master, 2 double, 2 twin)",
    cruisingArea: "WEST MEDITERRANEAN, ITALY, SARDINIA",
    currency: "EUR",
    rates: { summer: [130000, 140000], winter: [105000, 110000] },
    description: "A sleek 2024 delivery from Amer, LAFAYETTE is quick, quiet and ideal for coastal hopping between the islands and the mainland.",
    keyFeatures: ["Delivered 2024", "Volvo IPS propulsion", "Full-beam master stateroom", "Large tender garage"],
    gallery: gallery([
      [9100021, "FULL", "lafayette-lead"],
      [9100022, "EXTERIOR", "yacht-exterior-2"],
      [9100023, "INTERIOR", "serenity-1"],
      [9100024, "LIFESTYLE", "yacht-aft-deck"],
    ]),
  },
  {
    id: 900003,
    name: "ETERNAL SPARK",
    registryPort: "Valletta",
    lengthM: 50,
    yearRefit: "2021",
    guests: 12,
    crew: 10,
    builder: "Bilgin Yachts",
    staterooms: "6 (1 master, 3 double, 2 twin)",
    cruisingArea: "WEST MEDITERRANEAN, ITALY, SARDINIA, CORSICA",
    currency: "EUR",
    rates: { summer: [334800, 360000], winter: [290000, 310000] },
    description: "A step up in every direction: a 50-metre Bilgin with a wellness deck, a vast beach club and a crew of 10 for 12 guests.",
    keyFeatures: ["Wellness deck with gym and sauna", "Vast beach club at sea level", "Crew of 10 for 12 guests", "Zero Speed Stabilizers"],
    gallery: gallery([
      [9100031, "FULL", "eternal-spark-lead"],
      [9100032, "EXTERIOR", "yacht-exterior-2"],
      [9100033, "INTERIOR", "eternal-spark-1"],
      [9100034, "LIFESTYLE", "eternal-spark-2"],
      [9100035, "LIFESTYLE", "eternal-spark-3"],
    ]),
  },
  {
    id: 900004,
    name: "DAMARI",
    registryPort: "Olbia",
    lengthM: 29,
    yearRefit: "2018 / 2023",
    guests: 10,
    crew: 5,
    builder: "Ferretti",
    staterooms: "5 (1 master, 2 double, 2 twin)",
    cruisingArea: "WEST MEDITERRANEAN, ITALY, SARDINIA",
    currency: "EUR",
    rates: { summer: [79000, 85000], winter: [65000, 70000] },
    description: "Effortless family charters with a devoted crew; DAMARI is compact enough for the small harbours of the Maddalena archipelago.",
    keyFeatures: ["Devoted family crew", "Fits the small harbours", "Fly bridge dining for 10", "Full watertoys inventory"],
    gallery: gallery([
      [9100041, "FULL", "damari-lead"],
      [9100042, "EXTERIOR", "yacht-aft-deck"],
      [9100043, "INTERIOR", "serenity-2"],
      [9100044, "LIFESTYLE", "eternal-spark-2"],
    ]),
  },
  {
    id: 900005,
    name: "LEMON NOT LIME",
    registryPort: "Palermo",
    lengthM: 30,
    yearRefit: "2022",
    guests: 10,
    crew: 5,
    builder: "Riva",
    staterooms: "5 (1 master, 2 double, 2 twin)",
    cruisingArea: "WEST MEDITERRANEAN, ITALY, SICILY",
    currency: "EUR",
    rates: { summer: [120000, 130000], winter: [95000, 100000] },
    description: "Riva glamour, sized for the islands: LEMON NOT LIME slips into Panarea and Salina where larger yachts anchor off.",
    keyFeatures: ["Riva 100 Corsaro", "Sized for the Aeolian harbours", "Open aft deck for alfresco dining", "Seabob and paddleboards"],
    gallery: gallery([
      [9100051, "FULL", "lemon-not-lime-lead"],
      [9100052, "EXTERIOR", "yacht-exterior-2"],
      [9100053, "INTERIOR", "eternal-spark-1"],
      [9100054, "LIFESTYLE", "serenity-3"],
    ]),
  },
  {
    id: 900006,
    name: "AURELIA",
    registryPort: "Valletta",
    lengthM: 44,
    yearRefit: "2017 / 2025",
    guests: 12,
    crew: 9,
    builder: "",
    staterooms: "6 (1 master, 3 double, 2 twin)",
    cruisingArea: "WEST MEDITERRANEAN, ITALY, SICILY, AMALFI COAST",
    currency: "EUR",
    rates: { summer: [195000, 210000], winter: [160000, 170000] },
    description: "Refitted in 2025, AURELIA carries 12 guests in six staterooms with a sky lounge that opens onto the upper deck.",
    keyFeatures: ["Refitted 2025", "Sky lounge opening to the upper deck", "Six staterooms for 12 guests", "Diving instructor on board"],
    gallery: gallery([
      [9100061, "FULL", "aurelia-lead"],
      [9100062, "EXTERIOR", "yacht-aft-deck"],
      [9100063, "INTERIOR", "eternal-spark-3"],
      [9100064, "LIFESTYLE", "serenity-2"],
    ]),
  },
];

const byId = new Map(DEMO_YACHTS.map((y) => [y.id, y]));

export function demoFleet() {
  return {
    syncedAt: new Date().toISOString(),
    count: DEMO_YACHTS.length,
    yachts: DEMO_YACHTS.map((y) => ({ id: y.id, name: y.name, registryPort: y.registryPort })),
    removed: {},
    source: DEMO_SOURCE,
  };
}

/** Same shape as the fleet service's getYachtDetail(). */
export function demoDetail(yfId) {
  const y = byId.get(Number(yfId));
  if (!y) return null;
  const opt = (pair) => ({ low: pair[0], high: pair[1], currency: y.currency, label: "" });
  return {
    yfId: y.id,
    fetchedAt: new Date().toISOString(),
    targetSeason: "summer 2027",
    name: y.name,
    lengthM: y.lengthM,
    yearRefit: y.yearRefit,
    guests: y.guests,
    crew: y.crew,
    builder: y.builder,
    staterooms: y.staterooms,
    cruisingArea: y.cruisingArea,
    currency: y.currency,
    weeklyRate: y.rates.summer[0],
    weeklyRateIsFrom: y.rates.summer[1] !== y.rates.summer[0],
    rateSeason: "summer",
    rateTier: "low",
    rateOptions: {
      summer: { ...opt(y.rates.summer), label: "Summer 2027" },
      winter: { ...opt(y.rates.winter), label: "Winter 2027" },
    },
    description: y.description,
    keyFeatures: y.keyFeatures,
    dataSource: DEMO_SOURCE,
    missing: y.builder ? [] : ["builder"],
    warnings: ["Demo data — YACHTFOLIO_PASSKEY is not configured on this server."],
    source: DEMO_SOURCE,
  };
}

/** Same shape as the fleet service's getYachtImages(). */
export function demoImages(yfId) {
  const y = byId.get(Number(yfId));
  if (!y) return null;
  const first = (cat) => y.gallery.find((g) => g.category === cat)?.url ?? "";
  return {
    yfId: y.id,
    fetchedAt: new Date().toISOString(),
    gallery: y.gallery.map(({ id, category, url, smallUrl, filename }) => ({ id, category, url, smallUrl, filename })),
    leadImageUrl: first("FULL") || first("EXTERIOR"),
    interiorImageUrl: first("INTERIOR") || first("FULL"),
    exteriorImageUrl: first("EXTERIOR") || first("FULL"),
    lifestyleImageUrl: first("LIFESTYLE") || first("FULL"),
    warnings: ["Demo images — YACHTFOLIO_PASSKEY is not configured on this server."],
    source: DEMO_SOURCE,
  };
}
