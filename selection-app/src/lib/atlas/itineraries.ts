/**
 * The website's sample itineraries, as the client pages use them.
 *
 * Source of truth is the website: `data/destinations.json` carries every
 * itinerary page verbatim (`AtlasSnapshot.itineraries`, refreshed by
 * `npm run import:itineraries`) and which destination pages link to each.
 * `content/itinerary-stops.json` carries the reviewed coordinates of the
 * places named in each day heading (`npm run geocode:itineraries`, a one-off
 * with hand corrections kept). `npm run build:itineraries` — also a prebuild
 * step — joins the two into `data/itineraries.json`, per destination.
 *
 * Tier 2 freezes a destination's routes into the published page
 * (src/server/atlas/content.ts → itinerariesFor); this module is the shared
 * shape and the client-side loader.
 */

import type { RoutePoint } from "./globe";

/** A located place named in a day heading. */
export interface ItineraryPoint {
  name: string;
  lat: number;
  lon: number;
}

/**
 * One DAY TO DAY entry: the heading as the website wrote it ("Bonifacio -
 * Maddalena Islands", a leg), its narrative, and the heading's places located
 * in order — the last is where the day ends.
 */
export interface ItineraryStop {
  day: number;
  /** Present when the heading covers several days ("Day One - Three") */
  dayEnd?: number;
  heading: string;
  text: string;
  points: ItineraryPoint[];
}

export interface Itinerary {
  /** The page's slug, e.g. "rome-to-naples" */
  id: string;
  url: string;
  title: string;
  days: number;
  /** Introductory paragraphs, verbatim */
  intro: string[];
  heroImage: string | null;
  /** The card blurb on the destination page that links here, where one exists */
  teaser?: string;
  stops: ItineraryStop[];
}

export interface ItinerariesData {
  generatedAt: string;
  /** destination id → its itineraries, in the website's order */
  destinations: Record<string, Itinerary[]>;
}

/** The aggregate is a separate chunk, fetched alongside the destination snapshot. */
export async function loadItineraries(): Promise<ItinerariesData> {
  const mod = await import("../../../data/itineraries.json");
  return mod.default as unknown as ItinerariesData;
}

/** Every located place along the route, in order, consecutive repeats dropped. */
export function routePoints(it: Itinerary): RoutePoint[] {
  const out: RoutePoint[] = [];
  for (const s of it.stops) {
    for (const p of s.points) {
      const last = out[out.length - 1];
      if (last && last.lat === p.lat && last.lon === p.lon) continue;
      out.push({ lat: p.lat, lon: p.lon, day: s.day, place: p.name });
    }
  }
  return out;
}

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

/** "SEVEN DAYS" / "12 DAYS" — house style for the card label. */
export function daysLabel(n: number): string {
  return `${n < 10 ? WORDS[n] : String(n)} ${n === 1 ? "day" : "days"}`.toUpperCase();
}
